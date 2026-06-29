"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CalendarPicker } from "@/components/calendar-picker";
import { WindowPicker } from "@/components/window-picker";
import { formatPhone, type DropoffWindow, type WindowOption } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toast";

type BookingView = {
  jobId: string;
  serviceId: number;
  status: string;
  appointmentDate: string;
  appointmentTime: string; // HH:MM
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  vehicleYear: string;
  vehicleMake: string;
  vehicleModel: string;
  referralCode: string;
  availableTokens: number;
  referralApplied: boolean;
  sameDayDiscount: boolean;
};

type Mode = "none" | "reschedule" | "edit";

export function ManagePanel({ booking }: { booking: BookingView }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("none");
  const [busy, setBusy] = useState(false);
  const { confirm, dialog } = useConfirm();

  const active = booking.status !== "cancelled" && booking.status !== "completed";
  const manageUrl = `/api/jobs/${booking.jobId}/manage`;

  async function post(payload: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    try {
      const res = await fetch(manageUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(typeof data?.error === "string" ? data.error : "Request failed");
      }
      router.refresh();
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!active) {
    return (
      <p className="text-sm text-muted-foreground">
        {booking.status === "cancelled"
          ? "This appointment has been cancelled."
          : "This appointment is complete."}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <ReferralSection booking={booking} busy={busy} post={post} />

      {mode === "none" && (
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => setMode("reschedule")}>
            Reschedule
          </Button>
          <Button variant="outline" onClick={() => setMode("edit")}>
            Edit details
          </Button>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={async () => {
              const ok = await confirm({
                title: "Cancel this appointment?",
                description: "This can't be undone.",
                confirmLabel: "Cancel appointment",
                cancelLabel: "Keep it",
                variant: "destructive",
              });
              if (ok && (await post({ cancel: true }))) {
                toast.success("Appointment cancelled.");
              }
            }}
          >
            Cancel appointment
          </Button>
        </div>
      )}

      {mode === "reschedule" && (
        <RescheduleForm
          busy={busy}
          onCancel={() => setMode("none")}
          onSubmit={async (appointmentDate, dropoffWindow) => {
            const ok = await post({ appointmentDate, dropoffWindow });
            if (ok) {
              toast.success("Appointment rescheduled.");
              setMode("none");
            }
            return ok;
          }}
        />
      )}

      {mode === "edit" && (
        <EditDetailsForm
          booking={booking}
          busy={busy}
          onCancel={() => setMode("none")}
          onSubmit={async (fields) => {
            const ok = await post(fields);
            if (ok) {
              toast.success("Details updated.");
              setMode("none");
            }
            return ok;
          }}
        />
      )}

      {dialog}
    </div>
  );
}

function ReferralSection({
  booking,
  busy,
  post,
}: {
  booking: BookingView;
  busy: boolean;
  post: (payload: Record<string, unknown>) => Promise<boolean>;
}) {
  const { referralCode, availableTokens, referralApplied, sameDayDiscount } = booking;

  return (
    <div className="space-y-3 rounded-lg border border-border bg-secondary/30 p-4">
      <div>
        <p className="text-sm font-semibold text-foreground">Refer a friend, get 15%</p>
        {referralCode ? (
          <p className="text-sm text-muted-foreground">
            Share your code{" "}
            <span className="font-mono font-semibold tracking-wide text-foreground">
              {referralCode}
            </span>
            . When a friend books with it, you earn a 15% credit.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            You&apos;ll get a personal referral code to share after your first booking.
          </p>
        )}
      </div>

      {referralApplied ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm font-medium text-green-700">15% referral discount applied.</p>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={async () => {
              if (await post({ removeReferralToken: true })) toast.success("Referral discount removed.");
            }}
          >
            Remove
          </Button>
        </div>
      ) : sameDayDiscount ? (
        <p className="text-sm text-muted-foreground">
          This booking already has the same-day 20% discount, which can&apos;t be combined with a
          referral credit.
        </p>
      ) : availableTokens > 0 ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted-foreground">
            You have {availableTokens} referral {availableTokens === 1 ? "credit" : "credits"}.
          </p>
          <Button
            size="sm"
            disabled={busy}
            onClick={async () => {
              if (await post({ applyReferralToken: true }))
                toast.success("15% referral discount applied.");
            }}
          >
            Apply 15% to this booking
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No referral credits to apply yet.</p>
      )}
    </div>
  );
}

