export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { db } from "@/db";
import { bookings, services } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { bookingSchema } from "@/lib/validations";
import { getAvailableSlots } from "@/lib/availability";

export async function GET() {
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
  const body = await request.json();
  const parsed = bookingSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Verify slot is still available
  const slots = await getAvailableSlots(parsed.data.appointmentDate, parsed.data.serviceId);
  const slot = slots.find((s) => s.time === parsed.data.appointmentTime);
  if (!slot || !slot.available) {
    return Response.json({ error: "This time slot is no longer available" }, { status: 409 });
  }

  const [booking] = await db.insert(bookings).values(parsed.data).returning();
  return Response.json(booking, { status: 201 });
}
