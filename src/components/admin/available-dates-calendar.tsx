"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { WindowRow } from "@/components/admin/window-row";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  isSameMonth,
  isBefore,
  startOfDay,
} from "date-fns";

// An opened date and its per-date drop-off windows (authoritative for customer availability).
export interface AvailableDate {
  id: number;
  date: string;
  morningEnabled: boolean;
  morningStart: string | null;
  morningEnd: string | null;
  eveningEnabled: boolean;
  eveningStart: string | null;
  eveningEnd: string | null;
}

type Windows = Pick<
  AvailableDate,
  "morningEnabled" | "morningStart" | "morningEnd" | "eveningEnabled" | "eveningStart" | "eveningEnd"
>;

function windowsOf(d: AvailableDate): Windows {
  return {
    morningEnabled: d.morningEnabled,
    morningStart: d.morningStart,
    morningEnd: d.morningEnd,
    eveningEnabled: d.eveningEnabled,
    eveningStart: d.eveningStart,
    eveningEnd: d.eveningEnd,
  };
}

function sameWindows(a: Windows, b: Windows): boolean {
  return (
    a.morningEnabled === b.morningEnabled &&
    a.morningStart === b.morningStart &&
    a.morningEnd === b.morningEnd &&
    a.eveningEnabled === b.eveningEnabled &&
    a.eveningStart === b.eveningStart &&
    a.eveningEnd === b.eveningEnd
  );
}

// An enabled window with a missing time or start ≥ end is rejected server-side; surface it.
function invalidWindows(w: Windows): boolean {
  const bad = (s: string | null, e: string | null) => !s || !e || s >= e;
  return (w.morningEnabled && bad(w.morningStart, w.morningEnd)) ||
    (w.eveningEnabled && bad(w.eveningStart, w.eveningEnd));
}

