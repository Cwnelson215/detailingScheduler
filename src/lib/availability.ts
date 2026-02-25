import { db } from "@/db";
import { businessHours, blockedDates, bookings, services } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

export interface TimeSlot {
  time: string; // "HH:MM" format
  available: boolean;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
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
      const bEnd = bStart + b.durationMins;
      return slotStart < bEnd && slotEnd > bStart;
    });

    slots.push({
      time: minutesToTime(t),
      available: !hasConflict,
    });
  }

  return slots;
}
