import Link from "next/link";
import { db } from "@/db";
import { bookings, services } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle } from "lucide-react";
import { formatCurrency, formatDuration } from "@/lib/utils";

export const dynamic = "force-dynamic";

function formatTime(time: string): string {
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${display}:${m} ${ampm}`;
}

export default async function ConfirmationPage({
  searchParams,
}: {
  searchParams: { id?: string };
}) {
  if (!searchParams.id) redirect("/");

  const result = await db
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
      status: bookings.status,
    })
    .from(bookings)
    .innerJoin(services, eq(bookings.serviceId, services.id))
    .where(eq(bookings.id, parseInt(searchParams.id)));

  if (result.length === 0) redirect("/");
  const booking = result[0];

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-white">
        <div className="container flex h-16 items-center">
          <Link href="/" className="text-xl font-bold text-primary">
            Premium Auto Detailing
          </Link>
        </div>
      </header>

      <main className="flex-1 container py-12">
        <div className="max-w-lg mx-auto text-center">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Booking Confirmed!</h1>
          <p className="text-muted-foreground mb-8">
            Your appointment has been scheduled. You&apos;ll receive a confirmation at {booking.customerEmail}.
          </p>

          <Card>
            <CardContent className="p-6 space-y-3 text-left">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Booking #</span>
                <span className="font-medium">{booking.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Service</span>
                <span className="font-medium">{booking.serviceName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Price</span>
                <span className="font-medium">{formatCurrency(booking.priceCents)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Date</span>
                <span className="font-medium">
                  {new Date(booking.appointmentDate + "T00:00:00").toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Time</span>
                <span className="font-medium">{formatTime(booking.appointmentTime)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Duration</span>
                <span className="font-medium">{formatDuration(booking.durationMins)}</span>
              </div>
              <hr />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Vehicle</span>
                <span className="font-medium">
                  {booking.vehicleYear} {booking.vehicleMake} {booking.vehicleModel}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <span className="capitalize font-medium">{booking.status}</span>
              </div>
            </CardContent>
          </Card>

          <div className="mt-8 flex gap-4 justify-center">
            <Button asChild variant="outline">
              <Link href="/">Back to Home</Link>
            </Button>
            <Button asChild>
              <Link href="/booking">Book Another</Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