// Multi-select month calendar for opening booking dates plus a per-date window editor. Click
// any future day to toggle it open/closed (Save Dates applies the diff; new dates inherit the
// weekday template's windows). Each open date then gets its own editable drop-off windows below.
export function AvailableDatesCalendar({ initialDates }: { initialDates: AvailableDate[] }) {
  const router = useRouter();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [original] = useState(() => new Set(initialDates.map((d) => d.date)));
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialDates.map((d) => d.date)));
  const [savingDates, setSavingDates] = useState(false);

  // Per-date window editing state (only the already-persisted open dates are editable here;
  // newly opened dates appear after Save Dates + refresh, seeded from the weekday template).
  const [initialWindows] = useState(() => new Map(initialDates.map((d) => [d.date, windowsOf(d)])));
  const [windows, setWindows] = useState<Map<string, Windows>>(
    () => new Map(initialDates.map((d) => [d.date, windowsOf(d)])),
  );
  const [savingWindows, setSavingWindows] = useState(false);

  const today = startOfDay(new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart);
  const calEnd = endOfWeek(monthEnd);

  const days: Date[] = [];
  let day = calStart;
  while (day <= calEnd) {
    days.push(day);
    day = addDays(day, 1);
  }

  const toggle = (dateStr: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(dateStr)) next.delete(dateStr);
      else next.add(dateStr);
      return next;
    });
  };

  // Diff the working set against what was loaded, so Save only sends real changes.
  const add = [...selected].filter((d) => !original.has(d));
  const remove = [...original].filter((d) => !selected.has(d));
  const datesDirty = add.length > 0 || remove.length > 0;

  const saveDates = async () => {
    setSavingDates(true);
    await fetch("/api/schedule/available-dates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ add, remove }),
    });
    setSavingDates(false);
    router.refresh();
  };

  // Future open dates (persisted) get an inline window editor, earliest first.
  const todayStr = format(today, "yyyy-MM-dd");
  const editable = initialDates
    .filter((d) => d.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date));

  const updateWindow = (date: string, patch: Partial<Windows>) => {
    setWindows((prev) => {
      const next = new Map(prev);
      const cur = next.get(date);
      if (cur) next.set(date, { ...cur, ...patch });
      return next;
    });
  };

  // Enabling a window seeds sensible default times if empty, so the row is immediately valid.
  const toggleWindow = (date: string, which: "morning" | "evening", enabled: boolean) => {
    const cur = windows.get(date);
    if (!cur) return;
    const [defStart, defEnd] = which === "morning" ? ["07:00", "09:00"] : ["15:00", "17:00"];
    updateWindow(date, {
      [`${which}Enabled`]: enabled,
      [`${which}Start`]: enabled ? cur[`${which}Start`] ?? defStart : cur[`${which}Start`],
      [`${which}End`]: enabled ? cur[`${which}End`] ?? defEnd : cur[`${which}End`],
    } as Partial<Windows>);
  };

  const changedDates = editable.filter((d) => {
    const w = windows.get(d.date);
    const init = initialWindows.get(d.date);
    return w && init && !sameWindows(w, init);
  });
  const windowsDirty = changedDates.length > 0;
  const windowsInvalid = editable.some((d) => {
    const w = windows.get(d.date);
    return w ? invalidWindows(w) : false;
  });

  const saveWindows = async () => {
    setSavingWindows(true);
    await fetch("/api/schedule/available-dates", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        changedDates.map((d) => ({ date: d.date, ...windows.get(d.date)! })),
      ),
    });
    setSavingWindows(false);
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Click dates to open them for booking. Nothing is bookable until you open it. A newly
        opened date inherits its weekday&apos;s default windows; adjust each date&apos;s windows below.
      </p>

      <div className="rounded-lg border p-4 w-fit">
        <div className="flex items-center justify-between mb-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCurrentMonth(addMonths(currentMonth, -1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-medium">{format(currentMonth, "MMMM yyyy")}</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="text-xs font-medium text-muted-foreground py-2">
              {d}
            </div>
          ))}
          {days.map((d, i) => {
            const isCurrentMonth = isSameMonth(d, currentMonth);
            const isPast = isBefore(d, today);
            const dateStr = format(d, "yyyy-MM-dd");
            const isOpen = selected.has(dateStr);

            return (
              <button
                key={i}
                type="button"
                disabled={isPast || !isCurrentMonth}
                onClick={() => toggle(dateStr)}
                className={`h-10 w-10 rounded-md text-sm transition-colors ${
                  isOpen
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : !isCurrentMonth || isPast
                    ? "text-muted-foreground/30 cursor-not-allowed"
                    : "hover:bg-accent"
                }`}
              >
                {format(d, "d")}
              </button>
            );
          })}
        </div>
      </div>

      <Button onClick={saveDates} disabled={savingDates || !datesDirty}>
        {savingDates && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        Save Dates
      </Button>

      {/* Per-date drop-off windows */}
      <div className="space-y-3 border-t pt-4">
        <h3 className="text-sm font-medium">Drop-off windows per date</h3>
        {editable.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No upcoming open dates yet. Open a date above and save to set its windows.
          </p>
        ) : (
          <div className="space-y-3">
            {editable.map((d) => {
              const w = windows.get(d.date)!;
              return (
                <div key={d.date} className="space-y-2 border-b pb-3 last:border-b-0">
                  <span className="text-sm font-medium">
                    {format(new Date(d.date + "T00:00:00"), "EEE, MMM d, yyyy")}
                  </span>
                  <div className="space-y-2 pl-1">
                    <WindowRow
                      label="Morning"
                      enabled={w.morningEnabled}
                      start={w.morningStart}
                      end={w.morningEnd}
                      fallbackStart="07:00"
                      fallbackEnd="09:00"
                      onToggle={(v) => toggleWindow(d.date, "morning", v)}
                      onStart={(v) => updateWindow(d.date, { morningStart: v })}
                      onEnd={(v) => updateWindow(d.date, { morningEnd: v })}
                    />
                    <WindowRow
                      label="Evening"
                      enabled={w.eveningEnabled}
                      start={w.eveningStart}
                      end={w.eveningEnd}
                      fallbackStart="15:00"
                      fallbackEnd="17:00"
                      onToggle={(v) => toggleWindow(d.date, "evening", v)}
                      onStart={(v) => updateWindow(d.date, { eveningStart: v })}
                      onEnd={(v) => updateWindow(d.date, { eveningEnd: v })}
                    />
                  </div>
                </div>
              );
            })}
            {windowsInvalid && (
              <p className="text-sm text-destructive">
                Each enabled window needs a start time before its end time.
              </p>
            )}
            <Button onClick={saveWindows} disabled={savingWindows || !windowsDirty || windowsInvalid}>
              {savingWindows && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Window Changes
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
