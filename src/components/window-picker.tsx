"use client";

import { windowRange, type DropoffWindow, type WindowOption } from "@/lib/format";

interface WindowPickerProps {
  options: WindowOption[];
  selected: DropoffWindow | "";
  onSelect: (key: DropoffWindow) => void;
}

export function WindowPicker({ options, selected, onSelect }: WindowPickerProps) {
  if (options.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-8">
        No drop-off windows available for this date.
      </p>
    );
  }

  if (options.every((o) => !o.available)) {
    return (
      <p className="text-center text-muted-foreground py-8">
        All drop-off windows are booked for this date. Please choose another date.
      </p>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {options.map((opt) => (
        <button
          key={opt.key}
          disabled={!opt.available}
          onClick={() => onSelect(opt.key)}
          className={`flex flex-col items-start rounded-lg border px-4 py-3 text-left transition-colors ${
            selected === opt.key
              ? "bg-primary text-primary-foreground border-primary"
              : opt.available
              ? "hover:bg-accent hover:border-primary/50"
              : "opacity-40 cursor-not-allowed"
          }`}
        >
          <span className={`font-medium ${!opt.available ? "line-through" : ""}`}>{opt.label}</span>
          <span className="text-sm opacity-80">{windowRange(opt.startTime, opt.endTime)}</span>
          {!opt.available && <span className="text-xs opacity-80">Booked</span>}
        </button>
      ))}
    </div>
  );
}
