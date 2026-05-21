// Pure time helpers, intentionally free of any DB imports so they can be unit-tested
// in isolation. Times are "HH:MM" or "HH:MM:SS" (Postgres `time` columns return the
// latter); the seconds component is ignored.

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

// Half-open interval overlap: [aStart, aEnd) vs [bStart, bEnd). Back-to-back ranges
// (one ends exactly when the next begins) do NOT overlap.
export function rangesOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && aEnd > bStart;
}
