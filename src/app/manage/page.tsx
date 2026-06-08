import Link from "next/link";
import { db } from "@/db";
import { bookings, services } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDuration } from "@/lib/utils";
import { dropoffSummary } from "@/lib/format";
import { getBusinessInfo } from "@/lib/business-info";
import { formatJobId } from "@/lib/job-id";
import { ManageActions } from "@/components/manage-actions";

export const dynamic = "force-dynamic";

export default async function ManageBookingPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const info = await getBusinessInfo();
  const initial = (info.name.trim()[0] ?? "N").toUpperCase();

  const result = token
    ? await db
        .select({
          id: bookings.id,
          jobId: bookings.jobId,
          serviceName: services.name,
          priceCents: services.priceCents,
          durationMins: services.durationMins,
          appointmentDate: bookings.appointmentDate,
          appointmentTime: bookings.appointmentTime,
          dropoffWindow: bookings.dropoffWindow,
          vehicleYear: bookings.vehicleYear,
          vehicleMake: bookings.vehicleMake,
          vehicleModel: bookings.vehicleModel,
          status: bookings.status,
        })
        .from(bookings)
        .innerJoin(services, eq(bookings.serviceId, services.id))
        .where(eq(bookings.confirmationToken, token))
    : [];

  const booking = result[0];
  const canCancel = booking && booking.status !== "cancelled" && booking.status !== "completed";

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
        <div className="max-w-lg mx-auto">
          {!booking ? (
            <div className="text-center">
              <h1 className="text-2xl font-bold mb-2 text-foreground">Booking not found</h1>
              <p className="text-muted-foreground mb-8">
                This link is invalid or has expired. If you need help, please get in touch.
              </p>
              <Button asChild>
                <Link href="/">Back to Home</Link>
              </Button>
            </div>
          ) : (
            <>
              <h1 className="text-3xl font-bold mb-2 text-foreground">Manage your booking</h1>
              <p className="text-muted-foreground mb-8 capitalize">
                Status: <span className="font-medium">{booking.status}</span>
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
                </CardContent>
              </Card>

              <div className="mt-6">
                {canCancel ? (
                  <ManageActions token={token!} />
                ) : (
                  <p className="text-sm text-muted-foreground text-center">
                    {booking.status === "cancelled"
                      ? "This appointment has been cancelled."
                      : "This appointment is complete. Reach out if you'd like to book again."}
                  </p>
                )}
              </div>

              <div className="mt-8 flex gap-4 justify-center">
                <Button asChild variant="outline">
                  <Link href="/">Back to Home</Link>
                </Button>
                <Button asChild>
                  <Link href="/booking">Book Again</Link>
                </Button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
