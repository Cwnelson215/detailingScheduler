export function getNextAuthSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (secret) return secret;
  // Secrets are injected at runtime (k8s app-secrets), not at build time. `next build`
  // sets NODE_ENV=production and evaluates route modules to collect page data, so guard
  // only at real runtime — never during the production build phase.
  const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
  if (process.env.NODE_ENV === "production" && !isBuildPhase) {
    throw new Error("NEXTAUTH_SECRET must be set in production");
  }
  return "dev-secret-change-in-production";
}
