"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dropoffSummary, type DropoffWindow } from "@/lib/format";

type BookingSummary = {
  token: string;
  serviceName: string;
  appointmentDate: string;
  appointmentTime: string; // HH:MM
  dropoffWindow: DropoffWindow;
  status: string;
};

function formatDate(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function LookupForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // When the email matches more than one upcoming booking, the customer picks which one.
  const [choices, setChoices] = useState<BookingSummary[] | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const email = String(formData.get("email") ?? "");

    try {
      const res = await fetch("/api/bookings/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : "No upcoming bookings found for that email.",
        );
      }
      const list: BookingSummary[] = Array.isArray(data?.bookings) ? data.bookings : [];
      if (list.length === 1) {
        // The lookup set the view cookie; go straight to the single booking.
        router.push(`/my-booking/${list[0].token}`);
      } else {
        setChoices(list);
        setLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  if (choices) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          You have {choices.length} upcoming bookings. Choose one to view it.
        </p>
        <ul className="space-y-2">
          {choices.map((b) => (
            <li key={b.token}>
              <button
                type="button"
                onClick={() => router.push(`/my-booking/${b.token}`)}
                className="w-full rounded-lg border border-border p-4 text-left transition-colors hover:bg-secondary"
              >
                <span className="block font-medium text-foreground">{b.serviceName}</span>
                <span className="block text-sm text-muted-foreground">
                  {formatDate(b.appointmentDate)} · {dropoffSummary(b.dropoffWindow, b.appointmentTime)}
                </span>
                <span className="mt-1 inline-block text-xs capitalize text-muted-foreground">
                  {b.status}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="email">Email on your booking</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Looking up..." : "Find my booking"}
      </Button>
    </form>
  );
}
