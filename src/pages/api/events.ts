import type { APIRoute } from "astro";
import { audience, subscribe } from "../../lib/events.ts";
import type { SkyEvent } from "../../lib/events.ts";
import { HEARD_FEED, heardCounts, listenerFor, recentlyHeard, startListening } from "../../lib/heard.ts";
import { clip, inThisRequest, log, whoIs } from "../../lib/log.ts";
import { conjunctions, liveSky, recentCollisions, toPublic, watcherArrived } from "../../lib/sky.ts";
import { forViewer } from "../../lib/stream.ts";

// One stream per open page (ADR 0004). It opens with the server's time, a
// snapshot of the live sky and the collisions coming (ADR 0008), what the
// stations have heard and how many are listening (ADR 0016), then sends
// each event as it happens. An open stream is someone listening: the
// server's ear starts with the first. Each one opening and closing is a line
// in the record (ADR 0023), so someone who only comes back to listen is seen.
export const GET: APIRoute = ({ request, locals }) => {
  const viewer = { person: locals.person, operator: locals.operator?.id ?? null };
  // what this viewer may see of an event: objects lose their owner
  const visible = (event: SkyEvent) => forViewer(event, viewer);
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      // subscribe before the snapshot so nothing falls between the two, but
      // hold what the snapshot itself sets off (a burn-up it catches up on, a
      // collision staged for this viewer) until after it: hello comes first
      let held: SkyEvent[] | null = [];
      // a stream from a browser that has loaded nothing here (a script, or a
      // made-up cookie) hears everything but isn't counted as listening
      // (ADR 0016)
      const listener = listenerFor(locals);
      const unsubscribe = subscribe((event) => (held ? held.push(event) : send(event.type, visible(event))), listener);
      const who = whoIs(locals.person, locals.operator?.handle ?? null);
      const opened = Date.now();
      // which page it's on, if the browser says (and says it sensibly)
      const from = request.headers.get("referer") ?? "";
      log("listen-open", {
        who,
        counted: listener ? "yes" : "no",
        listening: audience().size,
        page: URL.canParse(from) ? clip(new URL(from).pathname, 80) : null,
      });
      watcherArrived();
      startListening();
      const sky = liveSky();
      send("hello", {
        serverTime: Date.now(),
        sky: sky.map((object) => toPublic(object, viewer)),
        conjunctions: conjunctions(),
        // what a page that was away (asleep, offline) missed
        collisions: recentCollisions(5),
        heard: recentlyHeard(HEARD_FEED, viewer),
        heardBy: heardCounts(sky.map((object) => object.id)),
        listening: audience().size,
      });
      for (const event of held) send(event.type, visible(event));
      held = null;
      const ping = setInterval(() => controller.enqueue(encoder.encode(": ping\n\n")), 25_000);
      let closed = false;
      // its closing is tagged with the stream's own request (ADR 0024)
      cleanup = inThisRequest(() => {
        if (closed) return;
        closed = true;
        clearInterval(ping);
        unsubscribe();
        log("listen-close", { who, after: `${Math.round((Date.now() - opened) / 1000)}s`, listening: audience().size });
      });
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
