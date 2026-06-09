"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toast";

export function ManageActions({ token }: { token: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const { confirm, dialog } = useConfirm();

  const handleCancel = async () => {
    const ok = await confirm({
      title: "Cancel this appointment?",
      description: "This can't be undone.",
      confirmLabel: "Cancel appointment",
      cancelLabel: "Keep it",
      variant: "destructive",
    });
    if (!ok) return;

    setLoading(true);
    try {
      const res = await fetch("/api/bookings/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(
          typeof data.error === "string" ? data.error : "Could not cancel. Please try again.",
        );
        return;
      }
      toast.success("Appointment cancelled.");
      router.refresh();
    } catch {
      toast.error("Something went wrong. Please try again.");
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
      {dialog}
    </div>
  );
}
