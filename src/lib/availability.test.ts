import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/db";
import { getWindowOptions, isWindowAvailable } from "@/lib/availability";
import {
  resetDb,
  seedService,
  seedBooking,
  blockDate,
  setHours,
  futureDateForWeekday,
} from "@/test/fixtures";

// Seeded business hours (from runMigrations): Mon–Fri offer morning (07:00–09:00) and
// evening (15:00–17:00) windows, Saturday is morning-only, Sunday is closed.
const MONDAY = futureDateForWeekday(1);
const SATURDAY = futureDateForWeekday(6);
const SUNDAY = futureDateForWeekday(0);

let serviceId: number;

beforeEach(async () => {
  await resetDb();
  // resetDb leaves business_hours intact, so restore the days these tests touch to the
  // seeded defaults — otherwise a test that disables a window leaks into later ones.
  await setHours(1, {
    isOpen: true,
    morningEnabled: true,
    morningStart: "07:00",
    morningEnd: "09:00",
    eveningEnabled: true,
    eveningStart: "15:00",
    eveningEnd: "17:00",
  });
  await setHours(6, {
    isOpen: true,
    morningEnabled: true,
    morningStart: "07:00",
    morningEnd: "09:00",
    eveningEnabled: false,
    eveningStart: null,
    eveningEnd: null,
  });
  const svc = await seedService();
  serviceId = svc.id;
});

describe("getWindowOptions", () => {
  it("returns both windows on a weekday, all available when empty", async () => {
    const options = await getWindowOptions(MONDAY);
    expect(options.map((o) => o.key)).toEqual(["morning", "evening"]);
    expect(options.every((o) => o.available)).toBe(true);
    expect(options[0]).toMatchObject({ startTime: "07:00", endTime: "09:00" });
    expect(options[1]).toMatchObject({ startTime: "15:00", endTime: "17:00" });
  });

  it("returns morning only on Saturday", async () => {
    const options = await getWindowOptions(SATURDAY);
    expect(options.map((o) => o.key)).toEqual(["morning"]);
  });

  it("returns nothing for a closed day", async () => {
    expect(await getWindowOptions(SUNDAY)).toEqual([]);
  });

  it("returns nothing for a blocked date", async () => {
    await blockDate(MONDAY);
    expect(await getWindowOptions(MONDAY)).toEqual([]);
  });

  it("marks a window taken by an active booking unavailable, leaving the other free", async () => {
    await seedBooking({ serviceId, appointmentDate: MONDAY, dropoffWindow: "morning" });
    const options = await getWindowOptions(MONDAY);
    const byKey = Object.fromEntries(options.map((o) => [o.key, o.available]));
    expect(byKey.morning).toBe(false);
    expect(byKey.evening).toBe(true);
  });

  it("does not let a cancelled booking mark a window unavailable", async () => {
    await seedBooking({
      serviceId,
      appointmentDate: MONDAY,
      dropoffWindow: "morning",
      status: "cancelled",
    });
    const options = await getWindowOptions(MONDAY);
    expect(options.find((o) => o.key === "morning")?.available).toBe(true);
  });

  it("reflects an admin disabling a window", async () => {
    await setHours(1, { eveningEnabled: false });
    const options = await getWindowOptions(MONDAY);
    expect(options.map((o) => o.key)).toEqual(["morning"]);
  });
});

describe("isWindowAvailable", () => {
  it("allows a free window and returns its resolved start time", async () => {
    expect(await isWindowAvailable(db, MONDAY, "morning")).toEqual({ ok: true, startTime: "07:00" });
    expect(await isWindowAvailable(db, MONDAY, "evening")).toEqual({ ok: true, startTime: "15:00" });
  });

  it("rejects a blocked date", async () => {
    await blockDate(MONDAY, "holiday");
    expect(await isWindowAvailable(db, MONDAY, "morning")).toMatchObject({ ok: false });
  });

  it("rejects a closed day", async () => {
    expect(await isWindowAvailable(db, SUNDAY, "morning")).toMatchObject({ ok: false });
  });

  it("rejects a window disabled for that day (evening on Saturday)", async () => {
    expect(await isWindowAvailable(db, SATURDAY, "evening")).toMatchObject({ ok: false });
  });

  it("rejects a window already taken", async () => {
    await seedBooking({ serviceId, appointmentDate: MONDAY, dropoffWindow: "morning" });
    expect(await isWindowAvailable(db, MONDAY, "morning")).toMatchObject({ ok: false });
  });

  it("still allows the other window when one is taken", async () => {
    await seedBooking({ serviceId, appointmentDate: MONDAY, dropoffWindow: "morning" });
    expect(await isWindowAvailable(db, MONDAY, "evening")).toMatchObject({ ok: true });
  });

  it("ignores the booking being rescheduled via excludeBookingId", async () => {
    const b = await seedBooking({ serviceId, appointmentDate: MONDAY, dropoffWindow: "morning" });
    expect(await isWindowAvailable(db, MONDAY, "morning")).toMatchObject({ ok: false });
    expect(await isWindowAvailable(db, MONDAY, "morning", b.id)).toMatchObject({ ok: true });
  });

  it("does not let a cancelled booking block a window", async () => {
    await seedBooking({
      serviceId,
      appointmentDate: MONDAY,
      dropoffWindow: "morning",
      status: "cancelled",
    });
    expect(await isWindowAvailable(db, MONDAY, "morning")).toMatchObject({ ok: true });
  });
});
