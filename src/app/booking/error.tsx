"use client";

import { useEffect } from "react";
import { ErrorFallback } from "@/components/error-fallback";
import { logger } from "@/lib/logger";

// Covers /booking and /booking/[jobId] (the chat + manage page, the most likely customer
// route to throw — e.g. a decrypt or SSE hiccup). Keeps the failure scoped instead of
// surfacing as a full-page crash.
export default function BookingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("unhandled error (booking boundary)", { digest: error.digest, message: error.message });
  }, [error]);

  return <ErrorFallback reset={reset} />;
}
