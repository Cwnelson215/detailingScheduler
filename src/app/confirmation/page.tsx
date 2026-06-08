import Link from "next/link";
import { db } from "@/db";
import { bookings, services } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle } from "lucide-react";
import { formatCurrency, formatDuration } from "@/lib/utils";
import { dropoffSummary } from "@/lib/format";
import { getBusinessInfo } from "@/lib/business-info";
import { formatJobId } from "@/lib/job-id";

export const dynamic = "force-dynamic";

export default async function ConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!token) redirect("/");

  const result = await db
    .select({
      id: bookings.id,
      jobId: bookings.jobId,
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
      dropoffWindow: bookings.dropoffWindow,
      status: bookings.status,
    })
    .from(bookings)
    .innerJoin(services, eq(bookings.serviceId, services.id))
    .where(eq(bookings.confirmationToken, token));

  if (result.length === 0) redirect("/");
  const booking = result[0];
  const info = await getBusinessInfo();
  const initial = (info.name.trim()[0] ?? "N").toUpperCase();

  return (
    <div className="flex min-h-screen flex-col bg-secondary/40">
      <header className="sticky top-0 z-30 border-b border-border bg-white/80 backdrop-blur">
        <div className="container flex h-20 items-center">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground font-display text-sm font-bold text-white">
              {initial}
            </span>
            <span className="font-display text-lg font-semibold tracking-tight text-foreground">
              {info.name}
            </span>
          </Link>
        </div>
      </header>

      <main className="flex-1 container py-12">
        <div className="max-w-lg mx-auto text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <CheckCircle className="h-9 w-9 text-green-600" />
          </div>
          <h1 className="text-3xl font-bold mb-2 text-foreground">Booking confirmed!</h1>
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
                <span className="text-muted-foreground">Job ID</span>
                <span className="font-medium">{formatJobId(booking.jobId)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Service</span>
                <span className="font-medium">{booking.serviceName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Price</span>
                <span className="font-medium">{formatCurrency(booking.priceCents)}<span className="text-muted-foreground">*</span></span>
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
                <span className="text-muted-foreground">Drop-off</span>
                <span className="font-medium">{dropoffSummary(booking.dropoffWindow, booking.appointmentTime)}</span>
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

          <p className="mx-auto mt-4 max-w-md text-sm text-muted-foreground">
            * Final pricing may vary depending on the condition of your vehicle.
            Especially dirty or heavily soiled vehicles may incur an additional charge.
          </p>

          <p className="mx-auto mt-4 max-w-md text-sm text-muted-foreground">
            Want to reschedule, cancel, or message us? Use{" "}
            <span className="font-medium">Manage this booking</span> below — on this device you can
            make changes right away by entering your Job ID (above), no email code needed. From
            another device, look up your booking anytime with your email at{" "}
            <Link href="/lookup" className="font-medium text-primary hover:underline">
              {info.name} / lookup
            </Link>
            , so keep this Job ID handy.
          </p>

          <div className="mt-8 flex flex-wrap gap-4 justify-center">
            <Button asChild>
              <Link href={`/my-booking/${token}`}>Manage this booking</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/">Back to Home</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/booking">Book Another</Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
