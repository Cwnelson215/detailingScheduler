import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { bookings, services } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatJobId } from "@/lib/job-id";
import { ChatBox } from "@/components/chat/chat-box";

export const dynamic = "force-dynamic";

export default async function AdminMessageThreadPage({
  params,
}: {
  params: { bookingId: string };
}) {
  const bookingId = parseInt(params.bookingId, 10);
  if (Number.isNaN(bookingId)) notFound();

  const [booking] = await db
    .select({
      id: bookings.id,
      jobId: bookings.jobId,
      status: bookings.status,
      serviceName: services.name,
      appointmentDate: bookings.appointmentDate,
      customerName: bookings.customerName,
      customerEmail: bookings.customerEmail,
      customerPhone: bookings.customerPhone,
    })
    .from(bookings)
    .innerJoin(services, eq(bookings.serviceId, services.id))
    .where(eq(bookings.id, bookingId));

  if (!booking) notFound();

  return (
    <div className="max-w-2xl">
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/messages">← All conversations</Link>
        </Button>
      </div>

      <Card className="mb-6">
        <CardContent className="space-y-1 p-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-lg font-semibold">{booking.customerName}</span>
            <Link href={`/admin/bookings/${booking.id}`} className="text-xs text-primary hover:underline">
              View booking #{booking.id}
            </Link>
          </div>
          <p className="text-muted-foreground">
            {formatJobId(booking.jobId)} · {booking.serviceName} ·{" "}
            {new Date(booking.appointmentDate + "T00:00:00").toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}{" "}
            · <span className="capitalize">{booking.status}</span>
          </p>
          <p className="text-muted-foreground">
            {booking.customerEmail} · {booking.customerPhone}
          </p>
        </CardContent>
      </Card>

      <ChatBox
        self="owner"
        historyUrl={`/api/admin/messages/${booking.id}`}
        sendUrl={`/api/admin/messages/${booking.id}`}
        streamUrl={`/api/admin/messages/${booking.id}/stream`}
      />
    </div>
  );
}
