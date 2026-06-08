import { NextRequest } from "next/server";
import { db } from "@/db";
import { bookings } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { bookingUpdateSchema } from "@/lib/validations";
import { isWindowAvailable } from "@/lib/availability";
import { notifyBookingStatus } from "@/lib/email";
import { requireAdmin } from "@/lib/require-admin";

type Booking = typeof bookings.$inferSelect;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const id = parseInt((await params).id);
  if (Number.isNaN(id)) {
    return Response.json({ error: "Invalid booking id" }, { status: 400 });
  }

  const body = await request.json();
  const parsed = bookingUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const updates = parsed.data;

  const [existing] = await db.select().from(bookings).where(eq(bookings.id, id));
  if (!existing) {
    return Response.json({ error: "Booking not found" }, { status: 404 });
  }

  const targetDate = updates.appointmentDate ?? existing.appointmentDate;
  const targetWindow = updates.dropoffWindow ?? existing.dropoffWindow;
  const isReschedule =
    (updates.appointmentDate !== undefined &&
      updates.appointmentDate !== existing.appointmentDate) ||
    (updates.dropoffWindow !== undefined && updates.dropoffWindow !== existing.dropoffWindow);

  let updated: Booking;
  if (isReschedule) {
    // Re-check availability and write atomically, same advisory-lock guard as create. The
    // window's start time is resolved server-side and stored as appointmentTime.
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${targetDate}))`);
      const { ok, startTime } = await isWindowAvailable(tx, targetDate, targetWindow, id);
      if (!ok || !startTime) return null;
      const [row] = await tx
        .update(bookings)
        .set({ ...updates, appointmentTime: startTime })
        .where(eq(bookings.id, id))
        .returning();
      return row;
    });
    if (!result) {
      return Response.json(
        { error: "That drop-off window is not available" },
        { status: 409 },
      );
    }
    updated = result;
  } else {
    const [row] = await db
      .update(bookings)
      .set(updates)
      .where(eq(bookings.id, id))
      .returning();
    updated = row;
  }

  // Notify the customer about the meaningful change.
  if (isReschedule) {
    await notifyBookingStatus(updated, "rescheduled");
  } else if (updates.status && updates.status !== existing.status) {
    if (updates.status === "confirmed") await notifyBookingStatus(updated, "confirmed");
    else if (updates.status === "cancelled") await notifyBookingStatus(updated, "cancelled");
  }

  return Response.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const id = parseInt((await params).id);
  if (Number.isNaN(id)) {
    return Response.json({ error: "Invalid booking id" }, { status: 400 });
  }

  const [existing] = await db.select().from(bookings).where(eq(bookings.id, id));
  if (!existing) {
    return Response.json({ error: "Booking not found" }, { status: 404 });
  }
  if (existing.status === "cancelled") {
    return Response.json(existing);
  }

  const [updated] = await db
    .update(bookings)
    .set({ status: "cancelled" })
    .where(eq(bookings.id, id))
    .returning();

  await notifyBookingStatus(updated, "cancelled");

  return Response.json(updated);
}
