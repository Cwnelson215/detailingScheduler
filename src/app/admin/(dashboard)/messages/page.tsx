import Link from "next/link";
import { db } from "@/db";
import { bookingMessages, bookings } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { decryptMessage } from "@/lib/crypto";
import { formatJobId } from "@/lib/job-id";

export const dynamic = "force-dynamic";

type Conversation = {
  bookingId: number;
  jobId: string;
  customerName: string;
  lastBody: string;
  lastAt: Date;
  unread: number;
};

export default async function AdminMessagesPage() {
  // Pull every message with its booking's identity, oldest-first, then fold into one row
  // per conversation in JS (volume is small for a single-shop booking site).
  const rows = await db
    .select({
      bookingId: bookingMessages.bookingId,
      sender: bookingMessages.sender,
      ciphertext: bookingMessages.ciphertext,
      iv: bookingMessages.iv,
      authTag: bookingMessages.authTag,
      readAt: bookingMessages.readAt,
      createdAt: bookingMessages.createdAt,
      jobId: bookings.jobId,
      customerName: bookings.customerName,
    })
    .from(bookingMessages)
    .innerJoin(bookings, eq(bookingMessages.bookingId, bookings.id))
    .orderBy(asc(bookingMessages.createdAt));

  const byBooking = new Map<number, Conversation>();
  for (const r of rows) {
    const convo: Conversation = byBooking.get(r.bookingId) ?? {
      bookingId: r.bookingId,
      jobId: r.jobId ?? "",
      customerName: r.customerName,
      lastBody: "",
      lastAt: r.createdAt,
      unread: 0,
    };
    // rows are ascending, so the last seen becomes the latest.
    try {
      convo.lastBody = decryptMessage({ ciphertext: r.ciphertext, iv: r.iv, authTag: r.authTag });
    } catch {
      convo.lastBody = "[unable to decrypt]";
    }
    convo.lastAt = r.createdAt;
    if (r.sender === "customer" && r.readAt === null) convo.unread += 1;
    byBooking.set(r.bookingId, convo);
  }

  const conversations = [...byBooking.values()].sort(
    (a, b) => b.lastAt.getTime() - a.lastAt.getTime(),
  );

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Messages</h1>
      {conversations.length === 0 ? (
        <p className="text-muted-foreground">No conversations yet.</p>
      ) : (
        <div className="space-y-3">
          {conversations.map((c) => (
            <Link key={c.bookingId} href={`/admin/messages/${c.bookingId}`}>
              <Card className="transition-colors hover:bg-muted/50">
                <CardContent className="flex items-center justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{c.customerName}</span>
                      <span className="text-xs text-muted-foreground">
                        #{c.bookingId} · {formatJobId(c.jobId)}
                      </span>
                      {c.unread > 0 && <Badge>{c.unread} new</Badge>}
                    </div>
                    <p className="mt-1 truncate text-sm text-muted-foreground">{c.lastBody}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {c.lastAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
