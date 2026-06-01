import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { getBusinessInfo } from "@/lib/business-info";
import { LookupForm } from "@/components/customer/lookup-form";

export const dynamic = "force-dynamic";

export default async function LookupPage() {
  const info = await getBusinessInfo();
  const initial = (info.name.trim()[0] ?? "N").toUpperCase();

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
        <div className="max-w-md mx-auto">
          <h1 className="text-3xl font-bold mb-2 text-foreground">Look up your booking</h1>
          <p className="text-muted-foreground mb-8">
            Enter the email on your booking to view your upcoming appointments. To reschedule,
            cancel, or message us, you&apos;ll confirm your Job ID with a one-time code we email you.
          </p>
          <Card>
            <CardContent className="p-6">
              <LookupForm />
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
