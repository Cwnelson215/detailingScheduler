import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { resetDb, seedService, seedBooking } from "@/test/fixtures";
import { rateLimit } from "@/lib/rate-limit";
import {
  issueDeviceToken,
  verifyCustomerToken,
  DEVICE_COOKIE,
  CUSTOMER_COOKIE,
} from "@/lib/customer-session";

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(() => true),
  getClientIp: vi.fn(() => "1.2.3.4"),
}));

function req(jobId: string, deviceToken?: string) {
  return new NextRequest(`http://localhost/api/jobs/${jobId}/trusted-unlock`, {
    method: "POST",
    headers: deviceToken ? { cookie: `${DEVICE_COOKIE}=${encodeURIComponent(deviceToken)}` } : {},
  });
}

function manageTokenFromCookie(setCookie: string | null): string | undefined {
  const m = setCookie?.match(new RegExp(`${CUSTOMER_COOKIE}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : undefined;
}

let jobId: string;
let bookingId: number;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(rateLimit).mockReturnValue(true);
  await resetDb();
  const svc = await seedService({ durationMins: 60 });
  const b = await seedBooking({
    serviceId: svc.id,
    appointmentDate: "2099-01-05",
    customerEmail: "jane@example.com",
    jobId: "ABCD2345",
  });
  jobId = b.jobId!;
  bookingId = b.id;
});

describe("POST /api/jobs/[jobId]/trusted-unlock", () => {
  it("issues the manage cookie when the device is trusted for the booking", async () => {
    const device = issueDeviceToken([bookingId]);
    const res = await POST(req(jobId, device), { params: { jobId } });
    expect(res.status).toBe(200);
    const token = manageTokenFromCookie(res.headers.get("set-cookie"));
    expect(verifyCustomerToken(token)).toEqual({ bookingId });
  });

  it("403 needsCode without a device cookie", async () => {
    const res = await POST(req(jobId), { params: { jobId } });
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ needsCode: true });
    expect(manageTokenFromCookie(res.headers.get("set-cookie"))).toBeUndefined();
  });

  it("403 when the device is trusted for a different booking", async () => {
    const res = await POST(req(jobId, issueDeviceToken([bookingId + 999])), { params: { jobId } });
    expect(res.status).toBe(403);
  });

  it("403 when the device cookie has expired", async () => {
    const expired = issueDeviceToken([bookingId], Date.now() - 3 * 60 * 60 * 1000);
    const res = await POST(req(jobId, expired), { params: { jobId } });
    expect(res.status).toBe(403);
  });

  it("403 for an unknown Job ID even with a (mismatched) device cookie", async () => {
    const res = await POST(req("ZZZZ9999", issueDeviceToken([bookingId])), {
      params: { jobId: "ZZZZ9999" },
    });
    expect(res.status).toBe(403);
  });
});
