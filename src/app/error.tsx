"use client";

import { useEffect } from "react";
import { ErrorFallback } from "@/components/error-fallback";
import { logger } from "@/lib/logger";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("unhandled error (root boundary)", { digest: error.digest, message: error.message });
  }, [error]);

  return <ErrorFallback reset={reset} />;
}
