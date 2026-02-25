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
  openTime: string | null;
  closeTime: string | null;
  isOpen: boolean;
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

  const updateHour = (dayOfWeek: number, field: string, value: string | boolean) => {
    setHours(
      hours.map((h) =>
        h.dayOfWeek === dayOfWeek ? { ...h, [field]: value } : h
      )
    );
  };

  const saveHours = async () => {
    setSavingHours(true);
    await fetch("/api/schedule/hours", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        hours.map((h) => ({
          dayOfWeek: h.dayOfWeek,
          openTime: h.openTime,
          closeTime: h.closeTime,
          isOpen: h.isOpen,
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
      {/* Business Hours */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Business Hours</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {hours.map((h) => (
            <div key={h.dayOfWeek} className="flex items-center gap-3">
              <label className="flex items-center gap-2 w-28">
                <input
                  type="checkbox"
                  checked={h.isOpen}
                  onChange={(e) => updateHour(h.dayOfWeek, "isOpen", e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm font-medium">{dayNames[h.dayOfWeek]}</span>
              </label>
              {h.isOpen ? (
                <div className="flex items-center gap-2 flex-1">
                  <Input
                    type="time"
                    value={h.openTime || "08:00"}
                    onChange={(e) => updateHour(h.dayOfWeek, "openTime", e.target.value)}
                    className="w-32"
                  />
                  <span className="text-sm text-muted-foreground">to</span>
                  <Input
                    type="time"
                    value={h.closeTime || "17:00"}
                    onChange={(e) => updateHour(h.dayOfWeek, "closeTime", e.target.value)}
                    className="w-32"
                  />
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">Closed</span>
              )}
            </div>
          ))}
          <Button onClick={saveHours} disabled={savingHours} className="mt-4">
            {savingHours && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Hours
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
