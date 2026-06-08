"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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

// Which weekdays (0=Sun … 6=Sat) have at least one drop-off window enabled in the template.
// A date opened on a weekday with no windows shows nothing to customers — we hint at that.
interface WeekdayWindows {
  dayOfWeek: number;
  hasWindow: boolean;
}

// Multi-select month calendar for opening booking dates. Click any future day to toggle it
// in/out of the open set, then Save to apply the diff. Selections persist across month nav.
export function AvailableDatesCalendar({
  initialDates,
  weekdayWindows,
}: {
  initialDates: string[];
  weekdayWindows: WeekdayWindows[];
}) {
  const router = useRouter();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [original] = useState(() => new Set(initialDates));
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialDates));
  const [saving, setSaving] = useState(false);

  const today = startOfDay(new Date());
  const hasWindowByDay = new Map(weekdayWindows.map((w) => [w.dayOfWeek, w.hasWindow]));

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
  const dirty = add.length > 0 || remove.length > 0;

  // Selected days whose weekday template offers no windows (they'd show nothing to customers).
  const noWindowSelected = [...selected].filter(
    (d) => hasWindowByDay.get(new Date(d + "T00:00:00").getDay()) === false,
  );

  const save = async () => {
    setSaving(true);
    await fetch("/api/schedule/available-dates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ add, remove }),
    });
    setSaving(false);
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Click dates to open them for booking. Nothing is bookable until you open it. Each open
        date offers its weekday&apos;s drop-off windows (set on the left).
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

      {noWindowSelected.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Some opened dates fall on a weekday with no drop-off windows enabled — those dates
          won&apos;t show any booking options until you enable a window for that weekday.
        </p>
      )}

      <Button onClick={save} disabled={saving || !dirty}>
        {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        Save Dates
      </Button>
    </div>
  );
}
