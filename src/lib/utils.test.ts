import { describe, it, expect } from "vitest";
import { formatCurrency, formatDuration, cn } from "@/lib/utils";

describe("formatCurrency", () => {
  it("formats cents as USD", () => expect(formatCurrency(15000)).toBe("$150.00"));
  it("handles zero", () => expect(formatCurrency(0)).toBe("$0.00"));
  it("keeps the cents component", () => expect(formatCurrency(12345)).toBe("$123.45"));
});

describe("formatDuration", () => {
  it("under an hour shows minutes", () => expect(formatDuration(45)).toBe("45 min"));
  it("whole hours omit the minutes", () => expect(formatDuration(120)).toBe("2h"));
  it("shows hours and minutes", () => expect(formatDuration(330)).toBe("5h 30m"));
});

describe("cn", () => {
  it("merges conflicting tailwind classes, last wins", () =>
    expect(cn("px-2", "px-4")).toBe("px-4"));
  it("drops falsy values", () =>
    expect(cn("text-sm", false && "hidden", "font-bold")).toBe("text-sm font-bold"));
});
