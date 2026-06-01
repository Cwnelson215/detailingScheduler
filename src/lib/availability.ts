import { db } from "@/db";
import { businessHours, blockedDates, bookings } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { windowLabel, type DropoffWindow, type WindowOption } from "./format";

export type { DropoffWindow, WindowOption };

// The two fixed windows, in display order, paired with their business_hours columns.
type WindowDef = {
  key: DropoffWindow;
  enabled: (h: typeof businessHours.$inferSelect) => boolean;
  start: (h: typeof businessHours.$inferSelect) => string | null;
  end: (h: typeof businessHours.$inferSelect) => string | null;
};

const WINDOWS: WindowDef[] = [
  { key: "morning", enabled: (h) => h.morningEnabled, start: (h) => h.morningStart, end: (h) => h.morningEnd },
  { key: "evening", enabled: (h) => h.eveningEnabled, start: (h) => h.eveningStart, end: (h) => h.eveningEnd },
];

// Trim a Postgres `time` value ("HH:MM:SS") down to "HH:MM".
function hhmm(t: string): string {
  return t.slice(0, 5);
}

// Customer-facing list of drop-off windows for a date: which windows the day offers and
// whether each is still free. Empty when the date is blocked or the shop is closed. Saturday
// returns morning-only purely from the data (no day-of-week special-casing here).
export async function getWindowOptions(dateStr: string): Promise<WindowOption[]> {
  const dayOfWeek = new Date(dateStr + "T00:00:00").getDay();

  const blocked = await db.select().from(blockedDates).where(eq(blockedDates.date, dateStr));
  if (blocked.length > 0) return [];

  const hours = await db.select().from(businessHours).where(eq(businessHours.dayOfWeek, dayOfWeek));
  if (hours.length === 0 || !hours[0].isOpen) return [];
  const h = hours[0];

  // Windows already taken by a non-cancelled booking on this date.
  const taken = await db
    .select({ dropoffWindow: bookings.dropoffWindow })
    .from(bookings)
    .where(and(eq(bookings.appointmentDate, dateStr), sql`${bookings.status} != 'cancelled'`));
  const takenWindows = new Set(taken.map((b) => b.dropoffWindow));

  const options: WindowOption[] = [];
  for (const w of WINDOWS) {
    const start = w.start(h);
    const end = w.end(h);
    if (!w.enabled(h) || !start || !end) continue;
    options.push({
      key: w.key,
      label: windowLabel(w.key),
      startTime: hhmm(start),
      endTime: hhmm(end),
      available: !takenWindows.has(w.key),
    });
  }
  return options;
}

// Authoritative check used when actually writing a booking (create or reschedule). Accepts
// an executor so it runs inside the booking transaction. Returns the server-resolved window
// start so the caller persists the time the customer can't tamper with. `excludeBookingId`
// lets a reschedule ignore the row it is moving.
export async function isWindowAvailable(
  executor: Pick<typeof db, "select">,
  dateStr: string,
  window: DropoffWindow,
  excludeBookingId?: number,
): Promise<{ ok: boolean; startTime?: string }> {
  const dayOfWeek = new Date(dateStr + "T00:00:00").getDay();

  const blocked = await executor.select().from(blockedDates).where(eq(blockedDates.date, dateStr));
  if (blocked.length > 0) return { ok: false };

  const hours = await executor
    .select()
    .from(businessHours)
    .where(eq(businessHours.dayOfWeek, dayOfWeek));
  if (hours.length === 0 || !hours[0].isOpen) return { ok: false };
  const h = hours[0];

  const def = WINDOWS.find((w) => w.key === window)!;
  const start = def.start(h);
  if (!def.enabled(h) || !start || !def.end(h)) return { ok: false };

  const conditions = [
    eq(bookings.appointmentDate, dateStr),
    eq(bookings.dropoffWindow, window),
    sql`${bookings.status} != 'cancelled'`,
  ];
  if (excludeBookingId !== undefined) {
    conditions.push(sql`${bookings.id} != ${excludeBookingId}`);
  }

  const existing = await executor
    .select({ id: bookings.id })
    .from(bookings)
    .where(and(...conditions));

  return { ok: existing.length === 0, startTime: hhmm(start) };
}
