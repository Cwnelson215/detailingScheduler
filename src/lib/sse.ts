import { subscribe } from "./chat-bus";

// Build an SSE Response that streams live chat messages for a booking. Used by both the
// customer and admin stream routes after they authorize the caller. Cleans up its emitter
// listener and heartbeat when the client disconnects (request.signal aborts).
export function chatStreamResponse(bookingId: number, signal: AbortSignal): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // Controller already closed (client gone mid-write) — ignore.
        }
      };

      send(": connected\n\n");

      const unsubscribe = subscribe(bookingId, (message) => {
        send(`data: ${JSON.stringify(message)}\n\n`);
      });

      // Heartbeat keeps proxies (Traefik) from idle-closing the connection.
      const heartbeat = setInterval(() => send(": ping\n\n"), 25_000);

      const cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      if (signal.aborted) cleanup();
      else signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Defensive: tell any nginx-style proxy not to buffer the stream.
      "X-Accel-Buffering": "no",
    },
  });
}
