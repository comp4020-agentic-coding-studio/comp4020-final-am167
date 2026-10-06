import type { APIRoute } from "astro";
import { subscribe } from "../../lib/events.ts";
import { liveSky, toPublic } from "../../lib/sky.ts";

// One stream per open page (ADR 0004). It opens with the server's time and a
// snapshot of the live sky, then sends each event as it happens.
export const GET: APIRoute = ({ request, locals }) => {
  const { person } = locals;
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      // subscribe before the snapshot so nothing falls between the two (so a
      // burn-up the snapshot catches up on arrives as a decay event first)
      const unsubscribe = subscribe((event) => send(event.type, toPublic(event.object, person)));
      send("hello", {
        serverTime: Date.now(),
        sky: liveSky().map((object) => toPublic(object, person)),
      });
      const ping = setInterval(() => controller.enqueue(encoder.encode(": ping\n\n")), 25_000);
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
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // stop proxies holding events back
      "X-Accel-Buffering": "no",
    },
  });
};
