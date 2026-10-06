import type { APIRoute } from "astro";
import { subscribe } from "../../lib/events.ts";
import type { SkyEvent } from "../../lib/events.ts";
import { conjunctions, liveSky, toPublic } from "../../lib/sky.ts";

// One stream per open page (ADR 0004). It opens with the server's time, a
// snapshot of the live sky and the collisions coming (ADR 0008), then sends
// each event as it happens.
export const GET: APIRoute = ({ request, locals }) => {
  const { person } = locals;
  // what this viewer may see of an event: objects lose their owner
  const visible = (event: SkyEvent) => {
    switch (event.type) {
      case "launch":
      case "decay":
        return toPublic(event.object, person);
      case "conjunction":
        return event.conjunction;
      case "collision":
        return {
          ...event.collision,
          objects: event.collision.objects.map((object) => toPublic(object, person)),
          fragments: event.collision.fragments.map((object) => toPublic(object, person)),
        };
    }
  };
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      // subscribe before the snapshot so nothing falls between the two (so a
      // burn-up the snapshot catches up on arrives as a decay event first)
      const unsubscribe = subscribe((event) => send(event.type, visible(event)));
      send("hello", {
        serverTime: Date.now(),
        sky: liveSky().map((object) => toPublic(object, person)),
        conjunctions: conjunctions(),
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
