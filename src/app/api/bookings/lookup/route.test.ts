import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { resetDb, seedService, seedBooking } from "@/test/fixtures";
import { rateLimit } from "@/lib/rate-limit";

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

let jobId: string;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(rateLimit).mockReturnValue(true);
  await resetDb();
  const svc = await seedService({ durationMins: 60 });
  const booking = await seedBooking({
    serviceId: svc.id,
    appointmentDate: "2099-01-05",
    appointmentTime: "09:00",
    customerEmail: "Jane@Example.com",
    jobId: "ABCD2345", // explicit so the dashed/lowercase display form is deterministic
  });
  jobId = booking.jobId!;
});

describe("POST /api/bookings/lookup", () => {
  it("succeeds with matching job id + email and sets a session cookie", async () => {
    const res = await POST(postReq({ jobId, email: "jane@example.com" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("cust_session=");
  });

  it("accepts the dashed/lowercase display form of the job id", async () => {
    const display = `${jobId.slice(0, 4)}-${jobId.slice(4)}`.toLowerCase();
    const res = await POST(postReq({ jobId: display, email: "jane@example.com" }));
    expect(res.status).toBe(200);
  });

  it("rejects a wrong email with a generic 404 and no cookie", async () => {
    const res = await POST(postReq({ jobId, email: "wrong@example.com" }));
    expect(res.status).toBe(404);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("rejects an unknown job id with a generic 404", async () => {
    const res = await POST(postReq({ jobId: "ZZZZ9999", email: "jane@example.com" }));
    expect(res.status).toBe(404);
  });

  it("returns 429 when rate-limited", async () => {
    vi.mocked(rateLimit).mockReturnValueOnce(false);
    const res = await POST(postReq({ jobId, email: "jane@example.com" }));
    expect(res.status).toBe(429);
  });

  it("returns 400 on invalid input", async () => {
    const res = await POST(postReq({ jobId: "", email: "not-an-email" }));
    expect(res.status).toBe(400);
  });
});
