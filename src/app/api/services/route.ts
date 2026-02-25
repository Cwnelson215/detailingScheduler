export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { db } from "@/db";
import { services } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { serviceSchema } from "@/lib/validations";

export async function GET() {
  const result = await db
    .select()
    .from(services)
    .orderBy(asc(services.sortOrder));
  return Response.json(result);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = serviceSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [service] = await db.insert(services).values(parsed.data).returning();
  return Response.json(service, { status: 201 });
}
