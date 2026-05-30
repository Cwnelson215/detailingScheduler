import { db } from "@/db";
import { bookingMessages } from "@/db/schema";
import { and, asc, eq, isNull } from "drizzle-orm";
import { encryptMessage, decryptMessage } from "./crypto";
import { publishMessage, type ChatMessage } from "./chat-bus";

export type Sender = "customer" | "owner";

// Encrypt + persist a message, then publish the decrypted form to live subscribers.
// Returns the public (decrypted) shape for the HTTP response. Email notification is the
// caller's responsibility (it differs between customer and owner sends).
export async function createMessage(
  bookingId: number,
  sender: Sender,
  body: string,
): Promise<ChatMessage> {
  const sealed = encryptMessage(body);
  const [row] = await db
    .insert(bookingMessages)
    .values({
      bookingId,
      sender,
      ciphertext: sealed.ciphertext,
      iv: sealed.iv,
      authTag: sealed.authTag,
    })
    .returning();

  const message: ChatMessage = {
    id: row.id,
    bookingId,
    sender,
    body,
    createdAt: row.createdAt.toISOString(),
  };
  publishMessage(message);
  return message;
}

// Full decrypted thread for a booking, oldest first. A row that fails to decrypt (wrong /
// rotated key, corruption) degrades to a placeholder so one bad row never breaks the view.
export async function loadHistory(bookingId: number): Promise<ChatMessage[]> {
  const rows = await db
    .select()
    .from(bookingMessages)
    .where(eq(bookingMessages.bookingId, bookingId))
    .orderBy(asc(bookingMessages.createdAt));

  return rows.map((r) => {
    let body: string;
    try {
      body = decryptMessage({ ciphertext: r.ciphertext, iv: r.iv, authTag: r.authTag });
    } catch {
      body = "[unable to decrypt]";
    }
    return {
      id: r.id,
      bookingId,
      sender: r.sender as Sender,
      body,
      createdAt: r.createdAt.toISOString(),
    };
  });
}

// Mark the other party's unread messages as read (customer reading owner's, or vice versa).
export async function markRead(bookingId: number, senderToMark: Sender): Promise<void> {
  await db
    .update(bookingMessages)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(bookingMessages.bookingId, bookingId),
        eq(bookingMessages.sender, senderToMark),
        isNull(bookingMessages.readAt),
      ),
    );
}
