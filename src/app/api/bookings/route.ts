export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { db } from "@/db";
import { bookings, services, promoCodes, referralCodes, referralTokens } from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { bookingSchema } from "@/lib/validations";
import { requireAdmin } from "@/lib/require-admin";
import { isWindowAvailable } from "@/lib/availability";
import { sendBookingConfirmation, sendOwnerNotification } from "@/lib/email";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { addTrustedBooking, normalizeEmail } from "@/lib/customer-session";
import { effectiveDiscountPercent, finalCents } from "@/lib/pricing";
import { generateJobId, normalizeJobId } from "@/lib/job-id";
import { logger } from "@/lib/logger";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const result = await db
    .select({
      id: bookings.id,
      serviceId: bookings.serviceId,
      serviceName: services.name,
      customerName: bookings.customerName,
      customerEmail: bookings.customerEmail,
      customerPhone: bookings.customerPhone,
      vehicleYear: bookings.vehicleYear,
      vehicleMake: bookings.vehicleMake,
      vehicleModel: bookings.vehicleModel,
      appointmentDate: bookings.appointmentDate,
      appointmentTime: bookings.appointmentTime,
      status: bookings.status,
      notes: bookings.notes,
      createdAt: bookings.createdAt,
    })
    .from(bookings)
    .innerJoin(services, eq(bookings.serviceId, services.id))
    .orderBy(desc(bookings.appointmentDate));

  return Response.json(result);
}

