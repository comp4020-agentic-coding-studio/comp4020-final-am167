// In-process pub/sub behind the SSE endpoint. One machine, so no broker needed.
type Listener = (event: string) => void;

const listeners = new Set<Listener>();

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function publish(event: string): void {
  for (const fn of listeners) fn(event);
}
