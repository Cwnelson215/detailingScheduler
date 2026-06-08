import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { POST } from "./route";
import { db } from "@/db";
import { customerVerificationCodes } from "@/db/schema";
import { resetDb, seedService, seedBooking } from "@/test/fixtures";
import { rateLimit } from "@/lib/rate-limit";
import { sendVerificationCode } from "@/lib/email";
import { issueViewToken, VIEW_COOKIE } from "@/lib/customer-session";

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(() => true),
  getClientIp: vi.fn(() => "1.2.3.4"),
}));
vi.mock("@/lib/email", () => ({
  sendVerificationCode: vi.fn().mockResolvedValue(undefined),
}));

function req(jobId: string, viewToken?: string) {
  return new NextRequest(`http://localhost/api/jobs/${jobId}/request-code`, {
    method: "POST",
    headers: viewToken ? { cookie: `${VIEW_COOKIE}=${encodeURIComponent(viewToken)}` } : {},
  });
}

let serviceId: number;
let jobId: string;
let bookingId: number;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(rateLimit).mockReturnValue(true);
  await resetDb();
  const svc = await seedService({ durationMins: 60 });
  serviceId = svc.id;
  const b = await seedBooking({
    serviceId,
    appointmentDate: "2099-01-05",
    customerEmail: "jane@example.com",
    jobId: "ABCD2345",
  });
  jobId = b.jobId!;
  bookingId = b.id;
});

describe("POST /api/jobs/[jobId]/request-code", () => {
  it("401 without a view cookie", async () => {
    const res = await POST(req(jobId), { params: Promise.resolve({ jobId }) });
    expect(res.status).toBe(401);
    expect(sendVerificationCode).not.toHaveBeenCalled();
  });

  it("404 when the view cookie email does not match the booking", async () => {
    const res = await POST(req(jobId, issueViewToken("someone@else.com")), { params: Promise.resolve({ jobId }) });
    expect(res.status).toBe(404);
    expect(sendVerificationCode).not.toHaveBeenCalled();
  });

  it("issues and emails a code for a matching email + job id", async () => {
    const res = await POST(req(jobId, issueViewToken("jane@example.com")), { params: Promise.resolve({ jobId }) });
    expect(res.status).toBe(200);
    expect(sendVerificationCode).toHaveBeenCalledOnce();
    const rows = await db
      .select()
      .from(customerVerificationCodes)
      .where(eq(customerVerificationCodes.bookingId, bookingId));
    expect(rows).toHaveLength(1);
    expect(rows[0].consumedAt).toBeNull();
  });

  it("invalidates a prior unconsumed code when a new one is requested", async () => {
    const token = issueViewToken("jane@example.com");
    await POST(req(jobId, token), { params: Promise.resolve({ jobId }) });
    await POST(req(jobId, token), { params: Promise.resolve({ jobId }) });
    const rows = await db
      .select()
      .from(customerVerificationCodes)
      .where(eq(customerVerificationCodes.bookingId, bookingId));
    expect(rows).toHaveLength(2);
    const unconsumed = rows.filter((r) => r.consumedAt === null);
    expect(unconsumed).toHaveLength(1);
  });
});
