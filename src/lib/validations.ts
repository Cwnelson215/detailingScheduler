import { z } from "zod";
import { formatPhone, isUsPhone } from "./format";

function isRealCalendarDate(s: string): boolean {
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function isNotInPast(s: string): boolean {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return s >= today;
}

function isRealTimeOfDay(s: string): boolean {
  const [h, m] = s.split(":").map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

// Email is normalized at the schema boundary (trim + lowercase) so storage and the
// case-insensitive lookup/auth comparisons stay consistent. See normalizeEmail in
// lib/customer-session.ts (still used on the lookup path).
const emailField = z.string().trim().toLowerCase().email("Invalid email address");

// Required US phone: validates exactly 10 digits, then stores the canonical "(555) 123-4567"
// form regardless of how it was typed (the client masks to the same shape).
const usPhoneField = z
  .string()
  .min(1, "Phone is required")
  .max(50)
  .refine(isUsPhone, "Enter a valid 10-digit US phone number")
  .transform(formatPhone);

const appointmentDateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format")
  .refine(isRealCalendarDate, "Not a real calendar date")
  .refine(isNotInPast, "Date cannot be in the past");

const timeOfDayField = z
  .string()
  .regex(/^\d{2}:\d{2}$/, "Invalid time format")
  .refine(isRealTimeOfDay, "Not a valid time of day");

// Customers pick a drop-off window, not a specific minute. The server resolves the actual
// time from the day's business_hours, so the booking payload only carries the window key.
export const dropoffWindowField = z.enum(["morning", "evening"]);

export const bookingStatusValues = ["pending", "confirmed", "ready", "completed", "cancelled"] as const;

// An optional discount/referral code typed by a customer. Trimmed + uppercased; a blank
// string (the form's empty default) becomes undefined so it's treated as "no code".
const optionalCodeField = z
  .string()
  .trim()
  .toUpperCase()
  .max(50)
  .optional()
  .transform((v) => (v ? v : undefined));

export const bookingSchema = z.object({
  serviceId: z.number().int().positive(),
  customerName: z.string().min(1, "Name is required").max(255),
  customerEmail: emailField,
  customerPhone: usPhoneField,
  vehicleYear: z.string().regex(/^\d{4}$/, "Must be a 4-digit year"),
  vehicleMake: z.string().min(1, "Make is required").max(100),
  vehicleModel: z.string().min(1, "Model is required").max(100),
  appointmentDate: appointmentDateField,
  dropoffWindow: dropoffWindowField,
  notes: z.string().max(1000).optional().default(""),
  // Optional codes entered at booking. promoCode discounts THIS booking (e.g. the 10%
  // "first N"); referralCode is a friend's personal code and credits THE FRIEND (the enterer
  // gets nothing). One UI field posts whichever the customer typed; the server auto-detects.
  // Blank strings from the form collapse to undefined.
  promoCode: optionalCodeField,
  referralCode: optionalCodeField,
});

// Admin-only updates to an existing booking (status change, reschedule, notes edit).
export const bookingUpdateSchema = z
  .object({
    status: z.enum(bookingStatusValues).optional(),
    notes: z.string().max(1000).optional(),
    appointmentDate: appointmentDateField.optional(),
    dropoffWindow: dropoffWindowField.optional(),
  })
  .refine((d) => Object.keys(d).length > 0, "No valid fields to update");

// Customer looks up their bookings with just the email on file (view tier). Managing a
// booking then requires the Job ID + an emailed code (see verifyCodeSchema).
export const lookupSchema = z.object({
  email: emailField,
});

// Step-up: the 6-digit one-time code emailed to the booking's address. The Job ID comes
// from the request path, so it isn't part of this body.
export const verifyCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
});

// Customer self-service edits to their own booking. Unlike the admin bookingUpdateSchema
// there is no `status`/`notes`: a customer may reschedule, edit their contact/vehicle
// details, and cancel (via the `cancel` flag) — nothing else.
export const customerManageSchema = z
  .object({
    appointmentDate: appointmentDateField.optional(),
    dropoffWindow: dropoffWindowField.optional(),
    customerName: z.string().min(1, "Name is required").max(255).optional(),
    customerEmail: emailField.optional(),
    customerPhone: usPhoneField.optional(),
    vehicleYear: z.string().regex(/^\d{4}$/, "Must be a 4-digit year").optional(),
    vehicleMake: z.string().min(1, "Make is required").max(100).optional(),
    vehicleModel: z.string().min(1, "Model is required").max(100).optional(),
    cancel: z.literal(true).optional(),
    // Redeem / un-redeem a 15% referral token (from the customer's bank) against this booking.
    applyReferralToken: z.literal(true).optional(),
    removeReferralToken: z.literal(true).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, "No fields to update");

export const chatMessageSchema = z.object({
  body: z.string().min(1, "Message is required").max(2000),
});

export const contactSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  email: emailField,
  message: z.string().min(1, "Message is required").max(2000),
});

