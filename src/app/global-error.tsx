"use client";

import { useEffect } from "react";
import { logger } from "@/lib/logger";

// Catches errors thrown in the root layout itself — the one place the root error.tsx
// can't cover. It replaces the whole document, so it renders its own <html>/<body> and
// uses inline styles (global CSS / Tailwind may not be loaded at this point).
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("unhandled error (global boundary)", { digest: error.digest, message: error.message });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          minHeight: "100vh",
          margin: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: "0 1.5rem",
        }}
      >
        <h1 style={{ fontSize: "1.875rem", fontWeight: 700 }}>Something went wrong</h1>
        <p style={{ marginTop: "0.75rem", maxWidth: "28rem", color: "#666" }}>
          An unexpected error occurred. Please try again — if it keeps happening, get in touch.
        </p>
        <div style={{ marginTop: "2rem", display: "flex", gap: "1rem" }}>
          <button
            onClick={reset}
            style={{ padding: "0.5rem 1rem", borderRadius: "0.375rem", border: "1px solid #ccc", cursor: "pointer" }}
          >
            Try again
          </button>
          <a href="/" style={{ padding: "0.5rem 1rem", borderRadius: "0.375rem", border: "1px solid #ccc", textDecoration: "none", color: "inherit" }}>
            Back to Home
          </a>
        </div>
      </body>
    </html>
  );
}
