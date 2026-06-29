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
import { bookings, promoCodes, referralCodes, referralTokens } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  resetDb,
  seedService,
  seedBooking,
  seedPromoCode,
  seedReferralCode,
  markAvailable,
  futureDateForWeekday,
} from "@/test/fixtures";
import { verifyDeviceToken, DEVICE_COOKIE } from "@/lib/customer-session";

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

  it("trusts the creating device for the new booking (sets cust_device)", async () => {
    const res = await POST(postReq(validBody()));
    expect(res.status).toBe(201);
    const body = await res.json();
    const setCookie = res.headers.get("set-cookie");
    const m = setCookie?.match(new RegExp(`${DEVICE_COOKIE}=([^;]+)`));
    expect(m).not.toBeNull();
    const verified = verifyDeviceToken(decodeURIComponent(m![1]));
    expect(verified?.bookingIds).toContain(body.id);
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

describe("POST /api/bookings — discounts", () => {
  it("snapshots base + final price on the booking (no discount)", async () => {
    const res = await POST(postReq(validBody()));
    expect(res.status).toBe(201);
    const [row] = await db.select().from(bookings);
    expect(row.basePriceCents).toBe(15000);
    expect(row.finalPriceCents).toBe(15000);
    expect(row.discountPercent).toBe(0);
  });

  it("issues the booker a personal referral code", async () => {
    await POST(postReq(validBody()));
    const codes = await db
      .select()
      .from(referralCodes)
      .where(eq(referralCodes.ownerEmail, "jane@example.com"));
    expect(codes).toHaveLength(1);
    expect(codes[0].code).toBeTruthy();
  });

  it("applies a valid promo code (10%) and increments used_count", async () => {
    await seedPromoCode({ code: "LAUNCH10", percentOff: 10, maxUses: 5 });
    const res = await POST(postReq(validBody({ promoCode: "LAUNCH10" })));
    expect(res.status).toBe(201);
    const [row] = await db.select().from(bookings);
    expect(row.discountPercent).toBe(10);
    expect(row.finalPriceCents).toBe(13500);
    expect(row.promoCodeId).not.toBeNull();
    const [promo] = await db.select().from(promoCodes);
    expect(promo.usedCount).toBe(1);
  });

  it("does not discount when the promo code is exhausted (past max uses)", async () => {
    await seedPromoCode({ code: "LAUNCH10", percentOff: 10, maxUses: 1, usedCount: 1 });
    const res = await POST(postReq(validBody({ promoCode: "LAUNCH10" })));
    expect(res.status).toBe(201);
    const [row] = await db.select().from(bookings);
    expect(row.discountPercent).toBe(0);
    expect(row.finalPriceCents).toBe(15000);
    const [promo] = await db.select().from(promoCodes);
    expect(promo.usedCount).toBe(1); // unchanged
  });

  it("auto-applies the same-day 20% when this email booked earlier today", async () => {
    // A prior booking under the same email, created today (NOW()), on a different date/window.
    await seedBooking({
      serviceId,
      appointmentDate: futureDateForWeekday(2),
      dropoffWindow: "evening",
      appointmentTime: "15:00",
      customerEmail: "jane@example.com",
    });
    const res = await POST(postReq(validBody()));
    expect(res.status).toBe(201);
    const [row] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.appointmentDate, MONDAY));
    expect(row.sameDayDiscount).toBe(true);
    expect(row.discountPercent).toBe(20);
    expect(row.finalPriceCents).toBe(12000);
  });

  it("same-day 20% wins over a promo code (promo not consumed)", async () => {
    await seedPromoCode({ code: "LAUNCH10", percentOff: 10, maxUses: 5 });
    await seedBooking({
      serviceId,
      appointmentDate: futureDateForWeekday(2),
      dropoffWindow: "evening",
      appointmentTime: "15:00",
      customerEmail: "jane@example.com",
    });
    const res = await POST(postReq(validBody({ promoCode: "LAUNCH10" })));
    expect(res.status).toBe(201);
    const [row] = await db.select().from(bookings).where(eq(bookings.appointmentDate, MONDAY));
    expect(row.discountPercent).toBe(20);
    expect(row.promoCodeId).toBeNull();
    const [promo] = await db.select().from(promoCodes);
    expect(promo.usedCount).toBe(0); // not consumed
  });

  it("credits the referrer with a token when a friend's code is used (referrer only)", async () => {
    await seedReferralCode("alice@example.com", "ABCD2345");
    const res = await POST(postReq(validBody({ referralCode: "ABCD2345" })));
    expect(res.status).toBe(201);
    // Referee (jane) gets no discount...
    const [row] = await db.select().from(bookings);
    expect(row.discountPercent).toBe(0);
    // ...but alice earns an available token.
    const tokens = await db
      .select()
      .from(referralTokens)
      .where(eq(referralTokens.ownerEmail, "alice@example.com"));
    expect(tokens).toHaveLength(1);
    expect(tokens[0].status).toBe("available");
  });

  it("blocks self-referral (no token granted)", async () => {
    await seedReferralCode("jane@example.com", "JANE2345");
    const res = await POST(postReq(validBody({ referralCode: "JANE2345" })));
    expect(res.status).toBe(201);
    const tokens = await db.select().from(referralTokens);
    expect(tokens).toHaveLength(0);
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
