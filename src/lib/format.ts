// Pure presentation helpers shared by server routes, server components, client
// components, and emails. Intentionally free of DB/Next imports so it's safe everywhere.

export type DropoffWindow = "morning" | "evening";

// One bookable drop-off window for a given date, as returned by GET /api/availability.
export interface WindowOption {
  key: DropoffWindow;
  label: string; // e.g. "Morning drop-off"
  startTime: string; // "HH:MM" — the window's start (also what gets stored on the booking)
  endTime: string; // "HH:MM"
  available: boolean;
}

// "09:30" / "09:30:00" -> "9:30 AM". Seconds (Postgres `time`) are ignored.
export function formatTime(time: string): string {
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${display}:${m} ${ampm}`;
}

export function windowName(w: DropoffWindow): string {
  return w === "morning" ? "Morning" : "Evening";
}

// "Morning drop-off" — used as the picker button title and the WindowOption label.
export function windowLabel(w: DropoffWindow): string {
  return `${windowName(w)} drop-off`;
}

// "Morning drop-off (7:00 AM)" — for confirmation/manage pages and emails, where only the
// stored start time is on hand. Communicates the window plus when to drop the car off.
export function dropoffSummary(w: DropoffWindow, startTime: string): string {
  return `${windowLabel(w)} (${formatTime(startTime)})`;
}

// "7:00 AM – 9:00 AM" — the full window range, shown in the booking/reschedule pickers
// where both ends are available.
export function windowRange(startTime: string, endTime: string): string {
  return `${formatTime(startTime)} – ${formatTime(endTime)}`;
}
