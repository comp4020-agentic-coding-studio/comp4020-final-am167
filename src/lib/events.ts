import type { HeardItem } from "./heard.ts";
import { sameAs } from "./listener.ts";
import { log } from "./log.ts";
import type { CollisionReport, Conjunction, SkyObject } from "./sky.ts";

// In-process pub/sub behind the SSE endpoint. One machine, so no broker needed.
// Events carry full objects; each stream decides what its viewer may see.
export type SkyEvent =
  | { type: "launch"; object: SkyObject }
  | { type: "decay"; object: SkyObject }
  // an owner brought one down or boosted it (ADR 0011): its new orbit, and
  // its operator's handle if it has one
  | { type: "manoeuvre"; manoeuvre: "deorbit" | "boost"; object: SkyObject; operator: string | null }
  | { type: "conjunction"; conjunction: Conjunction }
  | { type: "collision"; collision: CollisionReport }
  // a beacon heard over a station (ADR 0016), with whose it is, which each
  // stream turns into whether it's its viewer's
  | { type: "heard"; heard: Omit<HeardItem, "mine">; owner: string | null; operator: number | null }
  // how many people are listening now (ADR 0016)
  | { type: "audience"; listening: number };

type Listener = (event: SkyEvent) => void;

// each listener, and who it is, if it's a person with the sky open: an
// operator or a hashed cookie (heard.ts, listenerKey)
const listeners = new Map<Listener, string | null>();

// How many are listening: an open page's stream, or a test.
export const listening = () => listeners.size;

// The people listening (ADR 0016): each once, however many tabs they have
// open, and whether those tabs were opened before they signed in.
export function audience(): Set<string> {
  const people = new Set<string>();
  for (const who of listeners.values()) if (who) people.add(sameAs(who));
  return people;
}

// Everyone is told when the number of people listening changes, a moment
// after the first change (a page reloading leaves and comes back: no news),
// and at most that often while people keep coming and going.
let announced = 0;
let settling: ReturnType<typeof setTimeout> | undefined;
function recount(): void {
  if (settling) return;
  settling = setTimeout(() => {
    settling = undefined;
    const now = audience().size;
    if (now === announced) return;
    announced = now;
    publish({ type: "audience", listening: now });
  }, 1500);
  settling.unref?.();
}

export function subscribe(fn: Listener, who: string | null = null): () => void {
  listeners.set(fn, who);
  if (who) recount();
  return () => {
    const was = listeners.get(fn);
    listeners.delete(fn);
    if (was) recount();
  };
}

// What an event is about, in the record's words (ADR 0025): the object, the
// pair, the collision, or the count.
function about(event: SkyEvent): Record<string, string | number> {
  switch (event.type) {
    case "launch":
    case "decay":
      return { sat: event.object.id };
    case "manoeuvre":
      return { manoeuvre: event.manoeuvre, sat: event.object.id };
    case "conjunction":
      return { a: event.conjunction.a, b: event.conjunction.b };
    case "collision":
      return { id: event.collision.id };
    case "heard":
      return { sat: event.heard.id, station: event.heard.station };
    case "audience":
      return { listening: event.listening };
  }
}

// One broken stream mustn't stop the others hearing, or fail the launch that
// caused the event (it's already saved): drop it and carry on. Each event is
// a line in the record (ADR 0025), saying how many streams it reached.
export function publish(event: SkyEvent): void {
  let dropped = false;
  let reached = 0;
  for (const fn of [...listeners.keys()]) {
    try {
      fn(event);
      reached++;
    } catch {
      if (listeners.get(fn)) dropped = true;
      listeners.delete(fn);
    }
  }
  log("broadcast", { type: event.type, ...about(event), streams: reached });
  if (dropped) recount();
}
