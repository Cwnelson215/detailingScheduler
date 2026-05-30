"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LookupForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const jobId = String(formData.get("jobId") ?? "");
    const email = String(formData.get("email") ?? "");

    try {
      const res = await fetch("/api/bookings/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, email }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : "We couldn't find a booking matching that Job ID and email.",
        );
      }
      // The lookup set a booking-scoped session cookie and returns the normalized Job ID.
      router.push(`/booking/${data.jobId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="jobId">Job ID</Label>
        <Input id="jobId" name="jobId" placeholder="ABCD-2345" required autoComplete="off" />
      </div>
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
