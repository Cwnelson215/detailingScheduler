"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { MarkReadyButton } from "@/components/admin/mark-ready-button";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { windowLabel, windowRange, type DropoffWindow } from "@/lib/format";
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

// An admin-opened date with its per-date drop-off windows (authoritative for availability).
export interface OpenDate {
  id: number;
  date: string; // "YYYY-MM-DD"
  morningEnabled: boolean;
  morningStart: string | null;
  morningEnd: string | null;
  eveningEnabled: boolean;
  eveningStart: string | null;
  eveningEnd: string | null;
}

// A non-cancelled booking holding a window, with the bits the detail panel renders.
export interface CalendarBooking {
  id: number;
  serviceName: string;
  customerName: string;
  vehicleYear: string;
  vehicleMake: string;
  vehicleModel: string;
  appointmentDate: string; // "YYYY-MM-DD"
  appointmentTime: string;
  dropoffWindow: DropoffWindow;
  status: string;
}

// One window's worth of the calendar's per-day view. `booking === null` ⇒ open/free.
// `orphan` flags a booking on a date/window the admin has since closed or disabled — surfaced
// so a real car is never hidden.
interface WindowCell {
  key: DropoffWindow;
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
  booking: CalendarBooking | null;
  orphan: boolean;
}

const statusColors: Record<string, "default" | "secondary" | "destructive" | "success" | "outline"> = {
  pending: "outline",
  confirmed: "default",
  ready: "success",
  completed: "secondary",
  cancelled: "destructive",
};

// The two fixed windows in display order, paired with their OpenDate columns — mirrors the
// server-side WINDOWS table in lib/availability.ts (re-declared here because that module is
// server-only). A window shows only when enabled with both times present.
const WINDOWS: {
  key: DropoffWindow;
  enabled: (d: OpenDate) => boolean;
  start: (d: OpenDate) => string | null;
  end: (d: OpenDate) => string | null;
}[] = [
  { key: "morning", enabled: (d) => d.morningEnabled, start: (d) => d.morningStart, end: (d) => d.morningEnd },
  { key: "evening", enabled: (d) => d.eveningEnabled, start: (d) => d.eveningStart, end: (d) => d.eveningEnd },
];

// Trim a Postgres `time` value ("HH:MM:SS") down to "HH:MM".
function hhmm(t: string): string {
  return t.slice(0, 5);
}

