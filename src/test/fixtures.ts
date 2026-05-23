// Test fixtures for the in-memory PGlite database stood up in test/setup.ts. All
// helpers go through the same `@/db` singleton the app uses, so seeded rows are visible
// to the code under test. Call resetDb() in a beforeEach.
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { services, bookings, blockedDates, businessHours } from "@/db/schema";

// Wipe per-test data and reset identity sequences (so IDs are predictable per test).
// business_hours is left intact — runMigrations seeds one row per weekday (Mon–Fri
// 08:00–17:00, Sat 09:00–14:00, Sun closed); use setHours() to override a day.
export async function resetDb(): Promise<void> {
  await db.execute(sql`TRUNCATE bookings, services, blocked_dates RESTART IDENTITY CASCADE`);
}

export async function seedService(overrides: Partial<typeof services.$inferInsert> = {}) {
  const [row] = await db
    .insert(services)
    .values({
      name: "Full Detail – Sedan",
      durationMins: 300,
      priceCents: 15000,
      ...overrides,
    })
    .returning();
  return row;
}

type BookingOverrides = Partial<typeof bookings.$inferInsert> &
  Pick<typeof bookings.$inferInsert, "serviceId" | "appointmentDate" | "appointmentTime">;

export async function seedBooking(overrides: BookingOverrides) {
  const [row] = await db
    .insert(bookings)
    .values({
      customerName: "Test Customer",
      customerEmail: "test@example.com",
      customerPhone: "5551234567",
      vehicleYear: "2020",
      vehicleMake: "Toyota",
      vehicleModel: "Camry",
      status: "pending",
      ...overrides,
    })
    .returning();
  return row;
}

export async function blockDate(date: string, reason = ""): Promise<void> {
  await db.insert(blockedDates).values({ date, reason });
}

export async function setHours(
  dayOfWeek: number,
  opts: { openTime: string | null; closeTime: string | null; isOpen: boolean },
): Promise<void> {
  await db.update(businessHours).set(opts).where(eq(businessHours.dayOfWeek, dayOfWeek));
}

// A date at least `minDaysAhead` out that falls on the given weekday (0=Sun … 6=Sat).
// Future, so it also satisfies bookingSchema's not-in-past rule in route tests, and the
// known weekday lets a test line up with the seeded business hours for that day.
export function futureDateForWeekday(weekday: number, minDaysAhead = 14): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + minDaysAhead);
  while (d.getDay() !== weekday) d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
