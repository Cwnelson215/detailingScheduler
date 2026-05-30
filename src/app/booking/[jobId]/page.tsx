import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { bookings, services } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDuration } from "@/lib/utils";
import { getBusinessInfo } from "@/lib/business-info";
import { formatJobId, normalizeJobId } from "@/lib/job-id";
import { CUSTOMER_COOKIE, verifyCustomerToken } from "@/lib/customer-session";
import { ManagePanel } from "@/components/customer/manage-panel";
import { ChatBox } from "@/components/chat/chat-box";

export const dynamic = "force-dynamic";

function formatTime(time: string): string {
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${display}:${m} ${ampm}`;
}

export default async function CustomerBookingPage({
  params,
}: {
  params: { jobId: string };
}) {
  const jobId = normalizeJobId(params.jobId);

  const [booking] = await db
    .select({
      id: bookings.id,
      jobId: bookings.jobId,
      serviceId: bookings.serviceId,
      serviceName: services.name,
      priceCents: services.priceCents,
      durationMins: services.durationMins,
      appointmentDate: bookings.appointmentDate,
      appointmentTime: bookings.appointmentTime,
      status: bookings.status,
      customerName: bookings.customerName,
      customerEmail: bookings.customerEmail,
      customerPhone: bookings.customerPhone,
      vehicleYear: bookings.vehicleYear,
      vehicleMake: bookings.vehicleMake,
      vehicleModel: bookings.vehicleModel,
    })
    .from(bookings)
    .innerJoin(services, eq(bookings.serviceId, services.id))
    .where(eq(bookings.jobId, jobId));

  // Gate on the booking-scoped cookie set at lookup. No cookie / wrong booking → re-auth.
  const session = verifyCustomerToken(cookies().get(CUSTOMER_COOKIE)?.value);
  if (!booking || !session || session.bookingId !== booking.id) {
    redirect("/lookup");
  }

  const info = await getBusinessInfo();
  const initial = (info.name.trim()[0] ?? "N").toUpperCase();
  const apptTime = booking.appointmentTime.slice(0, 5);

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
        <div className="mx-auto max-w-lg space-y-8">
          <div>
            <h1 className="mb-1 text-3xl font-bold text-foreground">Your booking</h1>
            <p className="text-muted-foreground">
              Job ID <span className="font-medium">{formatJobId(booking.jobId)}</span> · Status{" "}
              <span className="font-medium capitalize">{booking.status}</span>
            </p>
          </div>

          <Card>
            <CardContent className="space-y-3 p-6 text-left">
              <Row label="Booking #" value={String(booking.id)} />
              <Row label="Service" value={booking.serviceName} />
              <Row label="Price" value={formatCurrency(booking.priceCents)} />
              <Row
                label="Date"
                value={new Date(booking.appointmentDate + "T00:00:00").toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              />
              <Row label="Time" value={formatTime(apptTime)} />
              <Row label="Duration" value={formatDuration(booking.durationMins)} />
              <hr />
              <Row
                label="Vehicle"
                value={`${booking.vehicleYear} ${booking.vehicleMake} ${booking.vehicleModel}`}
              />
            </CardContent>
          </Card>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-foreground">Manage</h2>
            <ManagePanel
              booking={{
                jobId: booking.jobId ?? jobId,
                serviceId: booking.serviceId,
                status: booking.status,
                appointmentDate: booking.appointmentDate,
                appointmentTime: apptTime,
                customerName: booking.customerName,
                customerEmail: booking.customerEmail,
                customerPhone: booking.customerPhone,
                vehicleYear: booking.vehicleYear,
                vehicleMake: booking.vehicleMake,
                vehicleModel: booking.vehicleModel,
              }}
            />
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-foreground">Messages</h2>
            <p className="mb-3 text-sm text-muted-foreground">
              Questions about your appointment? Message us here — we&apos;ll reply in real time.
            </p>
            <ChatBox
              self="customer"
              historyUrl={`/api/bookings/${jobId}/messages`}
              sendUrl={`/api/bookings/${jobId}/messages`}
              streamUrl={`/api/bookings/${jobId}/messages/stream`}
            />
          </section>

          <div className="flex justify-center">
            <Button asChild variant="outline">
              <Link href="/">Back to Home</Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
