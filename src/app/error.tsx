"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-secondary/40 px-6 text-center">
      <h1 className="text-3xl font-bold text-foreground">Something went wrong</h1>
      <p className="mt-3 max-w-md text-muted-foreground">
        An unexpected error occurred. Please try again — if it keeps happening, get in touch.
      </p>
      <div className="mt-8 flex gap-4">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="outline">
          <Link href="/">Back to Home</Link>
        </Button>
      </div>
    </div>
  );
}
