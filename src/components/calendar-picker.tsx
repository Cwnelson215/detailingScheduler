"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, isSameMonth, isSameDay, isBefore, startOfDay } from "date-fns";

interface CalendarPickerProps {
  selected: string;
  onSelect: (date: string) => void;
}

export function CalendarPicker({ selected, onSelect }: CalendarPickerProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [availableDates, setAvailableDates] = useState<Set<string>>(new Set());
  const today = startOfDay(new Date());
  const selectedDate = selected ? new Date(selected + "T00:00:00") : null;

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

  // Only admin-opened dates with a free window are bookable; fetch them for the visible grid
  // so everything else renders disabled. Re-fetched whenever the month changes.
  useEffect(() => {
    const from = format(calStart, "yyyy-MM-dd");
    const to = format(calEnd, "yyyy-MM-dd");
    let cancelled = false;
    fetch(`/api/availability/dates?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setAvailableDates(new Set(Array.isArray(data) ? data : []));
      })
      .catch(() => {
        if (!cancelled) setAvailableDates(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [currentMonth]);

  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  return (
    <div className="rounded-lg border p-4 w-fit mx-auto">
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
        {weeks.flat().map((d, i) => {
          const isCurrentMonth = isSameMonth(d, currentMonth);
          const isPast = isBefore(d, today);
          const isSelected = selectedDate && isSameDay(d, selectedDate);
          const isToday = isSameDay(d, today);
          const dateStr = format(d, "yyyy-MM-dd");
          const isAvailable = availableDates.has(dateStr);
          const disabled = isPast || !isCurrentMonth || !isAvailable;

          return (
            <button
              key={i}
              disabled={disabled}
              onClick={() => onSelect(dateStr)}
              className={`relative h-10 w-10 rounded-md text-sm transition-colors ${
                isSelected
                  ? "bg-primary text-primary-foreground"
                  : disabled
                  ? "text-muted-foreground/30 cursor-not-allowed"
                  : "hover:bg-accent"
              } ${isToday && !isSelected ? "font-bold" : ""}`}
            >
              {format(d, "d")}
              {isAvailable && !isSelected && (
                <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
