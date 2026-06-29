import { describe, it, expect } from "vitest";
import {
  effectiveDiscountPercent,
  finalCents,
  discountCents,
  SAME_DAY_PERCENT,
  REFERRAL_PERCENT,
} from "./pricing";

describe("effectiveDiscountPercent", () => {
  it("returns 0 with no discounts", () => {
    expect(effectiveDiscountPercent({ sameDay: false })).toBe(0);
  });

  it("stacks promo + referral additively (10 + 15 = 25)", () => {
    expect(effectiveDiscountPercent({ sameDay: false, promoPercent: 10, referralPercent: 15 })).toBe(25);
  });

  it("applies promo alone", () => {
    expect(effectiveDiscountPercent({ sameDay: false, promoPercent: 10 })).toBe(10);
  });

  it("applies referral alone", () => {
    expect(effectiveDiscountPercent({ sameDay: false, referralPercent: REFERRAL_PERCENT })).toBe(15);
  });

  it("same-day always wins and ignores promo/referral", () => {
    expect(
      effectiveDiscountPercent({ sameDay: true, promoPercent: 10, referralPercent: 15 }),
    ).toBe(SAME_DAY_PERCENT);
    expect(effectiveDiscountPercent({ sameDay: true })).toBe(20);
  });
});

describe("finalCents", () => {
  it("returns the base when percent is 0 or negative", () => {
    expect(finalCents(15000, 0)).toBe(15000);
    expect(finalCents(15000, -5)).toBe(15000);
  });

  it("applies a clean percent", () => {
    expect(finalCents(15000, 10)).toBe(13500);
    expect(finalCents(15000, 25)).toBe(11250);
    expect(finalCents(15000, 20)).toBe(12000);
  });

  it("rounds to the nearest cent", () => {
    // 9999 * 0.85 = 8499.15 -> 8499
    expect(finalCents(9999, 15)).toBe(8499);
    // 12345 * 0.90 = 11110.5 -> 11111 (round half up)
    expect(finalCents(12345, 10)).toBe(11111);
  });
});

describe("discountCents", () => {
  it("is base minus final", () => {
    expect(discountCents(15000, 10)).toBe(1500);
    expect(discountCents(15000, 25)).toBe(3750);
  });
});