// Read-only month calendar of open and booked drop-off windows. The full dataset is passed in
// once; month navigation and the detail panel run entirely client-side. Clicking a day opens a
// panel with quick actions (mark a car ready, or open a closed date).
export function BookingCalendar({
  openDates,
  bookings,
}: {
  openDates: OpenDate[];
  bookings: CalendarBooking[];
}) {
  const router = useRouter();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  const openByDate = useMemo(
    () => new Map(openDates.map((d) => [d.date, d])),
    [openDates],
  );
  const bookingsByDate = useMemo(() => {
    const m = new Map<string, CalendarBooking[]>();
    for (const b of bookings) {
      const list = m.get(b.appointmentDate);
      if (list) list.push(b);
      else m.set(b.appointmentDate, [b]);
    }
    return m;
  }, [bookings]);

  // The single source of truth for both the cell dots and the detail panel: every window the
  // day offers (with its booking, if any), plus any "orphan" bookings on windows that are no
  // longer open. Empty when the date is closed and has no bookings.
  const windowsForDate = useMemo(() => {
    return (dateStr: string): WindowCell[] => {
      const open = openByDate.get(dateStr);
      const dayBookings = bookingsByDate.get(dateStr) ?? [];
      const cells: WindowCell[] = [];
      const covered = new Set<DropoffWindow>();

      if (open) {
        for (const w of WINDOWS) {
          const start = w.start(open);
          const end = w.end(open);
          if (!w.enabled(open) || !start || !end) continue;
          covered.add(w.key);
          cells.push({
            key: w.key,
            startTime: hhmm(start),
            endTime: hhmm(end),
            booking: dayBookings.find((b) => b.dropoffWindow === w.key) ?? null,
            orphan: false,
          });
        }
      }

      // Bookings on windows the admin has since closed/disabled — show them anyway.
      for (const b of dayBookings) {
        if (covered.has(b.dropoffWindow)) continue;
        covered.add(b.dropoffWindow);
        cells.push({
          key: b.dropoffWindow,
          startTime: hhmm(b.appointmentTime),
          endTime: hhmm(b.appointmentTime),
          booking: b,
          orphan: true,
        });
      }

      return cells;
    };
  }, [openByDate, bookingsByDate]);

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

  const selectedCells = selectedDate ? windowsForDate(selectedDate) : [];
  const selectedIsOpen = selectedDate ? openByDate.has(selectedDate) : false;

  // Open a closed date for booking, seeding its windows from the weekday template (same call
  // the schedule editor makes). Refresh pulls the new row back into the calendar.
  const openDate = async (dateStr: string) => {
    setOpening(true);
    await fetch("/api/schedule/available-dates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ add: [dateStr], remove: [] }),
    });
    setOpening(false);
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      {/* Calendar grid */}
      <div className="rounded-lg border p-4 w-fit bg-card">
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

        {/* Legend */}
        <div className="flex items-center gap-4 mb-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Open
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-red-500" /> Booked
          </span>
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
            const cells = windowsForDate(dateStr);
            const isSelected = selectedDate === dateStr;

            return (
              <button
                key={i}
                type="button"
                onClick={() => setSelectedDate(dateStr)}
                className={`h-16 w-12 rounded-md text-sm flex flex-col items-center justify-start pt-1.5 gap-1 transition-colors ${
                  isSelected ? "ring-2 ring-primary" : ""
                } ${
                  !isCurrentMonth || isPast
                    ? "text-muted-foreground/40 hover:bg-accent/50"
                    : "hover:bg-accent"
                }`}
              >
                <span>{format(d, "d")}</span>
                <span className="flex gap-1 h-2">
                  {cells.map((c) => (
                    <span
                      key={c.key}
                      className={`h-2 w-2 rounded-full ${
                        c.orphan
                          ? "bg-amber-500"
                          : c.booking
                          ? "bg-red-500"
                          : "bg-emerald-500"
                      }`}
                    />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Detail panel */}
      <div className="flex-1">
        {!selectedDate ? (
          <p className="text-sm text-muted-foreground">
            Select a day to see its drop-off windows and bookings.
          </p>
        ) : (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">
              {format(new Date(selectedDate + "T00:00:00"), "EEE, MMM d, yyyy")}
            </h2>

            {selectedCells.length === 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  This date isn&apos;t open for booking.
                </p>
                <Button onClick={() => openDate(selectedDate)} disabled={opening}>
                  {opening && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Open this date
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedCells.map((c) => (
                  <Card key={c.key}>
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="font-medium">{windowLabel(c.key)}</p>
                          {!c.orphan && (
                            <p className="text-sm text-muted-foreground">
                              {windowRange(c.startTime, c.endTime)}
                            </p>
                          )}
                        </div>
                        {c.orphan ? (
                          <Badge variant="outline" className="text-amber-600 border-amber-500">
                            Window no longer open
                          </Badge>
                        ) : c.booking ? (
                          <Badge variant={statusColors[c.booking.status]}>
                            {c.booking.status}
                          </Badge>
                        ) : (
                          <Badge variant="success">Open</Badge>
                        )}
                      </div>

                      {c.booking && (
                        <div className="space-y-2 border-t pt-2">
                          <div>
                            <p className="font-medium">{c.booking.customerName}</p>
                            <p className="text-sm text-muted-foreground">
                              {c.booking.serviceName}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {c.booking.vehicleYear} {c.booking.vehicleMake}{" "}
                              {c.booking.vehicleModel}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/admin/bookings/${c.booking.id}`}
                              className="text-sm font-medium text-primary hover:underline"
                            >
                              View booking
                            </Link>
                            <MarkReadyButton
                              bookingId={c.booking.id}
                              currentStatus={c.booking.status}
                            />
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {!selectedIsOpen && selectedCells.length > 0 && (
              <p className="text-xs text-muted-foreground">
                This date is closed for new bookings but has existing bookings above.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
