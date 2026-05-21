import Link from "next/link";
import { db } from "@/db";
import { services, businessHours } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { Check } from "lucide-react";
import { formatDuration } from "@/lib/utils";
import { getBusinessInfo } from "@/lib/business-info";
import { ContactForm } from "@/components/contact-form";

const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatTime(time: string): string {
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${display}:${m} ${ampm}`;
}

function dollars(cents: number): string {
  return "$" + (cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export const dynamic = "force-dynamic";

const includedSteps = [
  {
    title: "Exterior hand wash & clay-bar",
    body: "Decontamination that strips embedded grime for a smooth, clean surface before wax.",
  },
  {
    title: "Hand-applied wax",
    body: "Deep, lasting gloss and real paint protection — applied by hand, not machine.",
  },
  {
    title: "Interior deep clean",
    body: "Vacuum, shampoo, leather/vinyl conditioning, and crystal-clear glass throughout.",
  },
];

const tierPerks = ["Exterior hand wash & wax", "Full interior deep clean", "Glass, trim & conditioning"];

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

  const tiers = activeServices.map((s) => {
    const [cat, label] = s.name.split(" – ");
    return {
      id: s.id,
      category: cat,
      name: label ?? cat,
      priceCents: s.priceCents,
      durationMins: s.durationMins,
      description: s.description,
    };
  });

  const categoryName = tiers[0]?.category ?? "Our Service";
  const serviceDescription = tiers[0]?.description ?? "";
  const startingPrice = tiers.length ? Math.min(...tiers.map((t) => t.priceCents)) : 0;
  const initial = (info.name.trim()[0] ?? "N").toUpperCase();

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
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
          <nav className="hidden items-center gap-8 text-sm font-medium text-muted-foreground md:flex">
            <a href="#services" className="transition-colors hover:text-foreground">Services</a>
            <a href="#included" className="transition-colors hover:text-foreground">What&apos;s included</a>
            <a href="#contact" className="transition-colors hover:text-foreground">Contact</a>
          </nav>
          <Link
            href="/booking"
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Book Now
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="container pt-16 pb-16 lg:pt-20">
        <div className="grid items-center gap-14 lg:grid-cols-2">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground ring-1 ring-primary/10">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              Now booking online
            </span>
            <h1 className="mt-6 text-5xl font-bold leading-[1.05] text-foreground md:text-6xl">
              Your car deserves the best.
            </h1>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-muted-foreground">
              Professional detailing services that bring out the true beauty of your vehicle.
              Book your appointment online in minutes.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                href="/booking"
                className="rounded-lg bg-primary px-7 py-3.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Book your detail
              </Link>
              <a
                href="#services"
                className="rounded-lg border border-border px-7 py-3.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
              >
                View pricing
              </a>
            </div>
            <dl className="mt-10 flex items-center gap-8 text-sm">
              <div>
                <dt className="sr-only">Finish</dt>
                <dd className="font-display text-2xl font-bold text-foreground">100%</dd>
                <dd className="text-muted-foreground">Hand-finished</dd>
              </div>
              <div>
                <dt className="sr-only">Vehicle sizes</dt>
                <dd className="font-display text-2xl font-bold text-foreground">{tiers.length || 3}</dd>
                <dd className="text-muted-foreground">Vehicle sizes</dd>
              </div>
            </dl>
          </div>

          {/* Photo-free hero panel */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-blue-500 p-10 text-white shadow-xl shadow-primary/20">
            <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10" />
            <div className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-white/10" />
            <div className="relative">
              <p className="text-sm font-medium uppercase tracking-wide text-blue-100">{categoryName}</p>
              <p className="mt-1 text-blue-100/90">Inside &amp; out, in a single visit.</p>
              <div className="mt-8 flex items-end gap-2">
                <span className="pb-2 text-sm text-blue-100">from</span>
                <span className="font-display text-6xl font-bold leading-none">{dollars(startingPrice || 15000)}<span className="text-blue-100">*</span></span>
              </div>
              <ul className="mt-8 space-y-3 text-sm">
                {tierPerks.map((perk) => (
                  <li key={perk} className="flex items-center gap-3">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20">
                      <Check className="h-3 w-3" />
                    </span>
                    {perk}
                  </li>
                ))}
              </ul>
              <Link
                href="/booking"
                className="mt-9 inline-flex w-full items-center justify-center rounded-lg bg-white px-6 py-3.5 text-sm font-semibold text-primary transition-colors hover:bg-blue-50"
              >
                Book now
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section className="border-y border-border bg-secondary/60">
        <div className="container grid grid-cols-2 gap-4 py-7 text-center text-sm font-medium text-muted-foreground md:grid-cols-4">
          <div>Clay-bar decontamination</div>
          <div>Hand-applied wax</div>
          <div>Interior deep clean</div>
          <div>Leather conditioning</div>
        </div>
      </section>

      {/* Services / pricing */}
      {tiers.length > 0 && (
        <section id="services" className="container py-24">
          <div className="mx-auto mb-14 max-w-xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">{categoryName}</p>
            <h2 className="mt-3 text-4xl font-bold text-foreground">One service. Priced by vehicle size.</h2>
            <p className="mt-4 text-muted-foreground">{serviceDescription}</p>
          </div>
          <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">
            {tiers.map((tier) => (
              <div
                key={tier.id}
                className="rounded-2xl border border-border p-8 transition hover:-translate-y-1 hover:shadow-lg hover:shadow-slate-200/60"
              >
                <h3 className="text-xl font-semibold text-foreground">{tier.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">≈ {formatDuration(tier.durationMins)}</p>
                <div className="mt-5 font-display text-4xl font-bold text-foreground">{dollars(tier.priceCents)}<span className="text-muted-foreground">*</span></div>
                <Link
                  href="/booking"
                  className="mt-7 block rounded-lg border border-border py-3 text-center text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
                >
                  Book {tier.name}
                </Link>
              </div>
            ))}
          </div>
          <p className="mx-auto mt-6 max-w-2xl text-center text-sm text-muted-foreground">
            * Final pricing may vary depending on the condition of your vehicle.
            Especially dirty or heavily soiled vehicles may incur an additional charge.
          </p>
          <div className="mx-auto mt-12 max-w-md">
            <p className="text-center text-sm font-semibold text-foreground">Every detail includes</p>
            <ul className="mx-auto mt-4 w-fit space-y-2 text-sm text-muted-foreground">
              {tierPerks.map((perk) => (
                <li key={perk} className="flex items-center gap-2">
                  <Check className="h-4 w-4 shrink-0 text-primary" />
                  {perk}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* What's included */}
      <section id="included" className="border-y border-border bg-secondary/60">
        <div className="container py-24">
          <div className="mx-auto mb-12 max-w-xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">What&apos;s included</p>
            <h2 className="mt-3 text-4xl font-bold text-foreground">Every detail, by hand.</h2>
          </div>
          <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">
            {includedSteps.map((step, i) => (
              <div key={step.title} className="rounded-2xl border border-border bg-white p-8">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent font-display text-lg font-bold text-accent-foreground">
                  {i + 1}
                </div>
                <h3 className="mt-5 text-lg font-semibold text-foreground">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA band */}
      <section className="container py-20">
        <div className="rounded-3xl bg-foreground px-8 py-14 text-center md:px-14">
          <h2 className="text-4xl font-bold text-white">Ready to book?</h2>
          <p className="mx-auto mt-4 max-w-md text-slate-300">
            Pick your vehicle size and a time that works — confirmation lands in your inbox in minutes.
          </p>
          <Link
            href="/booking"
            className="mt-8 inline-flex rounded-lg bg-white px-8 py-4 text-sm font-semibold text-foreground transition-colors hover:bg-slate-100"
          >
            Book your detail now
          </Link>
        </div>
      </section>

      {/* Footer with hours + contact */}
      <footer id="contact" className="mt-auto border-t border-border">
        <div className="container grid gap-10 py-16 md:grid-cols-3">
          <div>
            <Link href="/" className="mb-4 flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground font-display text-sm font-bold text-white">
                {initial}
              </span>
              <span className="font-display text-lg font-semibold tracking-tight text-foreground">{info.name}</span>
            </Link>
            <p className="max-w-xs text-sm text-muted-foreground">
              Professional auto detailing that brings out the true beauty of your vehicle.
            </p>
          </div>

          <div>
            <h3 className="mb-4 text-base font-semibold text-foreground">Hours</h3>
            <dl className="space-y-2 text-sm">
              {hours.map((h) => (
                <div key={h.dayOfWeek} className="flex max-w-[240px] justify-between">
                  <dt className="text-muted-foreground">{dayNames[h.dayOfWeek]}</dt>
                  <dd className="font-medium text-foreground">
                    {h.isOpen ? `${formatTime(h.openTime!)} – ${formatTime(h.closeTime!)}` : "Closed"}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div>
            <h3 className="mb-4 text-base font-semibold text-foreground">Contact</h3>
            <p className="mb-4 max-w-xs text-sm text-muted-foreground">
              Have a question? Send us a message and we&apos;ll get back to you.
            </p>
            <ContactForm />
          </div>
        </div>
        <div className="border-t border-border py-6 text-center text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} {info.name}. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
