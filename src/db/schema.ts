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
} from "drizzle-orm/pg-core";

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
  openTime: time("open_time"),
  closeTime: time("close_time"),
  isOpen: boolean("is_open").notNull().default(true),
});

export const blockedDates = pgTable("blocked_dates", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  reason: varchar("reason", { length: 255 }).default(""),
});

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
    appointmentTime: time("appointment_time").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    notes: text("notes").default(""),
    // Unguessable handle for customer-facing confirmation/manage links, so those
    // pages never expose a booking by its sequential integer id.
    confirmationToken: varchar("confirmation_token", { length: 64 })
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    reminderSentAt: timestamp("reminder_sent_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    appointmentDateIdx: index("bookings_appointment_date_idx").on(t.appointmentDate),
    statusIdx: index("bookings_status_idx").on(t.status),
    serviceIdIdx: index("bookings_service_id_idx").on(t.serviceId),
    confirmationTokenIdx: index("bookings_confirmation_token_idx").on(t.confirmationToken),
  }),
);

export const adminSettings = pgTable("admin_settings", {
  key: varchar("key", { length: 255 }).primaryKey(),
  value: text("value").notNull(),
});
