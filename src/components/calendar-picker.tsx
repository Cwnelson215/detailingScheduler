"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, isSameMonth, isSameDay, isBefore, startOfDay } from "date-fns";

interface CalendarPickerProps {
  selected: string;
  onSelect: (date: string) => void;
}

export function CalendarPicker({ selected, onSelect }: CalendarPickerProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
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

          return (
            <button
              key={i}
              disabled={isPast || !isCurrentMonth}
              onClick={() => onSelect(dateStr)}
              className={`h-10 w-10 rounded-md text-sm transition-colors ${
                isSelected
                  ? "bg-primary text-primary-foreground"
                  : isToday
                  ? "bg-accent font-bold"
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
  );
}
