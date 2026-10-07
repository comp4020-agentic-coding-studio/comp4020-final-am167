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
  | { type: "collision"; collision: CollisionReport };

type Listener = (event: SkyEvent) => void;

const listeners = new Set<Listener>();

// How many are listening: an open page's stream, or a test.
export const listening = () => listeners.size;

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// One broken stream mustn't stop the others hearing, or fail the launch that
// caused the event (it's already saved): drop it and carry on.
export function publish(event: SkyEvent): void {
  for (const fn of listeners) {
    try {
      fn(event);
    } catch {
      listeners.delete(fn);
    }
  }
}