function RescheduleForm({
  busy,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (date: string, window: DropoffWindow) => Promise<boolean>;
}) {
  const [date, setDate] = useState("");
  const [options, setOptions] = useState<WindowOption[]>([]);
  const [window, setWindow] = useState<DropoffWindow | "">("");
  const [loadingSlots, setLoadingSlots] = useState(false);

  useEffect(() => {
    if (!date) return;
    setLoadingSlots(true);
    setWindow("");
    fetch(`/api/availability?date=${date}`)
      .then((r) => r.json())
      .then((d: WindowOption[]) => setOptions(Array.isArray(d) ? d : []))
      .catch(() => setOptions([]))
      .finally(() => setLoadingSlots(false));
  }, [date]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Pick a new date and drop-off window.</p>
      <CalendarPicker selected={date} onSelect={setDate} />
      {date &&
        (loadingSlots ? (
          <p className="text-sm text-muted-foreground">Loading windows...</p>
        ) : (
          <WindowPicker options={options} selected={window} onSelect={setWindow} />
        ))}
      <div className="flex gap-3">
        <Button disabled={!date || !window || busy} onClick={() => date && window && onSubmit(date, window)}>
          {busy ? "Saving..." : "Confirm reschedule"}
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={busy}>
          Back
        </Button>
      </div>
    </div>
  );
}

function EditDetailsForm({
  booking,
  busy,
  onCancel,
  onSubmit,
}: {
  booking: BookingView;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (fields: Record<string, string>) => Promise<boolean>;
}) {
  const [form, setForm] = useState({
    customerName: booking.customerName,
    customerEmail: booking.customerEmail,
    customerPhone: booking.customerPhone,
    vehicleYear: booking.vehicleYear,
    vehicleMake: booking.vehicleMake,
    vehicleModel: booking.vehicleModel,
  });

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    // Send only changed fields.
    const changed: Record<string, string> = {};
    (Object.keys(form) as (keyof typeof form)[]).forEach((k) => {
      if (form[k] !== booking[k]) changed[k] = form[k];
    });
    if (Object.keys(changed).length === 0) {
      onCancel();
      return;
    }
    const ok = await onSubmit(changed);
    if (ok) onCancel();
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="customerName">Name</Label>
          <Input id="customerName" value={form.customerName} onChange={(e) => set("customerName", e.target.value)} />
        </div>
        <div>
          <Label htmlFor="customerEmail">Email</Label>
          <Input id="customerEmail" type="email" value={form.customerEmail} onChange={(e) => set("customerEmail", e.target.value)} />
        </div>
        <div>
          <Label htmlFor="customerPhone">Phone</Label>
          <Input id="customerPhone" type="tel" inputMode="tel" value={form.customerPhone} onChange={(e) => set("customerPhone", formatPhone(e.target.value))} placeholder="(555) 123-4567" />
        </div>
        <div>
          <Label htmlFor="vehicleYear">Vehicle year</Label>
          <Input id="vehicleYear" value={form.vehicleYear} onChange={(e) => set("vehicleYear", e.target.value)} />
        </div>
        <div>
          <Label htmlFor="vehicleMake">Make</Label>
          <Input id="vehicleMake" value={form.vehicleMake} onChange={(e) => set("vehicleMake", e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="vehicleModel">Model</Label>
          <Input id="vehicleModel" value={form.vehicleModel} onChange={(e) => set("vehicleModel", e.target.value)} />
        </div>
      </div>
      <div className="flex gap-3">
        <Button onClick={handleSave} disabled={busy}>
          {busy ? "Saving..." : "Save changes"}
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={busy}>
          Back
        </Button>
      </div>
    </div>
  );
}
