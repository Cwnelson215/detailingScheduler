import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { POST } from "./route";
import { db } from "@/db";
import { bookings } from "@/db/schema";
import { resetDb, seedService, seedBooking, futureDateForWeekday } from "@/test/fixtures";
import { rateLimit } from "@/lib/rate-limit";
import { issueCustomerToken, CUSTOMER_COOKIE } from "@/lib/customer-session";

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(() => true),
  getClientIp: vi.fn(() => "1.2.3.4"),
}));
vi.mock("@/lib/email", () => ({
  notifyBookingStatus: vi.fn().mockResolvedValue(undefined),
}));

const MONDAY = futureDateForWeekday(1);

function req(jobId: string, body: unknown, token?: string) {
  return new NextRequest(`http://localhost/api/jobs/${jobId}/manage`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { cookie: `${CUSTOMER_COOKIE}=${encodeURIComponent(token)}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

let serviceId: number;
let jobId: string;
let bookingId: number;
let token: string;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(rateLimit).mockReturnValue(true);
  await resetDb();
  const svc = await seedService({ durationMins: 60 });
  serviceId = svc.id;
  const b = await seedBooking({ serviceId, appointmentDate: MONDAY, appointmentTime: "09:00" });
  jobId = b.jobId!;
  bookingId = b.id;
  token = issueCustomerToken(bookingId);
});

describe("POST /api/jobs/[jobId]/manage", () => {
  it("401 without a session cookie", async () => {
    const res = await POST(req(jobId, { cancel: true }), { params: { jobId } });
    expect(res.status).toBe(401);
  });

  it("401 with a cookie scoped to a different booking", async () => {
    const res = await POST(req(jobId, { cancel: true }, issueCustomerToken(bookingId + 999)), {
      params: { jobId },
    });
    expect(res.status).toBe(401);
  });

  it("cancels the booking", async () => {
    const res = await POST(req(jobId, { cancel: true }, token), { params: { jobId } });
    expect(res.status).toBe(200);
    const [row] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
    expect(row.status).toBe("cancelled");
  });

  it("reschedules into a free slot", async () => {
    const res = await POST(req(jobId, { appointmentTime: "11:00" }, token), { params: { jobId } });
    expect(res.status).toBe(200);
    const [row] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
    expect(row.appointmentTime.slice(0, 5)).toBe("11:00");
  });

  it("409 when rescheduling onto a taken slot", async () => {
    await seedBooking({ serviceId, appointmentDate: MONDAY, appointmentTime: "11:00" });
    const res = await POST(req(jobId, { appointmentTime: "11:00" }, token), { params: { jobId } });
    expect(res.status).toBe(409);
  });

  it("edits contact/vehicle details", async () => {
    const res = await POST(
      req(jobId, { customerName: "Changed Name", vehicleMake: "Honda" }, token),
      { params: { jobId } },
    );
    expect(res.status).toBe(200);
    const [row] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
    expect(row.customerName).toBe("Changed Name");
    expect(row.vehicleMake).toBe("Honda");
  });

  it("404 for an unknown job id", async () => {
    const res = await POST(req("ZZZZ9999", { cancel: true }, token), {
      params: { jobId: "ZZZZ9999" },
    });
    expect(res.status).toBe(404);
  });
});
