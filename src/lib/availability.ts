import { db } from "@/db";
import { businessHours, blockedDates, bookings, services } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { timeToMinutes, minutesToTime, rangesOverlap } from "./time";

export interface TimeSlot {
  time: string; // "HH:MM" format
  available: boolean;
}

// Authoritative single-slot check used when actually writing a booking (create or
// admin reschedule). Accepts an executor so it can run inside the booking transaction.
// Enforces blocked dates, business hours, the end-of-day boundary, and duration-aware
// overlap with other active bookings. `excludeBookingId` lets a reschedule ignore the
// row it is moving.
export async function isSlotAvailable(
  executor: Pick<typeof db, "select">,
  dateStr: string,
  appointmentTime: string,
  serviceId: number,
  excludeBookingId?: number,
): Promise<boolean> {
  const dayOfWeek = new Date(dateStr + "T00:00:00").getDay();

  const blocked = await executor
    .select()
    .from(blockedDates)
    .where(eq(blockedDates.date, dateStr));
  if (blocked.length > 0) return false;

  const hours = await executor
    .select()
    .from(businessHours)
    .where(eq(businessHours.dayOfWeek, dayOfWeek));
  if (hours.length === 0 || !hours[0].isOpen || !hours[0].openTime || !hours[0].closeTime) {
    return false;
  }

  const service = await executor.select().from(services).where(eq(services.id, serviceId));
  if (service.length === 0) return false;
  const duration = service[0].durationMins;

  const start = timeToMinutes(appointmentTime);
  const end = start + duration;
  if (start < timeToMinutes(hours[0].openTime) || end > timeToMinutes(hours[0].closeTime)) {
    return false;
  }

  const conditions = [
    eq(bookings.appointmentDate, dateStr),
    sql`${bookings.status} != 'cancelled'`,
  ];
  if (excludeBookingId !== undefined) {
    conditions.push(sql`${bookings.id} != ${excludeBookingId}`);
  }

  const existing = await executor
    .select({
      appointmentTime: bookings.appointmentTime,
      durationMins: services.durationMins,
    })
    .from(bookings)
    .innerJoin(services, eq(bookings.serviceId, services.id))
    .where(and(...conditions));

  return !existing.some((b) => {
    const bStart = timeToMinutes(b.appointmentTime);
    return rangesOverlap(start, end, bStart, bStart + b.durationMins);
  });
}

export async function getAvailableSlots(
  dateStr: string,
  serviceId: number
): Promise<TimeSlot[]> {
  const date = new Date(dateStr + "T00:00:00");
  const dayOfWeek = date.getDay();

  // Check if date is blocked
  const blocked = await db
    .select()
    .from(blockedDates)
    .where(eq(blockedDates.date, dateStr));
  if (blocked.length > 0) return [];

  // Get business hours for this day
  const hours = await db
    .select()
    .from(businessHours)
    .where(eq(businessHours.dayOfWeek, dayOfWeek));
  if (hours.length === 0 || !hours[0].isOpen) return [];

  const openTime = hours[0].openTime!;
  const closeTime = hours[0].closeTime!;

  // Get service duration
  const service = await db
    .select()
    .from(services)
    .where(eq(services.id, serviceId));
  if (service.length === 0) return [];
  const duration = service[0].durationMins;

  // Get existing bookings for this date with their durations
  const existingBookings = await db
    .select({
      appointmentTime: bookings.appointmentTime,
      durationMins: services.durationMins,
    })
    .from(bookings)
    .innerJoin(services, eq(bookings.serviceId, services.id))
    .where(
      and(
        eq(bookings.appointmentDate, dateStr),
        sql`${bookings.status} != 'cancelled'`
      )
    );

  const openMins = timeToMinutes(openTime);
  const closeMins = timeToMinutes(closeTime);
  const slots: TimeSlot[] = [];

  // Generate 30-min increment slots
  for (let t = openMins; t <= closeMins - duration; t += 30) {
    const slotStart = t;
    const slotEnd = t + duration;

    // Check overlap with existing bookings
    const hasConflict = existingBookings.some((b) => {
      const bStart = timeToMinutes(b.appointmentTime);
      return rangesOverlap(slotStart, slotEnd, bStart, bStart + b.durationMins);
    });

    slots.push({
      time: minutesToTime(t),
      available: !hasConflict,
    });
  }

  return slots;
}
