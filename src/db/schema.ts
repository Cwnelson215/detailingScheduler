import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  boolean,
  date,
  time,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { generateJobId } from "../lib/job-id";

export const services = pgTable("services", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description").notNull().default(""),
  durationMins: integer("duration_mins").notNull(),
  priceCents: integer("price_cents").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const businessHours = pgTable("business_hours", {
  id: serial("id").primaryKey(),
  dayOfWeek: integer("day_of_week").notNull(), // 0=Sunday, 6=Saturday
  // Deprecated: the legacy open→close model. Kept so the additive migration is reversible
  // and old data isn't lost, but no longer read — availability now uses the window columns.
  openTime: time("open_time"),
  closeTime: time("close_time"),
  // Whole-day master switch. A day is closed (no drop-off windows) when this is false.
  isOpen: boolean("is_open").notNull().default(true),
  // Two fixed drop-off windows per day. A window is offered to customers only when its
  // *_enabled flag is set and its start/end are populated. Saturday = morning only, etc.
  morningEnabled: boolean("morning_enabled").notNull().default(true),
  morningStart: time("morning_start"),
  morningEnd: time("morning_end"),
  eveningEnabled: boolean("evening_enabled").notNull().default(false),
  eveningStart: time("evening_start"),
  eveningEnd: time("evening_end"),
});

// Deprecated: the legacy denylist of unavailable dates. No longer read or written — the
// availability model was inverted to an allowlist (see `availableDates`). Kept so existing
// data isn't dropped and the migration stays reversible.
export const blockedDates = pgTable("blocked_dates", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  reason: varchar("reason", { length: 255 }).default(""),
});

// Allowlist of dates the shop is open for booking. A date is bookable only if it has a row
// here; everything is unavailable by default. The admin opens dates from the Schedule page.
// Each opened date carries its OWN drop-off windows (seeded from the per-weekday
// `businessHours` template when the date is opened, then editable per date) — those columns,
// not the weekday template, are authoritative for customer-facing availability.
export const availableDates = pgTable(
  "available_dates",
  {
    id: serial("id").primaryKey(),
    date: date("date").notNull(),
    // Two fixed drop-off windows for this specific date. A window is offered to customers only
    // when its *_enabled flag is set and its start/end are populated. Mirrors businessHours.
    morningEnabled: boolean("morning_enabled").notNull().default(false),
    morningStart: time("morning_start"),
    morningEnd: time("morning_end"),
    eveningEnabled: boolean("evening_enabled").notNull().default(false),
    eveningStart: time("evening_start"),
    eveningEnd: time("evening_end"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    dateIdx: uniqueIndex("available_dates_date_idx").on(t.date),
  }),
);

export const bookings = pgTable(
  "bookings",
  {
    id: serial("id").primaryKey(),
    serviceId: integer("service_id")
      .notNull()
      .references(() => services.id),
    customerName: varchar("customer_name", { length: 255 }).notNull(),
    customerEmail: varchar("customer_email", { length: 255 }).notNull(),
    customerPhone: varchar("customer_phone", { length: 50 }).notNull(),
    vehicleYear: varchar("vehicle_year", { length: 4 }).notNull(),
    vehicleMake: varchar("vehicle_make", { length: 100 }).notNull(),
    vehicleModel: varchar("vehicle_model", { length: 100 }).notNull(),
    appointmentDate: date("appointment_date").notNull(),
    // The window's start time, resolved server-side from business_hours at booking time.
    // Kept populated so existing display/email code keeps rendering a concrete time.
    appointmentTime: time("appointment_time").notNull(),
    // Which fixed drop-off window this booking occupies. The explicit column (rather than
    // inferring from appointmentTime) keeps the one-car-per-window check correct even if
    // the admin later edits a window's times.
    dropoffWindow: varchar("dropoff_window", { length: 10 }).notNull().$type<"morning" | "evening">(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    notes: text("notes").default(""),
    // Unguessable handle for customer-facing confirmation/manage links, so those
    // pages never expose a booking by its sequential integer id.
    confirmationToken: varchar("confirmation_token", { length: 64 })
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    // Short, human-typeable handle a customer enters (with their email) to look up and
    // manage their booking. Unique, unguessable. Typed nullable so the additive migration's
    // pre-backfill window type-checks; the DB enforces NOT NULL once existing rows are filled.
    jobId: varchar("job_id", { length: 16 }).$defaultFn(generateJobId),
    reminderSentAt: timestamp("reminder_sent_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    appointmentDateIdx: index("bookings_appointment_date_idx").on(t.appointmentDate),
    statusIdx: index("bookings_status_idx").on(t.status),
    serviceIdIdx: index("bookings_service_id_idx").on(t.serviceId),
    confirmationTokenIdx: index("bookings_confirmation_token_idx").on(t.confirmationToken),
    jobIdIdx: uniqueIndex("bookings_job_id_idx").on(t.jobId),
  }),
);

export const bookingMessages = pgTable(
  "booking_messages",
  {
    id: serial("id").primaryKey(),
    bookingId: integer("booking_id")
      .notNull()
      .references(() => bookings.id),
    sender: varchar("sender", { length: 10 }).notNull(), // 'customer' | 'owner'
    // Message body encrypted at rest with AES-256-GCM (see lib/crypto.ts). All base64.
    ciphertext: text("ciphertext").notNull(),
    iv: varchar("iv", { length: 32 }).notNull(),
    authTag: varchar("auth_tag", { length: 32 }).notNull(),
    readAt: timestamp("read_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    bookingIdIdx: index("booking_messages_booking_id_idx").on(t.bookingId),
  }),
);

// One-time codes that step a customer up from the email-only "view" tier to the manage
// tier. Issued when a customer enters their Job ID on the view page; emailed to the booking's
// address. Stored hashed (never plaintext), single-use, time-boxed, attempt-limited.
export const customerVerificationCodes = pgTable(
  "customer_verification_codes",
  {
    id: serial("id").primaryKey(),
    bookingId: integer("booking_id")
      .notNull()
      .references(() => bookings.id),
    // SHA-256 hex of the 6-digit code — we never persist the code itself.
    codeHash: varchar("code_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    consumedAt: timestamp("consumed_at"),
    attempts: integer("attempts").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    bookingIdIdx: index("customer_verification_codes_booking_id_idx").on(t.bookingId),
  }),
);

export const adminSettings = pgTable("admin_settings", {
  key: varchar("key", { length: 255 }).primaryKey(),
  value: text("value").notNull(),
});
