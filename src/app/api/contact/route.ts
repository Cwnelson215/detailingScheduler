export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { contactSchema } from "@/lib/validations";
import { sendContactMessage } from "@/lib/email";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = contactSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await sendContactMessage(parsed.data);
  } catch (e) {
    console.error("[contact] failed to send message:", e);
    return Response.json(
      { error: "Couldn't send your message. Please try again." },
      { status: 502 },
    );
  }

  return Response.json({ ok: true }, { status: 200 });
}