export const serviceSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().max(2000).default(""),
  durationMins: z.number().int().min(15, "Minimum 15 minutes").max(480),
  priceCents: z.number().int().min(0),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

// Partial update for an existing service. Unlike serviceSchema this declares no
// defaults, so omitted keys stay omitted instead of overwriting columns with default
// values, and every supplied field is range-checked (e.g. no negative priceCents).
export const serviceUpdateSchema = z
  .object({
    name: z.string().min(1, "Name is required").max(255),
    description: z.string().max(2000),
    durationMins: z.number().int().min(15, "Minimum 15 minutes").max(480),
    priceCents: z.number().int().min(0),
    isActive: z.boolean(),
    sortOrder: z.number().int(),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, "No valid fields to update");

// Admin-managed promo code. The launch case ("first 5 get 10%") is percentOff=10, maxUses=5.
// maxUses null = unlimited; expiresAt null = never. Code is trimmed + uppercased for a
// case-insensitive match at redemption.
const promoExpiresField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format")
  .refine(isRealCalendarDate, "Not a real calendar date")
  .nullable()
  .optional();

export const promoCodeSchema = z.object({
  code: z.string().trim().toUpperCase().min(1, "Code is required").max(50),
  description: z.string().max(500).default(""),
  percentOff: z.number().int().min(1, "Must be at least 1%").max(100, "Cannot exceed 100%"),
  maxUses: z.number().int().min(1, "Must allow at least 1 use").nullable().optional(),
  expiresAt: promoExpiresField,
  isActive: z.boolean().default(true),
});

export const promoCodeUpdateSchema = z
  .object({
    code: z.string().trim().toUpperCase().min(1, "Code is required").max(50),
    description: z.string().max(500),
    percentOff: z.number().int().min(1).max(100),
    maxUses: z.number().int().min(1).nullable(),
    expiresAt: promoExpiresField,
    isActive: z.boolean(),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, "No valid fields to update");

const windowTimeField = z
  .string()
  .regex(/^\d{2}:\d{2}$/, "Invalid time format")
  .refine(isRealTimeOfDay, "Not a valid time of day")
  .nullable();

// Admin-edited per-weekday schedule: a master open flag plus two drop-off windows. An
// enabled window must have both a start and an end, with start strictly before end.
export const businessHoursSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    isOpen: z.boolean(),
    morningEnabled: z.boolean(),
    morningStart: windowTimeField,
    morningEnd: windowTimeField,
    eveningEnabled: z.boolean(),
    eveningStart: windowTimeField,
    eveningEnd: windowTimeField,
  })
  .refine((d) => !d.morningEnabled || (!!d.morningStart && !!d.morningEnd && d.morningStart < d.morningEnd), {
    message: "Morning window needs a start before its end",
    path: ["morningStart"],
  })
  .refine((d) => !d.eveningEnabled || (!!d.eveningStart && !!d.eveningEnd && d.eveningStart < d.eveningEnd), {
    message: "Evening window needs a start before its end",
    path: ["eveningStart"],
  });

// Admin-edited windows for one specific opened date (per-date authoritative). Same window
// rules as businessHoursSchema, keyed by date instead of weekday.
export const availableDateWindowsSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
    morningEnabled: z.boolean(),
    morningStart: windowTimeField,
    morningEnd: windowTimeField,
    eveningEnabled: z.boolean(),
    eveningStart: windowTimeField,
    eveningEnd: windowTimeField,
  })
  .refine((d) => !d.morningEnabled || (!!d.morningStart && !!d.morningEnd && d.morningStart < d.morningEnd), {
    message: "Morning window needs a start before its end",
    path: ["morningStart"],
  })
  .refine((d) => !d.eveningEnabled || (!!d.eveningStart && !!d.eveningEnd && d.eveningStart < d.eveningEnd), {
    message: "Evening window needs a start before its end",
    path: ["eveningStart"],
  });

export const businessInfoSchema = z.object({
  name: z.string().min(1, "Business name is required").max(255),
  address: z.string().max(500).default(""),
  // Optional: blank is allowed, but a non-empty value must be a valid US phone and is
  // normalized to the canonical "(555) 123-4567" form.
  phone: z
    .string()
    .max(50)
    .default("")
    .refine((p) => p === "" || isUsPhone(p), "Enter a valid 10-digit US phone number")
    .transform((p) => (p ? formatPhone(p) : p)),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "New password must be at least 8 characters").max(128),
  })
  .refine((d) => d.currentPassword !== d.newPassword, {
    message: "New password must be different from the current password",
    path: ["newPassword"],
  });

export type BookingInput = z.infer<typeof bookingSchema>;
export type ContactInput = z.infer<typeof contactSchema>;
export type ServiceInput = z.infer<typeof serviceSchema>;
export type BusinessInfoInput = z.infer<typeof businessInfoSchema>;
export type PromoCodeInput = z.infer<typeof promoCodeSchema>;
