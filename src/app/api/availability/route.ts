export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { getAvailableSlots } from "@/lib/availability";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const serviceId = searchParams.get("serviceId");

  if (!date || !serviceId) {
    return Response.json({ error: "date and serviceId are required" }, { status: 400 });
  }

  const slots = await getAvailableSlots(date, parseInt(serviceId));
  return Response.json(slots);
}
