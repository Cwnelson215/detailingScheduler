// Pure discount math, intentionally free of DB imports so it can be unit-tested in isolation
// and reused by both booking-create and referral-token redemption. All money is integer cents.
//
// Stacking rules (product decisions):
//  - promo (default 10%) + referral (default 15%) stack additively, up to 25%.
//  - the same-day repeat discount (20%) is standalone and ALWAYS wins: a booking that
//    qualifies for it can't also carry a promo or referral, so the 20% is the whole discount.

export const SAME_DAY_PERCENT = 20;
export const REFERRAL_PERCENT = 15;

type DiscountInputs = {
  sameDay: boolean;
  promoPercent?: number;
  referralPercent?: number;
};

// The total discount percent applied to a booking. Same-day wins outright; otherwise promo
// and referral add together.
export function effectiveDiscountPercent({
  sameDay,
  promoPercent = 0,
  referralPercent = 0,
}: DiscountInputs): number {
  if (sameDay) return SAME_DAY_PERCENT;
  return promoPercent + referralPercent;
}

// Apply a whole-number percent discount to a cents amount, rounded to the nearest cent.
export function finalCents(baseCents: number, percent: number): number {
  if (percent <= 0) return baseCents;
  return Math.round((baseCents * (100 - percent)) / 100);
}

// Convenience: the discount amount (what was taken off), in cents.
export function discountCents(baseCents: number, percent: number): number {
  return baseCents - finalCents(baseCents, percent);
}
