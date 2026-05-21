export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { db } from "@/db";
import { bookings, services } from "@/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { sendBookingStatusUpdate } from "@/lib/email";

// Sends next-day reminders. Intended to be triggered once a day by the k8s CronJob
// (see k8s/base/reminder-cronjob.yaml), guarded by a shared CRON_SECRET bearer token.
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const target = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;

  const due = await db
    .select({
      id: bookings.id,
      serviceName: services.name,
      priceCents: services.priceCents,
      durationMins: services.durationMins,
      customerName: bookings.customerName,
      customerEmail: bookings.customerEmail,
      customerPhone: bookings.customerPhone,
      vehicleYear: bookings.vehicleYear,
      vehicleMake: bookings.vehicleMake,
      vehicleModel: bookings.vehicleModel,
      appointmentDate: bookings.appointmentDate,
      appointmentTime: bookings.appointmentTime,
    })
    .from(bookings)
    .innerJoin(services, eq(bookings.serviceId, services.id))
    .where(
      and(
        eq(bookings.appointmentDate, target),
        inArray(bookings.status, ["pending", "confirmed"]),
        isNull(bookings.reminderSentAt),
      ),
    );

  let sent = 0;
  for (const b of due) {
    try {
      await sendBookingStatusUpdate(
        {
          bookingId: b.id,
          serviceName: b.serviceName,
          priceCents: b.priceCents,
          durationMins: b.durationMins,
          customerName: b.customerName,
          customerEmail: b.customerEmail,
          customerPhone: b.customerPhone,
          vehicleYear: b.vehicleYear,
          vehicleMake: b.vehicleMake,
          vehicleModel: b.vehicleModel,
          appointmentDate: b.appointmentDate,
          appointmentTime: b.appointmentTime,
        },
        "reminder",
      );
      await db
        .update(bookings)
        .set({ reminderSentAt: new Date() })
        .where(eq(bookings.id, b.id));
      sent++;
    } catch (err) {
      console.error(`[reminders] failed for booking #${b.id}:`, err);
    }
  }

  return Response.json({ target, due: due.length, sent });
}
