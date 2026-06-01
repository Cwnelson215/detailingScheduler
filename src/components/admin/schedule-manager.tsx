"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Plus, Trash2 } from "lucide-react";

const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface BusinessHour {
  id: number;
  dayOfWeek: number;
  isOpen: boolean;
  morningEnabled: boolean;
  morningStart: string | null;
  morningEnd: string | null;
  eveningEnabled: boolean;
  eveningStart: string | null;
  eveningEnd: string | null;
}

interface BlockedDate {
  id: number;
  date: string;
  reason: string | null;
}

export function ScheduleManager({
  initialHours,
  initialBlockedDates,
}: {
  initialHours: BusinessHour[];
  initialBlockedDates: BlockedDate[];
}) {
  const router = useRouter();
  const [hours, setHours] = useState(initialHours);
  const [savingHours, setSavingHours] = useState(false);
  const [newBlockedDate, setNewBlockedDate] = useState("");
  const [newBlockedReason, setNewBlockedReason] = useState("");
  const [addingBlocked, setAddingBlocked] = useState(false);

  const updateHour = (
    dayOfWeek: number,
    field: keyof BusinessHour,
    value: string | boolean | null,
  ) => {
    setHours((prev) =>
      prev.map((h) => (h.dayOfWeek === dayOfWeek ? { ...h, [field]: value } : h)),
    );
  };

  // Enabling a window seeds its start/end with sensible defaults if they're empty, so the
  // row is immediately valid (savable) rather than blocked on the "start before end" rule.
  const toggleWindow = (dayOfWeek: number, which: "morning" | "evening", enabled: boolean) => {
    const [defStart, defEnd] = which === "morning" ? ["07:00", "09:00"] : ["15:00", "17:00"];
    setHours((prev) =>
      prev.map((h) =>
        h.dayOfWeek === dayOfWeek
          ? {
              ...h,
              [`${which}Enabled`]: enabled,
              [`${which}Start`]: enabled ? h[`${which}Start`] ?? defStart : h[`${which}Start`],
              [`${which}End`]: enabled ? h[`${which}End`] ?? defEnd : h[`${which}End`],
            }
          : h,
      ),
    );
  };

  // An enabled window with start ≥ end is rejected server-side; surface it before saving.
  const invalidWindow = (start: string | null, end: string | null) =>
    !start || !end || start >= end;
  const hasInvalid = hours.some(
    (h) =>
      h.isOpen &&
      ((h.morningEnabled && invalidWindow(h.morningStart, h.morningEnd)) ||
        (h.eveningEnabled && invalidWindow(h.eveningStart, h.eveningEnd))),
  );

  const saveHours = async () => {
    setSavingHours(true);
    await fetch("/api/schedule/hours", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        hours.map((h) => ({
          dayOfWeek: h.dayOfWeek,
          isOpen: h.isOpen,
          morningEnabled: h.morningEnabled,
          morningStart: h.morningStart,
          morningEnd: h.morningEnd,
          eveningEnabled: h.eveningEnabled,
          eveningStart: h.eveningStart,
          eveningEnd: h.eveningEnd,
        }))
      ),
    });
    setSavingHours(false);
    router.refresh();
  };

  const addBlockedDate = async () => {
    if (!newBlockedDate) return;
    setAddingBlocked(true);
    await fetch("/api/schedule/blocked-dates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: newBlockedDate, reason: newBlockedReason }),
    });
    setNewBlockedDate("");
    setNewBlockedReason("");
    setAddingBlocked(false);
    router.refresh();
  };

  const removeBlockedDate = async (id: number) => {
    await fetch(`/api/schedule/blocked-dates?id=${id}`, { method: "DELETE" });
    router.refresh();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Drop-off Windows */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Drop-off Windows</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Each open day offers up to two drop-off windows. Uncheck a window to hide it for
            that day (e.g. evenings off on Saturday).
          </p>
          {hours.map((h) => (
            <div key={h.dayOfWeek} className="space-y-2 border-b pb-3 last:border-b-0">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={h.isOpen}
                  onChange={(e) => updateHour(h.dayOfWeek, "isOpen", e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm font-medium">{dayNames[h.dayOfWeek]}</span>
                {!h.isOpen && <span className="text-sm text-muted-foreground">— Closed</span>}
              </label>
              {h.isOpen && (
                <div className="space-y-2 pl-6">
                  <WindowRow
                    label="Morning"
                    enabled={h.morningEnabled}
                    start={h.morningStart}
                    end={h.morningEnd}
                    fallbackStart="07:00"
                    fallbackEnd="09:00"
                    onToggle={(v) => toggleWindow(h.dayOfWeek, "morning", v)}
                    onStart={(v) => updateHour(h.dayOfWeek, "morningStart", v)}
                    onEnd={(v) => updateHour(h.dayOfWeek, "morningEnd", v)}
                  />
                  <WindowRow
                    label="Evening"
                    enabled={h.eveningEnabled}
                    start={h.eveningStart}
                    end={h.eveningEnd}
                    fallbackStart="15:00"
                    fallbackEnd="17:00"
                    onToggle={(v) => toggleWindow(h.dayOfWeek, "evening", v)}
                    onStart={(v) => updateHour(h.dayOfWeek, "eveningStart", v)}
                    onEnd={(v) => updateHour(h.dayOfWeek, "eveningEnd", v)}
                  />
                </div>
              )}
            </div>
          ))}
          {hasInvalid && (
            <p className="text-sm text-destructive">
              Each enabled window needs a start time before its end time.
            </p>
          )}
          <Button onClick={saveHours} disabled={savingHours || hasInvalid} className="mt-2">
            {savingHours && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Windows
          </Button>
        </CardContent>
      </Card>

      {/* Blocked Dates */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Blocked Dates</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              type="date"
              value={newBlockedDate}
              onChange={(e) => setNewBlockedDate(e.target.value)}
              className="w-40"
            />
            <Input
              placeholder="Reason (optional)"
              value={newBlockedReason}
              onChange={(e) => setNewBlockedReason(e.target.value)}
              className="flex-1"
            />
            <Button onClick={addBlockedDate} disabled={addingBlocked || !newBlockedDate} size="icon">
              {addingBlocked ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </Button>
          </div>

          <div className="space-y-2">
            {initialBlockedDates.length === 0 ? (
              <p className="text-sm text-muted-foreground">No blocked dates.</p>
            ) : (
              initialBlockedDates.map((bd) => (
                <div
                  key={bd.id}
                  className="flex items-center justify-between rounded-md border p-2 text-sm"
                >
                  <div>
                    <span className="font-medium">
                      {new Date(bd.date + "T00:00:00").toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                    {bd.reason && (
                      <span className="text-muted-foreground ml-2">— {bd.reason}</span>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeBlockedDate(bd.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function WindowRow({
  label,
  enabled,
  start,
  end,
  fallbackStart,
  fallbackEnd,
  onToggle,
  onStart,
  onEnd,
}: {
  label: string;
  enabled: boolean;
  start: string | null;
  end: string | null;
  fallbackStart: string;
  fallbackEnd: string;
  onToggle: (enabled: boolean) => void;
  onStart: (value: string) => void;
  onEnd: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-2 w-24">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="rounded"
        />
        <span className="text-sm">{label}</span>
      </label>
      {enabled ? (
        <div className="flex items-center gap-2">
          <Input
            type="time"
            value={start ?? fallbackStart}
            onChange={(e) => onStart(e.target.value)}
            className="w-28"
          />
          <span className="text-sm text-muted-foreground">to</span>
          <Input
            type="time"
            value={end ?? fallbackEnd}
            onChange={(e) => onEnd(e.target.value)}
            className="w-28"
          />
        </div>
      ) : (
        <span className="text-sm text-muted-foreground">Off</span>
      )}
    </div>
  );
}
