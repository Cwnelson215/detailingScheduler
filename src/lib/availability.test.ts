import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/db";
import { getWindowOptions, isWindowAvailable, getAvailableDatesInRange } from "@/lib/availability";
import {
  resetDb,
  seedService,
  seedBooking,
  markAvailable,
  setDateWindows,
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
  // Every date is unavailable by default now; open the weekdays these tests exercise. SUNDAY is
  // opened too so the "closed day" tests isolate the isOpen=false path, not the allowlist gate.
  await markAvailable(MONDAY);
  await markAvailable(SATURDAY);
  await markAvailable(SUNDAY);
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

  it("returns nothing for a date that hasn't been opened", async () => {
    const unopened = futureDateForWeekday(1, 28);
    expect(await getWindowOptions(unopened)).toEqual([]);
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

  it("reflects an admin disabling a window on that date", async () => {
    await setDateWindows(MONDAY, { eveningEnabled: false });
    const options = await getWindowOptions(MONDAY);
    expect(options.map((o) => o.key)).toEqual(["morning"]);
  });
});

describe("per-date windows", () => {
  it("seeds a newly opened date with its weekday's windows", async () => {
    // SATURDAY is morning-only in the seeded template; opening it copies that.
    const options = await getWindowOptions(SATURDAY);
    expect(options.map((o) => o.key)).toEqual(["morning"]);
  });

  it("offers windows on a date whose closed weekday has none, once set per date", async () => {
    // Sunday's template is closed, so SUNDAY seeded no windows. Setting them per date opens it.
    expect(await getWindowOptions(SUNDAY)).toEqual([]);
    await setDateWindows(SUNDAY, {
      morningEnabled: true,
      morningStart: "08:00",
      morningEnd: "10:00",
    });
    const options = await getWindowOptions(SUNDAY);
    expect(options.map((o) => o.key)).toEqual(["morning"]);
    expect(options[0]).toMatchObject({ startTime: "08:00", endTime: "10:00" });
    expect(await isWindowAvailable(db, SUNDAY, "morning")).toEqual({ ok: true, startTime: "08:00" });
  });

  it("is authoritative over the weekday template after opening", async () => {
    // Changing the weekday template must NOT change an already-opened date's windows.
    await setHours(1, { eveningEnabled: false, eveningStart: null, eveningEnd: null });
    const options = await getWindowOptions(MONDAY);
    expect(options.map((o) => o.key)).toEqual(["morning", "evening"]);
  });

  it("lets one date differ from others on the same weekday", async () => {
    const otherMonday = futureDateForWeekday(1, 35);
    await markAvailable(otherMonday);
    await setDateWindows(MONDAY, { eveningEnabled: false });
    expect((await getWindowOptions(MONDAY)).map((o) => o.key)).toEqual(["morning"]);
    expect((await getWindowOptions(otherMonday)).map((o) => o.key)).toEqual(["morning", "evening"]);
  });
});

describe("isWindowAvailable", () => {
  it("allows a free window and returns its resolved start time", async () => {
    expect(await isWindowAvailable(db, MONDAY, "morning")).toEqual({ ok: true, startTime: "07:00" });
    expect(await isWindowAvailable(db, MONDAY, "evening")).toEqual({ ok: true, startTime: "15:00" });
  });

  it("rejects a date that hasn't been opened", async () => {
    const unopened = futureDateForWeekday(1, 28);
    expect(await isWindowAvailable(db, unopened, "morning")).toMatchObject({ ok: false });
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

describe("getAvailableDatesInRange", () => {
  // Wide range covering all three opened weekdays seeded in beforeEach.
  const from = [MONDAY, SATURDAY, SUNDAY].sort()[0];
  const to = futureDateForWeekday(1, 28);

  it("includes opened weekdays that still have a free window", async () => {
    const dates = await getAvailableDatesInRange(from, to);
    expect(dates).toContain(MONDAY);
    expect(dates).toContain(SATURDAY);
  });

  it("excludes a date that hasn't been opened", async () => {
    const unopened = futureDateForWeekday(1, 28);
    const dates = await getAvailableDatesInRange(from, unopened);
    expect(dates).not.toContain(unopened);
  });

  it("excludes an opened-but-closed day (no windows)", async () => {
    // SUNDAY is opened in the allowlist but the weekday is closed → no bookable window.
    const dates = await getAvailableDatesInRange(from, to);
    expect(dates).not.toContain(SUNDAY);
  });

  it("excludes an opened date once every window is booked", async () => {
    await seedBooking({ serviceId, appointmentDate: MONDAY, dropoffWindow: "morning" });
    await seedBooking({
      serviceId,
      appointmentDate: MONDAY,
      dropoffWindow: "evening",
      appointmentTime: "15:00",
    });
    const dates = await getAvailableDatesInRange(from, to);
    expect(dates).not.toContain(MONDAY);
  });
});
