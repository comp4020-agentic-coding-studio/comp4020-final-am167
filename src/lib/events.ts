import type { SkyObject } from "./sky.ts";

// In-process pub/sub behind the SSE endpoint. One machine, so no broker needed.
// Events carry the full object; each stream decides what its viewer may see.
export type SkyEvent = { type: "launch"; object: SkyObject } | { type: "decay"; object: SkyObject };

type Listener = (event: SkyEvent) => void;

const listeners = new Set<Listener>();

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
