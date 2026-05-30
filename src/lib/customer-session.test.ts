import { describe, it, expect } from "vitest";
import {
  issueCustomerToken,
  verifyCustomerToken,
  requireCustomerBooking,
  customerCookieHeader,
  CUSTOMER_COOKIE,
} from "./customer-session";

describe("customer-session", () => {
  it("issues and verifies a token scoped to a booking", () => {
    const token = issueCustomerToken(42);
    expect(verifyCustomerToken(token)).toEqual({ bookingId: 42 });
  });

  it("rejects a tampered token", () => {
    const token = issueCustomerToken(42);
    const tampered = token.slice(0, -2) + (token.endsWith("aa") ? "bb" : "aa");
    expect(verifyCustomerToken(tampered)).toBeNull();
  });

  it("rejects an expired token", () => {
    const past = Date.now() - 3 * 60 * 60 * 1000; // issued 3h ago, TTL is 2h
    const token = issueCustomerToken(42, past);
    expect(verifyCustomerToken(token)).toBeNull();
  });

  it("rejects undefined / malformed input", () => {
    expect(verifyCustomerToken(undefined)).toBeNull();
    expect(verifyCustomerToken("not-a-token")).toBeNull();
  });

  it("requireCustomerBooking matches only the scoped booking", () => {
    const token = issueCustomerToken(7);
    const req = new Request("http://localhost/x", {
      headers: { cookie: `${CUSTOMER_COOKIE}=${encodeURIComponent(token)}` },
    });
    expect(requireCustomerBooking(req, 7)).toBe(true);
    expect(requireCustomerBooking(req, 8)).toBe(false);
  });

  it("requireCustomerBooking is false without a cookie", () => {
    const req = new Request("http://localhost/x");
    expect(requireCustomerBooking(req, 7)).toBe(false);
  });

  it("cookie header carries HttpOnly + SameSite", () => {
    const header = customerCookieHeader(issueCustomerToken(1));
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
  });
});
