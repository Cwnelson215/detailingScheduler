import { describe, it, expect } from "vitest";
import { formatPhone, isUsPhone } from "./format";

describe("formatPhone", () => {
  it("returns empty for empty input", () => {
    expect(formatPhone("")).toBe("");
  });

  it("formats a full 10-digit number", () => {
    expect(formatPhone("5551234567")).toBe("(555) 123-4567");
  });

  it("strips existing formatting and re-formats", () => {
    expect(formatPhone("(555) 123-4567")).toBe("(555) 123-4567");
    expect(formatPhone("555.123.4567")).toBe("(555) 123-4567");
  });

  it("formats partials as typed", () => {
    expect(formatPhone("555")).toBe("555");
    expect(formatPhone("5551")).toBe("(555) 1");
    expect(formatPhone("555123")).toBe("(555) 123");
    expect(formatPhone("5551234")).toBe("(555) 123-4");
  });

  it("truncates digits past the tenth", () => {
    expect(formatPhone("55512345678901")).toBe("(555) 123-4567");
  });

  it("ignores non-digit characters", () => {
    expect(formatPhone("abc555def123ghi4567")).toBe("(555) 123-4567");
  });
});

describe("isUsPhone", () => {
  it("accepts exactly 10 digits in any format", () => {
    expect(isUsPhone("5551234567")).toBe(true);
    expect(isUsPhone("(555) 123-4567")).toBe(true);
  });

  it("rejects too few or too many digits", () => {
    expect(isUsPhone("5551234")).toBe(false);
    expect(isUsPhone("155512345678")).toBe(false);
    expect(isUsPhone("abc")).toBe(false);
  });
});
