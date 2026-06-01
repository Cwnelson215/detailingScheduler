"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CalendarPicker } from "@/components/calendar-picker";
import { WindowPicker } from "@/components/window-picker";
import { type DropoffWindow, type WindowOption } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
};

type Mode = "none" | "reschedule" | "edit";

export function ManagePanel({ booking }: { booking: BookingView }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("none");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const active = booking.status !== "cancelled" && booking.status !== "completed";
  const manageUrl = `/api/jobs/${booking.jobId}/manage`;

  async function post(payload: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    setError("");
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
      setError(err instanceof Error ? err.message : "Something went wrong.");
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
            onClick={() => {
              if (confirm("Are you sure you want to cancel this appointment?")) {
                post({ cancel: true });
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
          onSubmit={(appointmentDate, dropoffWindow) => post({ appointmentDate, dropoffWindow })}
        />
      )}

      {mode === "edit" && (
        <EditDetailsForm
          booking={booking}
          busy={busy}
          onCancel={() => setMode("none")}
          onSubmit={(fields) => post(fields)}
        />
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
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
          <Input id="customerPhone" value={form.customerPhone} onChange={(e) => set("customerPhone", e.target.value)} />
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
