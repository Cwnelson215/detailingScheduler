import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { bookings, services } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { dropoffSummary } from "@/lib/format";
import { getBusinessInfo } from "@/lib/business-info";
import {
  VIEW_COOKIE,
  verifyViewToken,
  normalizeEmail,
  DEVICE_COOKIE,
  verifyDeviceToken,
} from "@/lib/customer-session";
import { UnlockPanel } from "@/components/customer/unlock-panel";

export const dynamic = "force-dynamic";

// Read-only booking view, reached via the opaque confirmation token (never the Job ID). Gated
// by the email-scoped view cookie set at lookup. The Job ID is deliberately not exposed here —
// the customer must supply it (plus an emailed code) to unlock managing the booking.
export default async function CustomerBookingViewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [booking] = await db
    .select({
      id: bookings.id,
      serviceId: bookings.serviceId,
      serviceName: services.name,
      priceCents: services.priceCents,
      durationMins: services.durationMins,
      appointmentDate: bookings.appointmentDate,
      appointmentTime: bookings.appointmentTime,
      dropoffWindow: bookings.dropoffWindow,
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
    .where(eq(bookings.confirmationToken, token));

  // Gate on either the email-scoped view cookie (matching this booking's email) or a device-trust
  // cookie that vouches for this booking — the latter lets the just-booked customer reach this
  // page without a lookup. Otherwise re-auth via /lookup.
  const cookieStore = await cookies();
  const session = verifyViewToken(cookieStore.get(VIEW_COOKIE)?.value);
  const viewOk = !!session && session.email === normalizeEmail(booking?.customerEmail ?? "");
  const trustedIds = verifyDeviceToken(cookieStore.get(DEVICE_COOKIE)?.value)?.bookingIds ?? [];
  const deviceTrusted = !!booking && trustedIds.includes(booking.id);
  if (!booking || (!viewOk && !deviceTrusted)) {
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
              Status <span className="font-medium capitalize">{booking.status}</span>
            </p>
          </div>

          <Card>
            <CardContent className="space-y-3 p-6 text-left">
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
              <Row label="Drop-off" value={dropoffSummary(booking.dropoffWindow, apptTime)} />
              <hr />
              <Row
                label="Vehicle"
                value={`${booking.vehicleYear} ${booking.vehicleMake} ${booking.vehicleModel}`}
              />
            </CardContent>
          </Card>

          <UnlockPanel
            booking={{
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
            deviceTrusted={deviceTrusted}
          />

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
