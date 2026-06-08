import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { GET, POST } from "./route";
import { db } from "@/db";
import { bookingMessages } from "@/db/schema";
import { resetDb, seedService, seedBooking, seedMessage } from "@/test/fixtures";
import { getServerSession } from "next-auth";
import { sendOwnerReplyNotification } from "@/lib/email";

vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/email", () => ({
  sendOwnerReplyNotification: vi.fn().mockResolvedValue(undefined),
}));

function reqWith(method: string, bookingId: number, body?: unknown) {
  return new NextRequest(`http://localhost/api/admin/messages/${bookingId}`, {
    method,
    ...(body !== undefined
      ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
      : {}),
  });
}

const ctx = (id: number | string) => ({ params: Promise.resolve({ bookingId: String(id) }) });

let bookingId: number;

beforeEach(async () => {
  vi.clearAllMocks();
  await resetDb();
  const svc = await seedService({ durationMins: 60 });
  const b = await seedBooking({ serviceId: svc.id, appointmentDate: "2099-01-05", appointmentTime: "09:00" });
  bookingId = b.id;
});

function authed() {
  vi.mocked(getServerSession).mockResolvedValue({ user: { name: "Admin" } } as never);
}

describe("POST /api/admin/messages/[bookingId]", () => {
  it("401 when unauthenticated", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await POST(reqWith("POST", bookingId, { body: "hello" }), ctx(bookingId));
    expect(res.status).toBe(401);
  });

  it("stores an owner message and notifies the customer", async () => {
    authed();
    const res = await POST(reqWith("POST", bookingId, { body: "see you then" }), ctx(bookingId));
    expect(res.status).toBe(201);
    const [row] = await db.select().from(bookingMessages).where(eq(bookingMessages.bookingId, bookingId));
    expect(row.sender).toBe("owner");
    expect(row.ciphertext).not.toContain("see you");
    expect(sendOwnerReplyNotification).toHaveBeenCalledTimes(1);
  });

  it("404 for a missing booking", async () => {
    authed();
    const res = await POST(reqWith("POST", 9999, { body: "x" }), ctx(9999));
    expect(res.status).toBe(404);
  });
});

describe("GET /api/admin/messages/[bookingId]", () => {
  it("401 when unauthenticated", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await GET(reqWith("GET", bookingId), ctx(bookingId));
    expect(res.status).toBe(401);
  });

  it("returns the thread and marks customer messages read", async () => {
    authed();
    await seedMessage(bookingId, "customer", "running 10 min late");
    const res = await GET(reqWith("GET", bookingId), ctx(bookingId));
    expect(res.status).toBe(200);
    const history = await res.json();
    expect(history[0].body).toBe("running 10 min late");

    const [row] = await db.select().from(bookingMessages).where(eq(bookingMessages.bookingId, bookingId));
    expect(row.readAt).not.toBeNull();
  });
});
