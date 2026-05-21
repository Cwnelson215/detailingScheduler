import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-secondary/40 px-6 text-center">
      <p className="font-display text-5xl font-bold text-foreground">404</p>
      <h1 className="mt-4 text-2xl font-semibold text-foreground">Page not found</h1>
      <p className="mt-3 max-w-md text-muted-foreground">
        The page you&apos;re looking for doesn&apos;t exist or has moved.
      </p>
      <div className="mt-8 flex gap-4">
        <Button asChild>
          <Link href="/">Back to Home</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/booking">Book a Detail</Link>
        </Button>
      </div>
    </div>
  );
}
