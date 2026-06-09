"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toast";

// Compact quick action for the bookings list: mark a confirmed job "ready" (car done,
// awaiting pickup) and email the customer. Renders nothing for any other status so it
// doesn't clutter rows. Confirms first so a stray click can't fire the customer email.
export function MarkReadyButton({
  bookingId,
  currentStatus,
}: {
  bookingId: number;
  currentStatus: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const { confirm, dialog } = useConfirm();

  if (currentStatus !== "confirmed") return null;

  const handleClick = async () => {
    const ok = await confirm({
      title: "Mark car ready?",
      description: "This emails the customer that their car is ready for pickup.",
      confirmLabel: "Mark ready & notify",
    });
    if (!ok) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/bookings/${bookingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ready" }),
      });
      if (!res.ok) {
        toast.error("Couldn't mark ready. Please try again.");
        return;
      }
      toast.success("Customer notified — marked ready for pickup.");
      router.refresh();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={handleClick} disabled={loading}>
        {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        Car Ready
      </Button>
      {dialog}
    </>
  );
}
