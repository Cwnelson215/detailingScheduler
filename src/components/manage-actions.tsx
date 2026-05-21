"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export function ManageActions({ token }: { token: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleCancel = async () => {
    if (!window.confirm("Cancel this appointment? This can't be undone.")) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/bookings/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data.error === "string" ? data.error : "Could not cancel. Please try again.");
        return;
      }
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button variant="destructive" onClick={handleCancel} disabled={loading} className="w-full">
        {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        Cancel appointment
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
