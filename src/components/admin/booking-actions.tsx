"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

const transitions: Record<string, string[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

const buttonStyles: Record<string, "default" | "secondary" | "destructive"> = {
  confirmed: "default",
  completed: "secondary",
  cancelled: "destructive",
};

export function BookingActions({
  bookingId,
  currentStatus,
}: {
  bookingId: number;
  currentStatus: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  const actions = transitions[currentStatus] || [];

  if (actions.length === 0) {
    return <p className="text-sm text-muted-foreground">No actions available for this status.</p>;
  }

  const handleAction = async (newStatus: string) => {
    setLoading(newStatus);
    await fetch(`/api/bookings/${bookingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    setLoading(null);
    router.refresh();
  };

  return (
    <div className="flex gap-3">
      {actions.map((status) => (
        <Button
          key={status}
          variant={buttonStyles[status] || "default"}
          onClick={() => handleAction(status)}
          disabled={loading !== null}
        >
          {loading === status && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Mark as {status.charAt(0).toUpperCase() + status.slice(1)}
        </Button>
      ))}
    </div>
  );
}
