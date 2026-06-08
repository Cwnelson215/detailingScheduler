export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { getAvailableDatesInRange } from "@/lib/availability";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Public: the bookable dates within [from, to], so the calendar can gray out everything else.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to)) {
    return Response.json({ error: "from and to (YYYY-MM-DD) are required" }, { status: 400 });
  }

  const dates = await getAvailableDatesInRange(from, to);
  return Response.json(dates);
}
