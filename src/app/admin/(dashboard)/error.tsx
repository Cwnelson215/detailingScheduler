"use client";

import { useEffect } from "react";
import { ErrorFallback } from "@/components/error-fallback";
import { logger } from "@/lib/logger";

// Scoped boundary for the admin dashboard so a failing page (e.g. a bad DB query) shows
// a recoverable message instead of bubbling up to the full-page root boundary.
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("unhandled error (admin boundary)", { digest: error.digest, message: error.message });
  }, [error]);

  return <ErrorFallback reset={reset} title="Dashboard error" />;
}
