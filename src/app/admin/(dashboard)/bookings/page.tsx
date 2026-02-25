import { db } from "@/db";
import { bookings, services } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

function formatTime(time: string): string {
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${display}:${m} ${ampm}`;
}

const statusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "outline",
  confirmed: "default",
  completed: "secondary",
  cancelled: "destructive",
};

export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const statusFilter = searchParams.status;

  let query = db
    .select({
      id: bookings.id,
      serviceName: services.name,
      priceCents: services.priceCents,
      customerName: bookings.customerName,
      customerEmail: bookings.customerEmail,
      customerPhone: bookings.customerPhone,
      vehicleYear: bookings.vehicleYear,
      vehicleMake: bookings.vehicleMake,
      vehicleModel: bookings.vehicleModel,
      appointmentDate: bookings.appointmentDate,
      appointmentTime: bookings.appointmentTime,
      status: bookings.status,
      createdAt: bookings.createdAt,
    })
    .from(bookings)
    .innerJoin(services, eq(bookings.serviceId, services.id))
    .orderBy(desc(bookings.appointmentDate), desc(bookings.appointmentTime));

  const allBookings = statusFilter
    ? await query.where(eq(bookings.status, statusFilter))
    : await query;

  const statuses = ["all", "pending", "confirmed", "completed", "cancelled"];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Bookings</h1>

      {/* Filters */}
      <div className="flex gap-2">
        {statuses.map((s) => (
          <Link
            key={s}
            href={s === "all" ? "/admin/bookings" : `/admin/bookings?status=${s}`}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              (s === "all" && !statusFilter) || s === statusFilter
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </Link>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Price</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allBookings.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No bookings found.
                  </TableCell>
                </TableRow>
              ) : (
                allBookings.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>
                      <Link href={`/admin/bookings/${b.id}`} className="hover:underline">
                        {new Date(b.appointmentDate + "T00:00:00").toLocaleDateString()}
                      </Link>
                    </TableCell>
                    <TableCell>{formatTime(b.appointmentTime)}</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{b.customerName}</p>
                        <p className="text-xs text-muted-foreground">{b.customerEmail}</p>
                      </div>
                    </TableCell>
                    <TableCell>{b.serviceName}</TableCell>
                    <TableCell className="text-sm">
                      {b.vehicleYear} {b.vehicleMake} {b.vehicleModel}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusColors[b.status]}>{b.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(b.priceCents)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
