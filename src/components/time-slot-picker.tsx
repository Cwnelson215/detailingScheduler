"use client";

interface TimeSlot {
  time: string;
  available: boolean;
}

interface TimeSlotPickerProps {
  slots: TimeSlot[];
  selected: string;
  onSelect: (time: string) => void;
}

function formatTime(time: string): string {
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${display}:${m} ${ampm}`;
}

export function TimeSlotPicker({ slots, selected, onSelect }: TimeSlotPickerProps) {
  const availableSlots = slots.filter((s) => s.available);

  if (slots.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-8">
        No available time slots for this date.
      </p>
    );
  }

  if (availableSlots.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-8">
        All time slots are booked for this date. Please choose another date.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
      {slots.map((slot) => (
        <button
          key={slot.time}
          disabled={!slot.available}
          onClick={() => onSelect(slot.time)}
          className={`rounded-md border px-3 py-2 text-sm transition-colors ${
            selected === slot.time
              ? "bg-primary text-primary-foreground border-primary"
              : slot.available
              ? "hover:bg-accent hover:border-primary/50"
              : "opacity-30 cursor-not-allowed line-through"
          }`}
        >
          {formatTime(slot.time)}
        </button>
      ))}
    </div>
  );
}
