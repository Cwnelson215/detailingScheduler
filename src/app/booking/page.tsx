import Link from "next/link";
import { db } from "@/db";
import { services } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { BookingForm } from "@/components/booking-form";
import { getBusinessInfo } from "@/lib/business-info";

export const dynamic = "force-dynamic";

export default async function BookingPage() {
  const activeServices = await db
    .select()
    .from(services)
    .where(eq(services.isActive, true))
    .orderBy(asc(services.sortOrder));

  const info = await getBusinessInfo();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-white">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="text-xl font-bold text-primary">
            {info.name}
          </Link>
        </div>
      </header>

      <main className="flex-1 container py-8">
        <h1 className="text-2xl font-bold text-center mb-8">Book an Appointment</h1>
        {activeServices.length === 0 ? (
          <p className="text-center text-muted-foreground">
            No services are currently available. Please check back later.
          </p>
        ) : (
          <BookingForm services={activeServices} />
        )}
      </main>
    </div>
  );
}
