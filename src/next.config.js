// Conservative security headers applied to every route. These four are zero-risk:
// they don't constrain what the app may load, only how the browser frames/sniffs/
// reports it. A full Content-Security-Policy is intentionally NOT set here yet —
// Next.js's App Router needs inline styles (and inline/eval script in dev), so a CSP
// has to be authored and browser-verified against the booking + admin flows first.
const securityHeaders = [
  // Clickjacking protection for /admin and the booking flow.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Served over TLS via Traefik in prod; harmless over http on localhost.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ["@electric-sql/pglite"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

module.exports = nextConfig;
