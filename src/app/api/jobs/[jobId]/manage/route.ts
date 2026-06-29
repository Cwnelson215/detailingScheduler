export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { db } from "@/db";
import { bookings, referralTokens } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { customerManageSchema } from "@/lib/validations";
import { isWindowAvailable } from "@/lib/availability";
import { notifyBookingStatus } from "@/lib/email";
import { normalizeJobId } from "@/lib/job-id";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { requireCustomerBooking, normalizeEmail } from "@/lib/customer-session";
import { effectiveDiscountPercent, finalCents, REFERRAL_PERCENT } from "@/lib/pricing";

type Booking = typeof bookings.$inferSelect;

// Customer self-service: reschedule, edit contact/vehicle details, or cancel. Uses POST
// (not PATCH) because middleware.ts reserves PATCH/DELETE on /api/bookings for admins.
// Authorized by the booking-scoped cookie issued at lookup, not an admin session.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  if (!rateLimit(`manage:${getClientIp(request)}`, 20, 10 * 60 * 1000)) {
    return Response.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const jobId = normalizeJobId((await params).jobId);
  const [existing] = await db.select().from(bookings).where(eq(bookings.jobId, jobId));
  if (!existing) {
    return Response.json({ error: "Booking not found" }, { status: 404 });
  }
  if (!requireCustomerBooking(request, existing.id)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = customerManageSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { cancel, appointmentDate, dropoffWindow, applyReferralToken, removeReferralToken, ...contact } =
    parsed.data;

  // --- Apply a referral token (15%) from the customer's bank to this booking ---
  if (applyReferralToken) {
    if (existing.status === "cancelled" || existing.status === "completed") {
      return Response.json({ error: "This booking can no longer be changed." }, { status: 409 });
    }
    if (existing.sameDayDiscount) {
      return Response.json(
        { error: "This booking has the same-day discount, which can't be combined with a referral." },
        { status: 409 },
      );
    }
    if (existing.referralTokenId) {
      return Response.json(
        { error: "A referral discount is already applied to this booking." },
        { status: 409 },
      );
    }
    const ownerEmail = normalizeEmail(existing.customerEmail);
    const updated = await db.transaction(async (tx) => {
      // Lock one available token so two concurrent applies can't claim the same credit.
      const [token] = await tx
        .select({ id: referralTokens.id })
        .from(referralTokens)
        .where(and(eq(referralTokens.ownerEmail, ownerEmail), eq(referralTokens.status, "available")))
        .limit(1)
        .for("update");
      if (!token) return null;

      const base = existing.basePriceCents ?? 0;
      const discountPercent = effectiveDiscountPercent({
        sameDay: false,
        promoPercent: existing.discountPercent, // whatever promo was already on the booking
        referralPercent: REFERRAL_PERCENT,
      });
      await tx
        .update(referralTokens)
        .set({ status: "applied", appliedBookingId: existing.id, appliedAt: new Date() })
        .where(eq(referralTokens.id, token.id));
      const [row] = await tx
        .update(bookings)
        .set({
          referralTokenId: token.id,
          discountPercent,
          finalPriceCents: finalCents(base, discountPercent),
        })
        .where(eq(bookings.id, existing.id))
        .returning();
      return row;
    });
    if (!updated) {
      return Response.json({ error: "No referral credit available." }, { status: 409 });
    }
    return Response.json(updated);
  }

  // --- Remove a previously-applied referral token (return it to the bank) ---
  if (removeReferralToken) {
    if (!existing.referralTokenId) {
      return Response.json({ error: "No referral discount is applied." }, { status: 409 });
    }
    if (existing.status === "completed") {
      return Response.json({ error: "This booking can no longer be changed." }, { status: 409 });
    }
    const tokenId = existing.referralTokenId;
    const base = existing.basePriceCents ?? 0;
    const discountPercent = effectiveDiscountPercent({
      sameDay: false,
      promoPercent: existing.discountPercent - REFERRAL_PERCENT,
    });
    const updated = await db.transaction(async (tx) => {
      await tx
        .update(referralTokens)
        .set({ status: "available", appliedBookingId: null, appliedAt: null })
        .where(eq(referralTokens.id, tokenId));
      const [row] = await tx
        .update(bookings)
        .set({
          referralTokenId: null,
          discountPercent,
          finalPriceCents: finalCents(base, discountPercent),
        })
        .where(eq(bookings.id, existing.id))
        .returning();
      return row;
    });
    return Response.json(updated);
  }

  // --- Cancel ---
  if (cancel) {
    if (existing.status === "cancelled") {
      return Response.json({ status: "cancelled" });
    }
    if (existing.status === "ready" || existing.status === "completed") {
      return Response.json(
        { error: "This booking can no longer be cancelled." },
        { status: 409 },
      );
    }
    const [updated] = await db
      .update(bookings)
      .set({ status: "cancelled" })
      .where(eq(bookings.id, existing.id))
      .returning();
    await notifyBookingStatus(updated, "cancelled");
    return Response.json(updated);
  }

  const isReschedule =
    (appointmentDate !== undefined && appointmentDate !== existing.appointmentDate) ||
    (dropoffWindow !== undefined && dropoffWindow !== existing.dropoffWindow);

  // Non-schedule edits (contact/vehicle) — safe to set without the slot lock.
  const contactUpdates = Object.fromEntries(
    Object.entries(contact).filter(([, v]) => v !== undefined),
  );

  let updated: Booking;
  if (isReschedule) {
    const targetDate = appointmentDate ?? existing.appointmentDate;
    const targetWindow = dropoffWindow ?? existing.dropoffWindow;
    // Same advisory-lock + availability guard as create / admin reschedule. The window's
    // start time is resolved server-side and stored as appointmentTime.
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${targetDate}))`);
      const { ok, startTime } = await isWindowAvailable(tx, targetDate, targetWindow, existing.id);
      if (!ok || !startTime) return null;
      const [row] = await tx
        .update(bookings)
        .set({
          ...contactUpdates,
          appointmentDate: targetDate,
          dropoffWindow: targetWindow,
          appointmentTime: startTime,
        })
        .where(eq(bookings.id, existing.id))
        .returning();
      return row;
    });
    if (!result) {
      return Response.json({ error: "That drop-off window is not available" }, { status: 409 });
    }
    updated = result;
  } else {
    const [row] = await db
      .update(bookings)
      .set(contactUpdates)
      .where(eq(bookings.id, existing.id))
      .returning();
    updated = row;
  }

  // Only a reschedule warrants a customer email (contact/vehicle edits are self-made).
  if (isReschedule) {
    await notifyBookingStatus(updated, "rescheduled");
  }

  return Response.json(updated);
}
