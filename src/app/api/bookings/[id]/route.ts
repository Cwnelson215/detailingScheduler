import { NextRequest } from "next/server";
import { db } from "@/db";
import { bookings, services } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { bookingUpdateSchema } from "@/lib/validations";
import { isSlotAvailable } from "@/lib/availability";
import { sendBookingStatusUpdate } from "@/lib/email";
import { requireAdmin } from "@/lib/require-admin";

type Booking = typeof bookings.$inferSelect;
type StatusKind = "confirmed" | "cancelled" | "rescheduled";

// Email the customer about a status change. Best-effort: a mail failure must never
// fail the admin's request, mirroring the booking-creation flow.
async function notifyCustomer(booking: Booking, kind: StatusKind): Promise<void> {
  try {
    const [service] = await db
      .select({
        name: services.name,
        priceCents: services.priceCents,
        durationMins: services.durationMins,
      })
      .from(services)
      .where(eq(services.id, booking.serviceId));
    if (!service) return;

    await sendBookingStatusUpdate(
      {
        bookingId: booking.id,
        serviceName: service.name,
        priceCents: service.priceCents,
        durationMins: service.durationMins,
        customerName: booking.customerName,
        customerEmail: booking.customerEmail,
        customerPhone: booking.customerPhone,
        vehicleYear: booking.vehicleYear,
        vehicleMake: booking.vehicleMake,
        vehicleModel: booking.vehicleModel,
        appointmentDate: booking.appointmentDate,
        appointmentTime: booking.appointmentTime,
      },
      kind,
    );
  } catch (err) {
    console.error(`[bookings] failed to send ${kind} email for booking #${booking.id}:`, err);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const id = parseInt(params.id);
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
  const targetTime = updates.appointmentTime ?? existing.appointmentTime.slice(0, 5);
  const isReschedule =
    (updates.appointmentDate !== undefined &&
      updates.appointmentDate !== existing.appointmentDate) ||
    (updates.appointmentTime !== undefined &&
      updates.appointmentTime !== existing.appointmentTime.slice(0, 5));

  let updated: Booking;
  if (isReschedule) {
    // Re-check availability and write atomically, same advisory-lock guard as create.
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${targetDate}))`);
      const available = await isSlotAvailable(tx, targetDate, targetTime, existing.serviceId, id);
      if (!available) return null;
      const [row] = await tx
        .update(bookings)
        .set(updates)
        .where(eq(bookings.id, id))
        .returning();
      return row;
    });
    if (!result) {
      return Response.json(
        { error: "That time slot is not available" },
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
    await notifyCustomer(updated, "rescheduled");
  } else if (updates.status && updates.status !== existing.status) {
    if (updates.status === "confirmed") await notifyCustomer(updated, "confirmed");
    else if (updates.status === "cancelled") await notifyCustomer(updated, "cancelled");
  }

  return Response.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const id = parseInt(params.id);
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

  await notifyCustomer(updated, "cancelled");

  return Response.json(updated);
}
