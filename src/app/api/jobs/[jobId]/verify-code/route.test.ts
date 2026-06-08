import { describe, it, expect, beforeEach, vi } from "vitest";
import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { POST } from "./route";
import { db } from "@/db";
import { customerVerificationCodes } from "@/db/schema";
import { resetDb, seedService, seedBooking } from "@/test/fixtures";
import { rateLimit } from "@/lib/rate-limit";
import { issueViewToken, verifyCustomerToken, VIEW_COOKIE, CUSTOMER_COOKIE } from "@/lib/customer-session";

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(() => true),
  getClientIp: vi.fn(() => "1.2.3.4"),
}));

function hashCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

function req(jobId: string, body: unknown, viewToken?: string) {
  return new NextRequest(`http://localhost/api/jobs/${jobId}/verify-code`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(viewToken ? { cookie: `${VIEW_COOKIE}=${encodeURIComponent(viewToken)}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

function manageTokenFromCookie(setCookie: string | null): string | undefined {
  const m = setCookie?.match(new RegExp(`${CUSTOMER_COOKIE}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : undefined;
}

let serviceId: number;
let jobId: string;
let bookingId: number;
let viewToken: string;

async function insertCode(overrides: Partial<typeof customerVerificationCodes.$inferInsert> = {}) {
  await db.insert(customerVerificationCodes).values({
    bookingId,
    codeHash: hashCode("123456"),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    ...overrides,
  });
}

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
  viewToken = issueViewToken("jane@example.com");
});

describe("POST /api/jobs/[jobId]/verify-code", () => {
  it("401 without a view cookie", async () => {
    await insertCode();
    const res = await POST(req(jobId, { code: "123456" }), { params: Promise.resolve({ jobId }) });
    expect(res.status).toBe(401);
  });

  it("issues the manage cookie on a correct code and consumes it", async () => {
    await insertCode();
    const res = await POST(req(jobId, { code: "123456" }, viewToken), { params: Promise.resolve({ jobId }) });
    expect(res.status).toBe(200);

    const token = manageTokenFromCookie(res.headers.get("set-cookie"));
    expect(verifyCustomerToken(token)).toEqual({ bookingId });

    const [row] = await db
      .select()
      .from(customerVerificationCodes)
      .where(eq(customerVerificationCodes.bookingId, bookingId));
    expect(row.consumedAt).not.toBeNull();
  });

  it("rejects a wrong code, increments attempts, and sets no manage cookie", async () => {
    await insertCode();
    const res = await POST(req(jobId, { code: "000000" }, viewToken), { params: Promise.resolve({ jobId }) });
    expect(res.status).toBe(400);
    expect(res.headers.get("set-cookie")).toBeNull();
    const [row] = await db
      .select()
      .from(customerVerificationCodes)
      .where(eq(customerVerificationCodes.bookingId, bookingId));
    expect(row.attempts).toBe(1);
  });

  it("rejects an expired code", async () => {
    await insertCode({ expiresAt: new Date(Date.now() - 1000) });
    const res = await POST(req(jobId, { code: "123456" }, viewToken), { params: Promise.resolve({ jobId }) });
    expect(res.status).toBe(400);
  });

  it("rejects an already-consumed code", async () => {
    await insertCode({ consumedAt: new Date() });
    const res = await POST(req(jobId, { code: "123456" }, viewToken), { params: Promise.resolve({ jobId }) });
    expect(res.status).toBe(400);
  });

  it("locks out after too many attempts", async () => {
    await insertCode({ attempts: 5 });
    const res = await POST(req(jobId, { code: "123456" }, viewToken), { params: Promise.resolve({ jobId }) });
    expect(res.status).toBe(429);
  });

  it("rejects when the view cookie email does not match the booking", async () => {
    await insertCode();
    const res = await POST(req(jobId, { code: "123456" }, issueViewToken("other@example.com")), {
      params: Promise.resolve({ jobId }),
    });
    expect(res.status).toBe(400);
  });
});
