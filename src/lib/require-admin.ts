import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// Defense-in-depth: mutating admin API routes are already guarded by middleware.ts,
// but each handler also calls this so auth never depends on a single layer (a matcher
// edit or middleware change can't silently expose a write endpoint). Returns a 401
// Response to short-circuit when unauthenticated, or null when the request may proceed.
export async function requireAdmin(): Promise<Response | null> {
  const session = await getServerSession(authOptions);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
