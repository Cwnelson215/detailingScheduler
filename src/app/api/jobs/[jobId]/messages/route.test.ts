import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { GET, POST } from "./route";
import { db } from "@/db";
import { bookingMessages } from "@/db/schema";
import { resetDb, seedService, seedBooking, seedMessage } from "@/test/fixtures";
import { rateLimit } from "@/lib/rate-limit";
import { sendCustomerMessageNotification } from "@/lib/email";
import { issueCustomerToken, CUSTOMER_COOKIE } from "@/lib/customer-session";

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(() => true),
  getClientIp: vi.fn(() => "1.2.3.4"),
}));
vi.mock("@/lib/email", () => ({
  sendCustomerMessageNotification: vi.fn().mockResolvedValue(undefined),
}));

function reqWith(method: string, jobId: string, body?: unknown, token?: string) {
  return new NextRequest(`http://localhost/api/jobs/${jobId}/messages`, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(token ? { cookie: `${CUSTOMER_COOKIE}=${encodeURIComponent(token)}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

let jobId: string;
let bookingId: number;
let token: string;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(rateLimit).mockReturnValue(true);
  await resetDb();
  const svc = await seedService({ durationMins: 60 });
  const b = await seedBooking({ serviceId: svc.id, appointmentDate: "2099-01-05", appointmentTime: "09:00" });
  jobId = b.jobId!;
  bookingId = b.id;
  token = issueCustomerToken(bookingId);
});

describe("POST /api/jobs/[jobId]/messages", () => {
  it("401 without a session cookie", async () => {
    const res = await POST(reqWith("POST", jobId, { body: "hi" }), { params: { jobId } });
    expect(res.status).toBe(401);
  });

  it("stores the message encrypted and notifies the owner", async () => {
    const res = await POST(reqWith("POST", jobId, { body: "is parking available?" }, token), {
      params: { jobId },
    });
    expect(res.status).toBe(201);
    const payload = await res.json();
    expect(payload.body).toBe("is parking available?");

    const [row] = await db.select().from(bookingMessages).where(eq(bookingMessages.bookingId, bookingId));
    expect(row.sender).toBe("customer");
    expect(row.ciphertext).not.toContain("parking");
    expect(row.iv).toBeTruthy();
    expect(row.authTag).toBeTruthy();
    expect(sendCustomerMessageNotification).toHaveBeenCalledTimes(1);
  });

  it("returns 400 on empty body", async () => {
    const res = await POST(reqWith("POST", jobId, { body: "" }, token), { params: { jobId } });
    expect(res.status).toBe(400);
  });

  it("returns 429 when rate-limited", async () => {
    vi.mocked(rateLimit).mockReturnValueOnce(false);
    const res = await POST(reqWith("POST", jobId, { body: "hi" }, token), { params: { jobId } });
    expect(res.status).toBe(429);
  });
});

describe("GET /api/jobs/[jobId]/messages", () => {
  it("returns the decrypted thread and marks owner messages read", async () => {
    await seedMessage(bookingId, "owner", "we have parking out back");
    await seedMessage(bookingId, "customer", "great, thanks");

    const res = await GET(reqWith("GET", jobId, undefined, token), { params: { jobId } });
    expect(res.status).toBe(200);
    const history = await res.json();
    expect(history).toHaveLength(2);
    expect(history[0].body).toBe("we have parking out back");

    const rows = await db.select().from(bookingMessages).where(eq(bookingMessages.bookingId, bookingId));
    const owner = rows.find((r) => r.sender === "owner");
    const customer = rows.find((r) => r.sender === "customer");
    expect(owner?.readAt).not.toBeNull(); // owner message read by customer
    expect(customer?.readAt).toBeNull(); // customer's own message stays unread (for owner)
  });

  it("401 without a session cookie", async () => {
    const res = await GET(reqWith("GET", jobId), { params: { jobId } });
    expect(res.status).toBe(401);
  });
});
