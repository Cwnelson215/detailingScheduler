import Link from "next/link";
import { db } from "@/db";
import { services, businessHours } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { ServiceCard } from "@/components/service-card";
import { Clock, MapPin, Phone } from "lucide-react";

const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatTime(time: string): string {
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${display}:${m} ${ampm}`;
}

export const dynamic = "force-dynamic";

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

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="container flex h-16 items-center justify-between">
          <h1 className="text-xl font-bold text-primary">Premium Auto Detailing</h1>
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
      {activeServices.length > 0 && (
        <section className="py-16">
          <div className="container">
            <h3 className="text-2xl font-bold text-center mb-8">Our Services</h3>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {activeServices.map((service) => (
                <ServiceCard key={service.id} service={service} />
              ))}
            </div>
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
                  <span>123 Detail Lane, Suite 100<br />Your City, ST 12345</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>(555) 123-4567</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-6 mt-auto">
        <div className="container text-center text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} Premium Auto Detailing. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
