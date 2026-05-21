import { describe, it, expect } from "vitest";
import { timeToMinutes, minutesToTime, rangesOverlap } from "@/lib/time";

describe("timeToMinutes", () => {
  it("parses HH:MM", () => expect(timeToMinutes("08:30")).toBe(510));
  it("ignores the seconds in HH:MM:SS", () => expect(timeToMinutes("08:30:00")).toBe(510));
  it("handles midnight", () => expect(timeToMinutes("00:00")).toBe(0));
});

describe("minutesToTime", () => {
  it("formats minutes back to HH:MM", () => expect(minutesToTime(510)).toBe("08:30"));
  it("zero-pads", () => expect(minutesToTime(5)).toBe("00:05"));
});

describe("rangesOverlap", () => {
  it("detects a partial overlap", () => expect(rangesOverlap(480, 600, 540, 660)).toBe(true));
  it("treats back-to-back ranges as non-overlapping", () =>
    expect(rangesOverlap(480, 540, 540, 600)).toBe(false));
  it("returns false when fully separated", () =>
    expect(rangesOverlap(480, 510, 600, 660)).toBe(false));
  it("returns true when one range fully contains the other", () =>
    expect(rangesOverlap(480, 720, 540, 600)).toBe(true));
});
