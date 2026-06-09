"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toast";

const transitions: Record<string, string[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["ready", "cancelled"],
  ready: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

const buttonStyles: Record<string, "default" | "secondary" | "destructive"> = {
  confirmed: "default",
  ready: "default",
  completed: "secondary",
  cancelled: "destructive",
};

// Override the default "Mark as {Status}" label where a clearer call to action helps.
const buttonLabels: Record<string, string> = {
  ready: "Mark Ready & Notify Customer",
};

// Transitions that email the customer get a confirmation step so a stray click can't fire.
const confirmCopy: Record<string, { title: string; description: string; confirmLabel: string }> = {
  ready: {
    title: "Mark car ready?",
    description: "This emails the customer that their car is ready for pickup.",
    confirmLabel: "Mark ready & notify",
  },
  cancelled: {
    title: "Cancel this booking?",
    description: "This cancels the appointment and emails the customer.",
    confirmLabel: "Cancel booking",
  },
};

const successCopy: Record<string, string> = {
  confirmed: "Booking confirmed.",
  ready: "Customer notified — marked ready for pickup.",
  completed: "Booking marked completed.",
  cancelled: "Booking cancelled — customer notified.",
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
  const { confirm, dialog } = useConfirm();

  const actions = transitions[currentStatus] || [];

  if (actions.length === 0) {
    return <p className="text-sm text-muted-foreground">No actions available for this status.</p>;
  }

  const handleAction = async (newStatus: string) => {
    const copy = confirmCopy[newStatus];
    if (copy && !(await confirm({ ...copy, variant: newStatus === "cancelled" ? "destructive" : "default" }))) {
      return;
    }

    setLoading(newStatus);
    try {
      const res = await fetch(`/api/bookings/${bookingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        toast.error("Couldn't update the booking. Please try again.");
        return;
      }
      toast.success(successCopy[newStatus] ?? "Booking updated.");
      router.refresh();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(null);
    }
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
          {buttonLabels[status] || `Mark as ${status.charAt(0).toUpperCase() + status.slice(1)}`}
        </Button>
      ))}
      {dialog}
    </div>
  );
}
