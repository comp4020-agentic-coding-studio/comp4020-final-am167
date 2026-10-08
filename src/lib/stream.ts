import type { SkyEvent } from "./events.ts";
import { isOwnedBy, toPublic, type Viewer } from "./sky.ts";

// What one viewer's stream may see of an event (ADR 0004, 0009): objects
// lose their owner and operator, and say only whether they're the viewer's;
// a beacon heard (ADR 0016) likewise.
export function forViewer(event: SkyEvent, viewer: Viewer): unknown {
  switch (event.type) {
    case "launch":
    case "decay":
      return toPublic(event.object, viewer);
    case "manoeuvre":
      return { ...event, object: toPublic(event.object, viewer) };
    case "conjunction":
      return event.conjunction;
    case "collision":
      return {
        ...event.collision,
        objects: event.collision.objects.map((object) => toPublic(object, viewer)),
        fragments: event.collision.fragments.map((object) => toPublic(object, viewer)),
      };
    case "heard":
      return { ...event.heard, mine: isOwnedBy(event, viewer) };
    case "audience":
      return { listening: event.listening };
  }
}
