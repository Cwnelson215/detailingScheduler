import { describe, it, expect } from "vitest";
import { generateJobId, normalizeJobId, formatJobId } from "./job-id";

describe("job-id", () => {
  it("generates 8 chars from the Crockford alphabet (no I/L/O/U)", () => {
    for (let i = 0; i < 200; i++) {
      const id = generateJobId();
      expect(id).toHaveLength(8);
      expect(id).toMatch(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$/);
    }
  });

  it("is effectively unique across many generations", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) seen.add(generateJobId());
    expect(seen.size).toBe(5000);
  });

  it("normalizes ambiguous input back to the stored form", () => {
    expect(normalizeJobId("abcd-2345")).toBe("ABCD2345");
    expect(normalizeJobId("ab cd 23 45")).toBe("ABCD2345");
    expect(normalizeJobId("ILO0")).toBe("1100"); // I,L -> 1 ; O -> 0
  });

  it("formats with a dash that normalize strips", () => {
    const id = generateJobId();
    expect(formatJobId(id)).toBe(`${id.slice(0, 4)}-${id.slice(4)}`);
    expect(normalizeJobId(formatJobId(id))).toBe(id);
  });
});
