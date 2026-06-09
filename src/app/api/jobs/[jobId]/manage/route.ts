export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { db } from "@/db";
import { bookings } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { customerManageSchema } from "@/lib/validations";
import { isWindowAvailable } from "@/lib/availability";
import { notifyBookingStatus } from "@/lib/email";
import { normalizeJobId } from "@/lib/job-id";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { requireCustomerBooking } from "@/lib/customer-session";

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
  const { cancel, appointmentDate, dropoffWindow, ...contact } = parsed.data;

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
