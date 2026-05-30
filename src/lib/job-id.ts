import crypto from "node:crypto";

// Crockford base32 — excludes I, L, O, U to avoid ambiguity with 1/0 and accidental
// profanity. 8 chars ≈ 40 bits of entropy, plenty for an unguessable-but-typeable handle.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const JOB_ID_LENGTH = 8;

// Generate a random Job ID using rejection sampling so each character is uniformly
// distributed (a plain `byte % 32` would bias toward lower letters since 256 % 32 === 0,
// but we reject bytes >= 256 - (256 % 32) defensively to keep this correct if the
// alphabet length ever changes to a non-power-of-two).
export function generateJobId(): string {
  const max = 256 - (256 % ALPHABET.length);
  let out = "";
  while (out.length < JOB_ID_LENGTH) {
    const byte = crypto.randomBytes(1)[0];
    if (byte >= max) continue;
    out += ALPHABET[byte % ALPHABET.length];
  }
  return out;
}

// Format for display, e.g. "ABCD-2345". The dash is cosmetic — normalizeJobId strips it.
// Accepts null/undefined (the jobId column is typed nullable) and returns "" so callers
// don't have to guard.
export function formatJobId(jobId: string | null | undefined): string {
  if (!jobId) return "";
  if (jobId.length !== JOB_ID_LENGTH) return jobId;
  return `${jobId.slice(0, 4)}-${jobId.slice(4)}`;
}

// Canonicalize user input back to the stored form: uppercase, drop spaces/dashes, and
// map the visually-ambiguous characters a customer might type (I/L → 1, O → 0) onto the
// alphabet so "ABCD-0L1O" still resolves.
export function normalizeJobId(input: string): string {
  return input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0");
}
