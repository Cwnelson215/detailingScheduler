export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/db";
import { bookings, services } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { authOptions } from "@/lib/auth";
import { bookingSchema } from "@/lib/validations";
import { isWindowAvailable } from "@/lib/availability";
import { sendBookingConfirmation, sendOwnerNotification } from "@/lib/email";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { addTrustedBooking } from "@/lib/customer-session";
import { logger } from "@/lib/logger";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  // Re-verify the window is free and insert atomically. A per-day advisory lock serializes
  // concurrent booking attempts for the same date so two requests can't both pass the
  // check-then-insert window and double-book a window. The window's start time is resolved
  // server-side and stored as appointmentTime. `null` => window taken.
  // The unique job_id is generated per insert ($defaultFn); on the astronomically rare
  // collision (23505 on bookings_job_id_idx) we retry, which regenerates it. A 23505 on the
  // (date, window) index means the window was just taken by a concurrent request => 409.
  let booking: typeof bookings.$inferSelect | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      booking = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${parsed.data.appointmentDate}))`);
        const { ok, startTime } = await isWindowAvailable(
          tx,
          parsed.data.appointmentDate,
          parsed.data.dropoffWindow,
        );
        if (!ok || !startTime) return null;
        const [row] = await tx
          .insert(bookings)
          .values({ ...parsed.data, appointmentTime: startTime })
          .returning();
        return row;
      });
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
    .select({ name: services.name, priceCents: services.priceCents, durationMins: services.durationMins })
    .from(services)
    .where(eq(services.id, booking.serviceId));

  if (service) {
    const baseUrl = process.env.SITE_URL || "https://detailing.cwnel.com";
    const emailInput = {
      bookingId: booking.id,
      jobId: booking.jobId ?? undefined,
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
      dropoffWindow: booking.dropoffWindow,
    };

    const results = await Promise.allSettled([
      sendBookingConfirmation({
        ...emailInput,
        manageUrl: `${baseUrl}/my-booking/${booking.confirmationToken}`,
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
