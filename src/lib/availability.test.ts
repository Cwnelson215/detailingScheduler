import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/db";
import { isSlotAvailable, getAvailableSlots } from "@/lib/availability";
import {
  resetDb,
  seedService,
  seedBooking,
  blockDate,
  futureDateForWeekday,
} from "@/test/fixtures";

// Seeded business hours (from runMigrations): Mon–Fri 08:00–17:00, Sat 09:00–14:00,
// Sun closed. Tests use a 60-minute service so slot math is easy to reason about.
const MONDAY = futureDateForWeekday(1);
const SUNDAY = futureDateForWeekday(0);

let serviceId: number;

beforeEach(async () => {
  await resetDb();
  const svc = await seedService({ durationMins: 60 });
  serviceId = svc.id;
});

describe("isSlotAvailable", () => {
  it("allows a clear slot inside business hours", async () => {
    expect(await isSlotAvailable(db, MONDAY, "09:00", serviceId)).toBe(true);
  });

  it("rejects a blocked date", async () => {
    await blockDate(MONDAY, "holiday");
    expect(await isSlotAvailable(db, MONDAY, "09:00", serviceId)).toBe(false);
  });

  it("rejects a day the shop is closed", async () => {
    expect(await isSlotAvailable(db, SUNDAY, "10:00", serviceId)).toBe(false);
  });

  it("rejects a start time before opening", async () => {
    expect(await isSlotAvailable(db, MONDAY, "07:00", serviceId)).toBe(false);
  });

  it("rejects when the service would run past closing", async () => {
    // 16:30 + 60min = 17:30, past the 17:00 close.
    expect(await isSlotAvailable(db, MONDAY, "16:30", serviceId)).toBe(false);
  });

  it("rejects an unknown service", async () => {
    expect(await isSlotAvailable(db, MONDAY, "09:00", 9999)).toBe(false);
  });

  it("rejects a slot that overlaps an active booking", async () => {
    await seedBooking({ serviceId, appointmentDate: MONDAY, appointmentTime: "09:00" });
    expect(await isSlotAvailable(db, MONDAY, "09:30", serviceId)).toBe(false);
  });

  it("allows a back-to-back slot (overlap is half-open)", async () => {
    await seedBooking({ serviceId, appointmentDate: MONDAY, appointmentTime: "09:00" });
    expect(await isSlotAvailable(db, MONDAY, "10:00", serviceId)).toBe(true);
  });

  it("ignores the booking being rescheduled via excludeBookingId", async () => {
    const b = await seedBooking({
      serviceId,
      appointmentDate: MONDAY,
      appointmentTime: "09:00",
    });
    expect(await isSlotAvailable(db, MONDAY, "09:00", serviceId)).toBe(false);
    expect(await isSlotAvailable(db, MONDAY, "09:00", serviceId, b.id)).toBe(true);
  });

  it("does not let a cancelled booking block a slot", async () => {
    await seedBooking({
      serviceId,
      appointmentDate: MONDAY,
      appointmentTime: "09:00",
      status: "cancelled",
    });
    expect(await isSlotAvailable(db, MONDAY, "09:00", serviceId)).toBe(true);
  });
});

describe("getAvailableSlots", () => {
  it("returns 30-min increment slots within hours, all open when empty", async () => {
    const slots = await getAvailableSlots(MONDAY, serviceId);
    expect(slots[0].time).toBe("08:00");
    // Last slot whose end (start+60) still fits before 17:00 close is 16:00.
    expect(slots[slots.length - 1].time).toBe("16:00");
    expect(slots.every((s) => s.available)).toBe(true);
  });

  it("returns nothing for a blocked date", async () => {
    await blockDate(MONDAY);
    expect(await getAvailableSlots(MONDAY, serviceId)).toEqual([]);
  });

  it("returns nothing for a closed day", async () => {
    expect(await getAvailableSlots(SUNDAY, serviceId)).toEqual([]);
  });

  it("marks slots conflicting with an existing booking unavailable", async () => {
    await seedBooking({ serviceId, appointmentDate: MONDAY, appointmentTime: "09:00" });
    const slots = await getAvailableSlots(MONDAY, serviceId);
    const at = (t: string) => slots.find((s) => s.time === t)?.available;
    expect(at("08:30")).toBe(false); // 08:30–09:30 overlaps 09:00–10:00
    expect(at("09:00")).toBe(false);
    expect(at("09:30")).toBe(false);
    expect(at("10:00")).toBe(true); // back-to-back, no overlap
  });
});