export async function POST(request: NextRequest) {
  if (!rateLimit(`bookings:${getClientIp(request)}`, 10, 10 * 60 * 1000)) {
    return Response.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const body = await request.json();
  const parsed = bookingSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // promoCode/referralCode are not booking columns — split them out before the insert.
  const { promoCode, referralCode, ...bookingData } = parsed.data;
  const bookerEmail = normalizeEmail(bookingData.customerEmail);

  // Re-verify the window is free and insert atomically. A per-day advisory lock serializes
  // concurrent booking attempts for the same date so two requests can't both pass the
  // check-then-insert window and double-book a window. The window's start time is resolved
  // server-side and stored as appointmentTime. `null` => window taken.
  // The unique job_id is generated per insert ($defaultFn); on the astronomically rare
  // collision (23505 on bookings_job_id_idx) we retry, which regenerates it. A 23505 on the
  // (date, window) index means the window was just taken by a concurrent request => 409.
  // Discount resolution (same-day check, promo consume, referral credit) all happens inside
  // this same transaction so a retry/conflict rolls it back — no phantom promo consumption.
  let booking: typeof bookings.$inferSelect | null = null;
  let ownReferralCode: string | undefined;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const result = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${bookingData.appointmentDate}))`);
        const { ok, startTime } = await isWindowAvailable(
          tx,
          bookingData.appointmentDate,
          bookingData.dropoffWindow,
        );
        if (!ok || !startTime) return null;

        const [service] = await tx
          .select({ priceCents: services.priceCents })
          .from(services)
          .where(eq(services.id, bookingData.serviceId));
        const basePriceCents = service?.priceCents ?? 0;

        // Same-day repeat: any earlier non-cancelled booking under this email made today (by
        // created_at) makes this an automatic 20% booking. The 20% is standalone and always
        // wins, so when it applies we don't even consume a promo code.
        const priorToday = await tx
          .select({ id: bookings.id })
          .from(bookings)
          .where(
            sql`lower(${bookings.customerEmail}) = ${bookerEmail} AND ${bookings.status} != 'cancelled' AND ${bookings.createdAt}::date = current_date`,
          )
          .limit(1);
        const sameDay = priorToday.length > 0;

        // Promo (only when not a same-day booking). Guarded conditional UPDATE makes the
        // "first N uses" cap race-safe: only a row that's still active, under its cap, and
        // unexpired increments and returns — otherwise no discount, booking still proceeds.
        let promoCodeId: number | null = null;
        let promoPercent = 0;
        if (!sameDay && promoCode) {
          const consumed = await tx
            .update(promoCodes)
            .set({ usedCount: sql`${promoCodes.usedCount} + 1` })
            .where(
              and(
                eq(promoCodes.code, promoCode),
                eq(promoCodes.isActive, true),
                sql`(${promoCodes.maxUses} IS NULL OR ${promoCodes.usedCount} < ${promoCodes.maxUses})`,
                sql`(${promoCodes.expiresAt} IS NULL OR ${promoCodes.expiresAt} >= current_date)`,
              ),
            )
            .returning({ id: promoCodes.id, percentOff: promoCodes.percentOff });
          if (consumed[0]) {
            promoCodeId = consumed[0].id;
            promoPercent = consumed[0].percentOff;
          }
        }

        const discountPercent = effectiveDiscountPercent({ sameDay, promoPercent });
        const finalPriceCents = finalCents(basePriceCents, discountPercent);

        const [row] = await tx
          .insert(bookings)
          .values({
            ...bookingData,
            appointmentTime: startTime,
            basePriceCents,
            finalPriceCents,
            discountPercent,
            promoCodeId,
            sameDayDiscount: sameDay,
          })
          .returning();

        // Ensure this booker has a personal referral code to share (idempotent per email).
        let myCode: string | undefined;
        const existingRef = await tx
          .select({ code: referralCodes.code })
          .from(referralCodes)
          .where(eq(referralCodes.ownerEmail, bookerEmail))
          .limit(1);
        if (existingRef[0]) {
          myCode = existingRef[0].code;
        } else {
          for (let i = 0; i < 5; i++) {
            const code = generateJobId();
            const ins = await tx
              .insert(referralCodes)
              .values({ code, ownerEmail: bookerEmail })
              .onConflictDoNothing()
              .returning({ code: referralCodes.code });
            if (ins[0]) {
              myCode = ins[0].code;
              break;
            }
            // Conflict: either the email row was created concurrently, or a rare code
            // collision — re-read the email's code and stop if it now exists.
            const re = await tx
              .select({ code: referralCodes.code })
              .from(referralCodes)
              .where(eq(referralCodes.ownerEmail, bookerEmail))
              .limit(1);
            if (re[0]) {
              myCode = re[0].code;
              break;
            }
          }
        }

        // Credit the referrer (if a valid friend's code was entered, and it isn't self-referral).
        if (referralCode) {
          const refNorm = normalizeJobId(referralCode);
          const [owner] = await tx
            .select({ ownerEmail: referralCodes.ownerEmail })
            .from(referralCodes)
            .where(eq(referralCodes.code, refNorm))
            .limit(1);
          if (owner && owner.ownerEmail !== bookerEmail) {
            await tx
              .insert(referralTokens)
              .values({ ownerEmail: owner.ownerEmail, sourceBookingId: row.id });
          }
        }

        return { row, myCode };
      });
      booking = result?.row ?? null;
      ownReferralCode = result?.myCode;
      break;
    } catch (err) {
      const code = (err as { code?: string })?.code;
      const message = String((err as { message?: string })?.message ?? "");
      if (code === "23505" && message.includes("date_window")) {
        booking = null;
        break;
      }
      const isJobIdCollision = code === "23505" && message.includes("job_id");
      if (isJobIdCollision && attempt < 4) continue;
      throw err;
    }
  }

  if (!booking) {
    return Response.json({ error: "This drop-off window is no longer available" }, { status: 409 });
  }

  const [service] = await db
    .select({ name: services.name, durationMins: services.durationMins })
    .from(services)
    .where(eq(services.id, booking.serviceId));

  if (service) {
    const baseUrl = process.env.SITE_URL || "https://detailing.cwnel.com";
    const emailInput = {
      bookingId: booking.id,
      jobId: booking.jobId ?? undefined,
      serviceName: service.name,
      priceCents: booking.finalPriceCents ?? 0,
      basePriceCents: booking.basePriceCents ?? 0,
      discountPercent: booking.discountPercent,
      durationMins: service.durationMins,
      customerName: booking.customerName,
      customerEmail: booking.customerEmail,
      customerPhone: booking.customerPhone,
      vehicleYear: booking.vehicleYear,
      vehicleMake: booking.vehicleMake,
      vehicleModel: booking.vehicleModel,
      appointmentDate: booking.appointmentDate,
      appointmentTime: booking.appointmentTime,
      dropoffWindow: booking.dropoffWindow,
    };

    const results = await Promise.allSettled([
      sendBookingConfirmation({
        ...emailInput,
        manageUrl: `${baseUrl}/my-booking/${booking.confirmationToken}`,
        referralCode: ownReferralCode,
      }),
      sendOwnerNotification(emailInput),
    ]);
    for (const r of results) {
      if (r.status === "rejected") {
        logger.error("booking email send failed", { bookingId: booking.id, err: String(r.reason) });
      }
    }
  }

  // Trust this device for the booking it just created, so the customer can manage it (Job ID
  // only, no emailed code) for the cookie's TTL. See src/lib/customer-session.
  const headers = new Headers();
  headers.append("Set-Cookie", addTrustedBooking(request, booking.id));
  return Response.json(booking, { status: 201, headers });
}
