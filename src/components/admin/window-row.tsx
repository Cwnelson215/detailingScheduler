"use client";

import { Input } from "@/components/ui/input";

// One drop-off-window row: an enable checkbox plus start/end time inputs. Shared by the
// weekday template editor (schedule-manager) and the per-date editor (available-dates-calendar).
export function WindowRow({
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
