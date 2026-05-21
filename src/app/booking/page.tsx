import Link from "next/link";
import { db } from "@/db";
import { services } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { ChevronLeft } from "lucide-react";
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
  const initial = (info.name.trim()[0] ?? "N").toUpperCase();

  return (
    <div className="flex min-h-screen flex-col bg-secondary/40">
      <header className="sticky top-0 z-30 border-b border-border bg-white/80 backdrop-blur">
        <div className="container flex h-20 items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground font-display text-sm font-bold text-white">
              {initial}
            </span>
            <span className="font-display text-lg font-semibold tracking-tight text-foreground">
              {info.name}
            </span>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to home
          </Link>
        </div>
      </header>

      <main className="container flex-1 py-12">
        <div className="mx-auto mb-8 max-w-2xl text-center">
          <h1 className="text-3xl font-bold text-foreground">Book an appointment</h1>
          <p className="mt-2 text-muted-foreground">Five quick steps — confirmation lands in your inbox.</p>
        </div>
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
