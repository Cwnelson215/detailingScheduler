import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { resetDb, seedService, seedBooking } from "@/test/fixtures";
import { rateLimit } from "@/lib/rate-limit";
import { verifyViewToken, VIEW_COOKIE } from "@/lib/customer-session";

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(() => true),
  getClientIp: vi.fn(() => "1.2.3.4"),
}));

function postReq(body: unknown) {
  return new NextRequest("http://localhost/api/bookings/lookup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Extract the cust_view token from a Set-Cookie header.
function viewTokenFromCookie(setCookie: string | null): string | undefined {
  const m = setCookie?.match(new RegExp(`${VIEW_COOKIE}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : undefined;
}

let serviceId: number;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(rateLimit).mockReturnValue(true);
  await resetDb();
  const svc = await seedService({ durationMins: 60 });
  serviceId = svc.id;
});

describe("POST /api/bookings/lookup", () => {
  it("returns the single upcoming booking and sets an email-scoped view cookie", async () => {
    await seedBooking({
      serviceId,
      appointmentDate: "2099-01-05",
      customerEmail: "Jane@Example.com",
      jobId: "ABCD2345",
    });

    const res = await POST(postReq({ email: "jane@example.com" }));
    expect(res.status).toBe(200);

    const token = viewTokenFromCookie(res.headers.get("set-cookie"));
    expect(token).toBeDefined();
    expect(verifyViewToken(token)).toEqual({ email: "jane@example.com" });

    const data = await res.json();
    expect(data.bookings).toHaveLength(1);
    // The Job ID and numeric id must never be exposed at the view tier.
    expect(data.bookings[0]).not.toHaveProperty("jobId");
    expect(data.bookings[0]).not.toHaveProperty("id");
    expect(data.bookings[0]).toHaveProperty("token");
  });

  it("returns multiple upcoming bookings ordered by date", async () => {
    await seedBooking({ serviceId, appointmentDate: "2099-03-01", customerEmail: "jane@example.com" });
    await seedBooking({ serviceId, appointmentDate: "2099-02-01", customerEmail: "jane@example.com", dropoffWindow: "evening", appointmentTime: "15:00" });

    const res = await POST(postReq({ email: "jane@example.com" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.bookings).toHaveLength(2);
    expect(data.bookings[0].appointmentDate).toBe("2099-02-01");
    expect(data.bookings[1].appointmentDate).toBe("2099-03-01");
  });

  it("excludes cancelled and past bookings", async () => {
    await seedBooking({ serviceId, appointmentDate: "2099-01-05", customerEmail: "jane@example.com", status: "cancelled" });
    await seedBooking({ serviceId, appointmentDate: "2000-01-05", customerEmail: "jane@example.com", dropoffWindow: "evening", appointmentTime: "15:00" });

    const res = await POST(postReq({ email: "jane@example.com" }));
    expect(res.status).toBe(404);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("returns a generic 404 with no cookie for an unknown email", async () => {
    await seedBooking({ serviceId, appointmentDate: "2099-01-05", customerEmail: "jane@example.com" });
    const res = await POST(postReq({ email: "nobody@example.com" }));
    expect(res.status).toBe(404);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("returns 429 when rate-limited", async () => {
    vi.mocked(rateLimit).mockReturnValueOnce(false);
    const res = await POST(postReq({ email: "jane@example.com" }));
    expect(res.status).toBe(429);
  });

  it("returns 400 on invalid input", async () => {
    const res = await POST(postReq({ email: "not-an-email" }));
    expect(res.status).toBe(400);
  });
});
