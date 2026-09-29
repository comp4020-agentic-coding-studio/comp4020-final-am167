import type { APIRoute } from "astro";
import { subscribe } from "../../lib/events.ts";

export const GET: APIRoute = ({ request }) => {
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (chunk: string) => controller.enqueue(encoder.encode(chunk));
      send(": connected\n\n");
      const unsubscribe = subscribe((event) => send(`data: ${event}\n\n`));
      const ping = setInterval(() => send(": ping\n\n"), 25_000);
      cleanup = () => {
        clearInterval(ping);
        unsubscribe();
      };
      request.signal.addEventListener("abort", cleanup);
    },
    cancel: () => cleanup(),
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
};
