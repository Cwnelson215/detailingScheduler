import Link from "next/link";
import { db } from "@/db";
import { services, businessHours } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { ServiceCategoryCard, type ServiceCategory } from "@/components/service-category-card";
import { FeaturedServiceCard } from "@/components/featured-service-card";
import { Clock, MapPin, Phone } from "lucide-react";
import { getBusinessInfo } from "@/lib/business-info";

const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatTime(time: string): string {
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${display}:${m} ${ampm}`;
}

export const dynamic = "force-dynamic";

type ServiceRow = {
  id: number;
  name: string;
  description: string;
  durationMins: number;
  priceCents: number;
};

function groupServices(rows: ServiceRow[]): ServiceCategory[] {
  const groups = new Map<string, ServiceCategory>();
  for (const s of rows) {
    const [cat, label] = s.name.split(" – ");
    const key = label ? cat : s.name;
    if (!groups.has(key)) {
      groups.set(key, { category: key, description: s.description, variants: [] });
    }
    groups.get(key)!.variants.push({
      id: s.id,
      label: label ?? null,
      durationMins: s.durationMins,
      priceCents: s.priceCents,
    });
  }
  return [...groups.values()];
}

export default async function HomePage() {
  const activeServices = await db
    .select()
    .from(services)
    .where(eq(services.isActive, true))
    .orderBy(asc(services.sortOrder));

  const hours = await db
    .select()
    .from(businessHours)
    .orderBy(asc(businessHours.dayOfWeek));

  const info = await getBusinessInfo();

  const serviceGroups = groupServices(activeServices);

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="container flex h-16 items-center justify-between">
          <h1 className="text-xl font-bold text-primary">{info.name}</h1>
          <Link
            href="/booking"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Book Now
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5 py-20">
        <div className="container text-center">
          <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Your Car Deserves the Best
          </h2>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
            Professional detailing services that bring out the true beauty of your vehicle.
            Book your appointment online in minutes.
          </p>
          <Link
            href="/booking"
            className="mt-8 inline-flex items-center rounded-md bg-primary px-6 py-3 text-base font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Schedule Your Detail
          </Link>
        </div>
      </section>

      {/* Services */}
      {serviceGroups.length > 0 && (
        <section className="py-16">
          <div className="container">
            <h3 className="text-2xl font-bold text-center mb-8">
              {serviceGroups.length === 1 ? "Our Service" : "Our Services"}
            </h3>
            {serviceGroups.length === 1 ? (
              <div className="max-w-2xl mx-auto">
                <FeaturedServiceCard category={serviceGroups[0]} />
              </div>
            ) : (
              <div className="grid gap-6 sm:grid-cols-2 max-w-4xl mx-auto">
                {serviceGroups.map((g) => (
                  <ServiceCategoryCard key={g.category} category={g} />
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Hours & Info */}
      <section className="bg-muted py-16">
        <div className="container">
          <div className="grid gap-8 md:grid-cols-2 max-w-4xl mx-auto">
            {/* Business Hours */}
            <div className="rounded-lg bg-white p-6 shadow-sm">
              <h3 className="flex items-center gap-2 text-lg font-semibold mb-4">
                <Clock className="h-5 w-5 text-primary" />
                Business Hours
              </h3>
              <div className="space-y-2">
                {hours.map((h) => (
                  <div key={h.dayOfWeek} className="flex justify-between text-sm">
                    <span className="font-medium">{dayNames[h.dayOfWeek]}</span>
                    <span className="text-muted-foreground">
                      {h.isOpen ? `${formatTime(h.openTime!)} – ${formatTime(h.closeTime!)}` : "Closed"}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Contact */}
            <div className="rounded-lg bg-white p-6 shadow-sm">
              <h3 className="flex items-center gap-2 text-lg font-semibold mb-4">
                <Phone className="h-5 w-5 text-primary" />
                Contact
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <span className="whitespace-pre-line">{info.address}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{info.phone}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-6 mt-auto">
        <div className="container text-center text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} {info.name}. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
