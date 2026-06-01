export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { getWindowOptions } from "@/lib/availability";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");

  if (!date) {
    return Response.json({ error: "date is required" }, { status: 400 });
  }

  // Availability no longer depends on the service (windows are fixed); a `serviceId` query
  // param, if present, is simply ignored for backward compatibility.
  const options = await getWindowOptions(date);
  return Response.json(options);
}
