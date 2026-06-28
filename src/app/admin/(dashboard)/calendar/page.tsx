import { db } from "@/db";
import { bookings, services, availableDates } from "@/db/schema";
import { eq, asc, sql } from "drizzle-orm";
import { BookingCalendar } from "@/components/admin/booking-calendar";

export const dynamic = "force-dynamic";

export default async function AdminCalendarPage() {
  // All admin-opened dates with their per-date windows (authoritative for availability).
  const openDates = await db
    .select()
    .from(availableDates)
    .orderBy(asc(availableDates.date));

  // Non-cancelled bookings (the ones that actually hold a window), joined for display.
  const bookingRows = await db
    .select({
      id: bookings.id,
      serviceName: services.name,
      customerName: bookings.customerName,
      vehicleYear: bookings.vehicleYear,
      vehicleMake: bookings.vehicleMake,
      vehicleModel: bookings.vehicleModel,
      appointmentDate: bookings.appointmentDate,
      appointmentTime: bookings.appointmentTime,
      dropoffWindow: bookings.dropoffWindow,
      status: bookings.status,
    })
    .from(bookings)
    .innerJoin(services, eq(bookings.serviceId, services.id))
    .where(sql`${bookings.status} != 'cancelled'`)
    .orderBy(asc(bookings.appointmentDate));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Calendar</h1>
      <BookingCalendar openDates={openDates} bookings={bookingRows} />
    </div>
  );
}
