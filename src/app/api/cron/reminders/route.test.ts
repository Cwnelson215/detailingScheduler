import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";

// Email is the route's only external seam — mock it so the cron hits a real
// (in-memory) DB but never sends mail.
vi.mock("@/lib/email", () => ({
  sendBookingStatusUpdate: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from "@/app/api/cron/reminders/route";
import { sendBookingStatusUpdate } from "@/lib/email";
import { db } from "@/db";
import { bookings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { resetDb, seedService, seedBooking } from "@/test/fixtures";

const SECRET = "s3cr3t-token";
const originalSecret = process.env.CRON_SECRET;

// Same local-date math the route uses to pick "tomorrow".
function dateOffsetFromToday(days: number): string {
  const n = new Date();
  const d = new Date(n.getFullYear(), n.getMonth(), n.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const TOMORROW = dateOffsetFromToday(1);
const NEXT_WEEK = dateOffsetFromToday(7);

let serviceId: number;

function req(authHeader?: string) {
  return new NextRequest("http://localhost/api/cron/reminders", {
    method: "POST",
    headers: authHeader === undefined ? {} : { authorization: authHeader },
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = SECRET;
  await resetDb();
  const svc = await seedService({ durationMins: 60 });
  serviceId = svc.id;
});

afterAll(() => {
  if (originalSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalSecret;
});

describe("POST /api/cron/reminders — auth", () => {
  it("returns 503 when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;
    const res = await POST(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(503);
    expect(sendBookingStatusUpdate).not.toHaveBeenCalled();
  });

  it("returns 401 with no Authorization header", async () => {
    const res = await POST(req());
    expect(res.status).toBe(401);
  });

  it("returns 401 on a wrong token", async () => {
    const res = await POST(req("Bearer nope"));
    expect(res.status).toBe(401);
  });

  it("authenticates when the bearer token has a trailing newline (the prod CRON_SECRET bug)", async () => {
    // Reproduces the live failure: a newline-laden secret/header. The route must trim
    // both sides so the request authenticates instead of 401-ing (or 400-ing upstream).
    process.env.CRON_SECRET = `${SECRET}\n`;
    const res = await POST(req(`Bearer ${SECRET}\n`));
    expect(res.status).toBe(200);
  });
});

describe("POST /api/cron/reminders — sending", () => {
  it("sends a reminder for a tomorrow booking and stamps reminderSentAt", async () => {
    const b = await seedBooking({
      serviceId,
      appointmentDate: TOMORROW,
      appointmentTime: "09:00",
      status: "confirmed",
    });

    const res = await POST(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ target: TOMORROW, due: 1, sent: 1 });

    expect(sendBookingStatusUpdate).toHaveBeenCalledTimes(1);
    expect(sendBookingStatusUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: b.id }),
      "reminder",
    );

    const [row] = await db.select().from(bookings).where(eq(bookings.id, b.id));
    expect(row.reminderSentAt).not.toBeNull();
  });

  it("includes pending bookings too", async () => {
    await seedBooking({ serviceId, appointmentDate: TOMORROW, appointmentTime: "09:00", status: "pending" });
    const res = await POST(req(`Bearer ${SECRET}`));
    expect(await res.json()).toMatchObject({ due: 1, sent: 1 });
  });

  it("skips bookings already reminded (idempotent)", async () => {
    await seedBooking({
      serviceId,
      appointmentDate: TOMORROW,
      appointmentTime: "09:00",
      status: "confirmed",
      reminderSentAt: new Date(),
    });
    const res = await POST(req(`Bearer ${SECRET}`));
    expect(await res.json()).toMatchObject({ due: 0, sent: 0 });
    expect(sendBookingStatusUpdate).not.toHaveBeenCalled();
  });

  it("excludes cancelled and completed bookings", async () => {
    await seedBooking({ serviceId, appointmentDate: TOMORROW, appointmentTime: "09:00", status: "cancelled" });
    await seedBooking({ serviceId, appointmentDate: TOMORROW, appointmentTime: "11:00", status: "completed" });
    const res = await POST(req(`Bearer ${SECRET}`));
    expect(await res.json()).toMatchObject({ due: 0, sent: 0 });
  });

  it("excludes bookings that are not tomorrow", async () => {
    await seedBooking({ serviceId, appointmentDate: NEXT_WEEK, appointmentTime: "09:00", status: "confirmed" });
    const res = await POST(req(`Bearer ${SECRET}`));
    expect(await res.json()).toMatchObject({ due: 0, sent: 0 });
  });
});
