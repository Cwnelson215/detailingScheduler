import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

// Email + rate-limit + auth are the route's external seams — mock them so tests hit a
// real (in-memory) DB but never send mail, throttle, or need a NextAuth session.
vi.mock("@/lib/email", () => ({
  sendBookingConfirmation: vi.fn().mockResolvedValue(undefined),
  sendOwnerNotification: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(() => true),
  getClientIp: vi.fn(() => "1.2.3.4"),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));

import { GET, POST } from "@/app/api/bookings/route";
import { getServerSession } from "next-auth";
import { rateLimit } from "@/lib/rate-limit";
import { db } from "@/db";
import { bookings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { resetDb, seedService, seedBooking, markAvailable, futureDateForWeekday } from "@/test/fixtures";

const MONDAY = futureDateForWeekday(1);
let serviceId: number;

function postReq(body: unknown) {
  return new NextRequest("http://localhost/api/bookings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    serviceId,
    customerName: "Jane Doe",
    customerEmail: "jane@example.com",
    customerPhone: "(555) 123-4567",
    vehicleYear: "2020",
    vehicleMake: "Toyota",
    vehicleModel: "Camry",
    appointmentDate: MONDAY,
    dropoffWindow: "morning",
    ...overrides,
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(rateLimit).mockReturnValue(true);
  await resetDb();
  await markAvailable(MONDAY); // every date is unavailable by default; open the one these tests book
  const svc = await seedService({ durationMins: 60 });
  serviceId = svc.id;
});

describe("POST /api/bookings", () => {
  it("creates a booking on a free window (201) and stores the resolved start time", async () => {
    const res = await POST(postReq(validBody()));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBeDefined();
    const [row] = await db.select().from(bookings);
    expect(row.dropoffWindow).toBe("morning");
    expect(row.appointmentTime.slice(0, 5)).toBe("07:00"); // resolved from business_hours
  });

  it("rejects invalid input with 400 and saves nothing", async () => {
    const res = await POST(postReq(validBody({ customerName: "" })));
    expect(res.status).toBe(400);
    expect(await db.select().from(bookings)).toHaveLength(0);
  });

  it("rejects an unknown drop-off window with 400", async () => {
    const res = await POST(postReq(validBody({ dropoffWindow: "afternoon" })));
    expect(res.status).toBe(400);
  });

  it("returns 409 when that window is already taken", async () => {
    await seedBooking({ serviceId, appointmentDate: MONDAY, dropoffWindow: "morning" });
    const res = await POST(postReq(validBody()));
    expect(res.status).toBe(409);
  });

  it("still allows the evening window when morning is taken", async () => {
    await seedBooking({ serviceId, appointmentDate: MONDAY, dropoffWindow: "morning" });
    const res = await POST(postReq(validBody({ dropoffWindow: "evening" })));
    expect(res.status).toBe(201);
    const [row] = await db.select().from(bookings).where(eq(bookings.dropoffWindow, "evening"));
    expect(row.appointmentTime.slice(0, 5)).toBe("15:00");
  });

  it("returns 429 when rate-limited", async () => {
    vi.mocked(rateLimit).mockReturnValueOnce(false);
    const res = await POST(postReq(validBody()));
    expect(res.status).toBe(429);
  });
});

describe("GET /api/bookings", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns the bookings list when authenticated", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { name: "Admin" } } as never);
    await seedBooking({ serviceId, appointmentDate: MONDAY, appointmentTime: "09:00" });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
  });
});
