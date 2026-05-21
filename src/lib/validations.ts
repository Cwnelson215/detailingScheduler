import { z } from "zod";

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

function hasPlausiblePhoneDigits(p: string): boolean {
  const digits = p.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

const appointmentDateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format")
  .refine(isRealCalendarDate, "Not a real calendar date")
  .refine(isNotInPast, "Date cannot be in the past");

const appointmentTimeField = z
  .string()
  .regex(/^\d{2}:\d{2}$/, "Invalid time format")
  .refine(isRealTimeOfDay, "Not a valid time of day");

export const bookingStatusValues = ["pending", "confirmed", "completed", "cancelled"] as const;

export const bookingSchema = z.object({
  serviceId: z.number().int().positive(),
  customerName: z.string().min(1, "Name is required").max(255),
  customerEmail: z.string().email("Invalid email address"),
  customerPhone: z
    .string()
    .min(1, "Phone is required")
    .max(50)
    .refine(hasPlausiblePhoneDigits, "Enter a valid phone number"),
  vehicleYear: z.string().regex(/^\d{4}$/, "Must be a 4-digit year"),
  vehicleMake: z.string().min(1, "Make is required").max(100),
  vehicleModel: z.string().min(1, "Model is required").max(100),
  appointmentDate: appointmentDateField,
  appointmentTime: appointmentTimeField,
  notes: z.string().max(1000).optional().default(""),
});

// Admin-only updates to an existing booking (status change, reschedule, notes edit).
export const bookingUpdateSchema = z
  .object({
    status: z.enum(bookingStatusValues).optional(),
    notes: z.string().max(1000).optional(),
    appointmentDate: appointmentDateField.optional(),
    appointmentTime: appointmentTimeField.optional(),
  })
  .refine((d) => Object.keys(d).length > 0, "No valid fields to update");

export const contactSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  email: z.string().email("Invalid email address"),
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

export const businessHoursSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  openTime: z.string().nullable(),
  closeTime: z.string().nullable(),
  isOpen: z.boolean(),
});

export const businessInfoSchema = z.object({
  name: z.string().min(1, "Business name is required").max(255),
  address: z.string().max(500).default(""),
  phone: z.string().max(50).default(""),
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
