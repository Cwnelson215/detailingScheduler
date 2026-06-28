import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isUsingDefaultAdminPassword } from "@/lib/admin-password";

// Defense-in-depth: mutating admin API routes are already guarded by middleware.ts,
// but each handler also calls this so auth never depends on a single layer (a matcher
// edit or middleware change can't silently expose a write endpoint). Returns a 401
// Response to short-circuit when unauthenticated, or null when the request may proceed.
//
// It also refuses every admin API action while the seeded default password is still in
// place (a live hash check — see isUsingDefaultAdminPassword). The dashboard UI already
// blocks rendering until the password is rotated, but that gate doesn't cover direct API
// calls; without this, anyone who logs in with the default `admin123` could drive the
// admin API. The one path that must stay reachable to fix it — POST /api/admin/password —
// does NOT call requireAdmin (it does its own session check), so the operator can rotate.
export async function requireAdmin(): Promise<Response | null> {
  const session = await getServerSession(authOptions);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (await isUsingDefaultAdminPassword()) {
    return Response.json(
      { error: "Change the default admin password before performing this action." },
      { status: 403 },
    );
  }
  return null;
}
