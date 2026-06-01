import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

vi.mock("@/lib/email", () => ({
  notifyBookingStatus: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));

import { PATCH, DELETE } from "@/app/api/bookings/[id]/route";
import { getServerSession } from "next-auth";
import { notifyBookingStatus } from "@/lib/email";
import { db } from "@/db";
import { bookings } from "@/db/schema";
import { resetDb, seedService, seedBooking, futureDateForWeekday } from "@/test/fixtures";

const MONDAY = futureDateForWeekday(1);
let serviceId: number;

function req(method: string, body?: unknown) {
  return new NextRequest("http://localhost/api/bookings/1", {
    method,
    ...(body !== undefined
      ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
      : {}),
  });
}
const ctx = (id: number | string) => ({ params: { id: String(id) } });

beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(getServerSession).mockResolvedValue({ user: { name: "Admin" } } as never);
  await resetDb();
  const svc = await seedService({ durationMins: 60 });
  serviceId = svc.id;
});

describe("PATCH /api/bookings/[id]", () => {
  it("401 when unauthenticated", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await PATCH(req("PATCH", { status: "confirmed" }), ctx(1));
    expect(res.status).toBe(401);
  });

  it("400 on a non-numeric id", async () => {
    const res = await PATCH(req("PATCH", { status: "confirmed" }), ctx("abc"));
    expect(res.status).toBe(400);
  });

  it("400 on an empty update", async () => {
    const res = await PATCH(req("PATCH", {}), ctx(1));
    expect(res.status).toBe(400);
  });

  it("404 when the booking does not exist", async () => {
    const res = await PATCH(req("PATCH", { status: "confirmed" }), ctx(999));
    expect(res.status).toBe(404);
  });

  it("updates status and emails the customer", async () => {
    const b = await seedBooking({ serviceId, appointmentDate: MONDAY, dropoffWindow: "morning" });
    const res = await PATCH(req("PATCH", { status: "confirmed" }), ctx(b.id));
    expect(res.status).toBe(200);
    const [row] = await db.select().from(bookings).where(eq(bookings.id, b.id));
    expect(row.status).toBe("confirmed");
    expect(notifyBookingStatus).toHaveBeenCalledWith(expect.anything(), "confirmed");
  });

  it("reschedules into a free window (200) and stores the resolved time", async () => {
    const b = await seedBooking({ serviceId, appointmentDate: MONDAY, dropoffWindow: "morning" });
    const res = await PATCH(req("PATCH", { dropoffWindow: "evening" }), ctx(b.id));
    expect(res.status).toBe(200);
    const [row] = await db.select().from(bookings).where(eq(bookings.id, b.id));
    expect(row.dropoffWindow).toBe("evening");
    expect(row.appointmentTime.slice(0, 5)).toBe("15:00");
    expect(notifyBookingStatus).toHaveBeenCalledWith(expect.anything(), "rescheduled");
  });

  it("returns 409 when rescheduling onto a taken window", async () => {
    const a = await seedBooking({ serviceId, appointmentDate: MONDAY, dropoffWindow: "morning" });
    await seedBooking({ serviceId, appointmentDate: MONDAY, dropoffWindow: "evening", appointmentTime: "15:00" });
    const res = await PATCH(req("PATCH", { dropoffWindow: "evening" }), ctx(a.id));
    expect(res.status).toBe(409);
  });
});

describe("DELETE /api/bookings/[id]", () => {
  it("401 when unauthenticated", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await DELETE(req("DELETE"), ctx(1));
    expect(res.status).toBe(401);
  });

  it("404 when the booking does not exist", async () => {
    const res = await DELETE(req("DELETE"), ctx(999));
    expect(res.status).toBe(404);
  });

  it("cancels an active booking", async () => {
    const b = await seedBooking({ serviceId, appointmentDate: MONDAY, appointmentTime: "09:00" });
    const res = await DELETE(req("DELETE"), ctx(b.id));
    expect(res.status).toBe(200);
    const [row] = await db.select().from(bookings).where(eq(bookings.id, b.id));
    expect(row.status).toBe("cancelled");
  });

  it("is idempotent on an already-cancelled booking (no email)", async () => {
    const b = await seedBooking({
      serviceId,
      appointmentDate: MONDAY,
      appointmentTime: "09:00",
      status: "cancelled",
    });
    const res = await DELETE(req("DELETE"), ctx(b.id));
    expect(res.status).toBe(200);
    expect(notifyBookingStatus).not.toHaveBeenCalled();
  });
});
