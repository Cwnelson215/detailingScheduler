"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

// Shared presentational fallback for the route-segment error boundaries (error.tsx /
// global-error.tsx). Boundaries do the logging + `reset` wiring; this just renders.
export function ErrorFallback({
  reset,
  title = "Something went wrong",
  message = "An unexpected error occurred. Please try again — if it keeps happening, get in touch.",
}: {
  reset: () => void;
  title?: string;
  message?: string;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-secondary/40 px-6 text-center">
      <h1 className="text-3xl font-bold text-foreground">{title}</h1>
      <p className="mt-3 max-w-md text-muted-foreground">{message}</p>
      <div className="mt-8 flex gap-4">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="outline">
          <Link href="/">Back to Home</Link>
        </Button>
      </div>
    </div>
  );
}
