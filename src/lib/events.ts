import type { HeardItem } from "./heard.ts";
import { sameAs } from "./listener.ts";
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

// One broken stream mustn't stop the others hearing, or fail the launch that
// caused the event (it's already saved): drop it and carry on.
export function publish(event: SkyEvent): void {
  let dropped = false;
  for (const fn of [...listeners.keys()]) {
    try {
      fn(event);
    } catch {
      if (listeners.get(fn)) dropped = true;
      listeners.delete(fn);
    }
  }
  if (dropped) recount();
}
