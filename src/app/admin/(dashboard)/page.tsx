import { db } from "@/db";
import { bookings, services } from "@/db/schema";
import { eq, sql, and, gte, lte, desc } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, DollarSign, Users, Clock } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import Link from "next/link";

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

export default async function AdminDashboardPage() {
  const today = new Date().toISOString().split("T")[0];
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  // Today's bookings
  const todaysBookings = await db
    .select({
      id: bookings.id,
      serviceName: services.name,
      customerName: bookings.customerName,
      appointmentTime: bookings.appointmentTime,
      status: bookings.status,
      vehicleYear: bookings.vehicleYear,
      vehicleMake: bookings.vehicleMake,
      vehicleModel: bookings.vehicleModel,
    })
    .from(bookings)
    .innerJoin(services, eq(bookings.serviceId, services.id))
    .where(eq(bookings.appointmentDate, today))
    .orderBy(bookings.appointmentTime);

  // Weekly stats
  const weeklyBookings = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(bookings)
    .where(
      and(
        gte(bookings.appointmentDate, weekAgo),
        sql`${bookings.status} != 'cancelled'`
      )
    );

  const weeklyRevenue = await db
    .select({ total: sql<number>`coalesce(sum(${services.priceCents}), 0)::int` })
    .from(bookings)
    .innerJoin(services, eq(bookings.serviceId, services.id))
    .where(
      and(
        gte(bookings.appointmentDate, weekAgo),
        sql`${bookings.status} != 'cancelled'`
      )
    );

  const pendingCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(bookings)
    .where(eq(bookings.status, "pending"));

  // Upcoming bookings
  const upcoming = await db
    .select({
      id: bookings.id,
      serviceName: services.name,
      customerName: bookings.customerName,
      appointmentDate: bookings.appointmentDate,
      appointmentTime: bookings.appointmentTime,
      status: bookings.status,
    })
    .from(bookings)
    .innerJoin(services, eq(bookings.serviceId, services.id))
    .where(
      and(
        gte(bookings.appointmentDate, today),
        sql`${bookings.status} != 'cancelled'`
      )
    )
    .orderBy(bookings.appointmentDate, bookings.appointmentTime)
    .limit(10);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Today&apos;s Bookings</CardTitle>
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{todaysBookings.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Weekly Bookings</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{weeklyBookings[0]?.count || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Weekly Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(weeklyRevenue[0]?.total || 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingCount[0]?.count || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Today's Schedule */}
      <Card>
        <CardHeader>
          <CardTitle>Today&apos;s Schedule</CardTitle>
        </CardHeader>
        <CardContent>
          {todaysBookings.length === 0 ? (
            <p className="text-muted-foreground text-sm">No bookings today.</p>
          ) : (
            <div className="space-y-3">
              {todaysBookings.map((b) => (
                <Link
                  key={b.id}
                  href={`/admin/bookings/${b.id}`}
                  className="flex items-center justify-between p-3 rounded-md border hover:bg-accent transition-colors"
                >
                  <div>
                    <p className="font-medium">{formatTime(b.appointmentTime)} — {b.customerName}</p>
                    <p className="text-sm text-muted-foreground">
                      {b.serviceName} | {b.vehicleYear} {b.vehicleMake} {b.vehicleModel}
                    </p>
                  </div>
                  <Badge variant={statusColors[b.status]}>{b.status}</Badge>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upcoming */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Upcoming Appointments</CardTitle>
          <Link href="/admin/bookings" className="text-sm text-primary hover:underline">
            View all
          </Link>
        </CardHeader>
        <CardContent>
          {upcoming.length === 0 ? (
            <p className="text-muted-foreground text-sm">No upcoming appointments.</p>
          ) : (
            <div className="space-y-3">
              {upcoming.map((b) => (
                <Link
                  key={b.id}
                  href={`/admin/bookings/${b.id}`}
                  className="flex items-center justify-between p-3 rounded-md border hover:bg-accent transition-colors"
                >
                  <div>
                    <p className="font-medium">{b.customerName}</p>
                    <p className="text-sm text-muted-foreground">
                      {b.serviceName} — {new Date(b.appointmentDate + "T00:00:00").toLocaleDateString()} at {formatTime(b.appointmentTime)}
                    </p>
                  </div>
                  <Badge variant={statusColors[b.status]}>{b.status}</Badge>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
