export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { chatStreamResponse } from "@/lib/sse";

// Live message stream for the admin message board.
export async function GET(request: NextRequest, { params }: { params: { bookingId: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const bookingId = parseInt(params.bookingId, 10);
  if (Number.isNaN(bookingId)) {
    return Response.json({ error: "Invalid booking id" }, { status: 400 });
  }
  return chatStreamResponse(bookingId, request.signal);
}
