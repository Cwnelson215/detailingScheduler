import { z } from "zod";

export const bookingSchema = z.object({
  serviceId: z.number().int().positive(),
  customerName: z.string().min(1, "Name is required").max(255),
  customerEmail: z.string().email("Invalid email address"),
  customerPhone: z.string().min(1, "Phone is required").max(50),
  vehicleYear: z.string().regex(/^\d{4}$/, "Must be a 4-digit year"),
  vehicleMake: z.string().min(1, "Make is required").max(100),
  vehicleModel: z.string().min(1, "Model is required").max(100),
  appointmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
  appointmentTime: z.string().regex(/^\d{2}:\d{2}$/, "Invalid time format"),
  notes: z.string().max(1000).optional().default(""),
});

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
