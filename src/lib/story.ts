// How a collision is told (ADR 0010), the same on the sky page, in the
// browser and in the catalogue: both sides named and neither singled out,
// debris passing the blame back to the satellites it came from, and the two
// beacons side by side. Shared by the server render and the browser, so it
// holds wording only.

type Kind = "satellite" | "derelict" | "debris";

export interface StoryRoot {
  id: number;
  kind: Kind;
  callsign: string | null;
  operator: string | null;
}

// one of the two objects that met (sky.ts's Party)
export interface StoryParty extends StoryRoot {
  beacon: string | null;
  // for debris, the satellites and derelicts at the root of its collision
  from: StoryRoot[] | null;
}

// "ALPHA", or "a derelict" for a dead satellite nobody launched here.
const nameOf = (o: { kind: Kind; callsign: string | null }) =>
  o.kind === "derelict" || !o.callsign ? "a derelict" : o.callsign;

// "ALPHA and BRAVO", "ALPHA, BRAVO and a derelict"
const listed = (names: string[]) =>
  names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

// "ALPHA and BRAVO's collision": where debris came from
export const collisionOf = (roots: readonly StoryRoot[]) => `${listed(roots.map(nameOf))}'s collision`;

// "debris from ALPHA and BRAVO's collision"
const debrisPhrase = (party: Pick<StoryParty, "from">) =>
  party.from && party.from.length > 0 ? `debris from ${collisionOf(party.from)}` : "debris";

// "ALPHA", "a derelict", "debris from ALPHA and BRAVO's collision"
export const describe = (party: Pick<StoryParty, "kind" | "callsign" | "from">) =>
  party.kind === "debris" ? debrisPhrase(party) : nameOf(party);
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

// "ALPHA and BRAVO collided": never "A hit B", since nobody aims at a
// collision. Debris that hits a satellite destroyed it: the blame is the
// debris's makers', not the satellite's.
export function headline([a, b]: readonly [StoryParty, StoryParty]): string {
  const [debris, other] = a.kind === "debris" ? [a, b] : [b, a];
  if (debris.kind === "debris" && other.kind !== "debris") {
    return `${capital(debrisPhrase(debris))} destroyed ${nameOf(other)}`;
  }
  return `${capital(describe(a))} and ${describe(b)} collided`;
}

// "ALPHA: unclaimed operator. BRAVO: skywriter." Everyone the collision
// traces back to, debris resolved to its roots, each once.
export function blame(parties: readonly [StoryParty, StoryParty]): string {
  const named = new Map<number, StoryRoot>();
  for (const party of parties) {
    for (const root of party.kind === "debris" ? (party.from ?? []) : [party]) named.set(root.id, root);
  }
  const lines = [...named.values()].map((root) =>
    root.kind === "derelict" || !root.callsign
      ? "The derelict was nobody's."
      : `${root.callsign}: ${root.operator ?? "unclaimed operator"}.`,
  );
  // nobody's derelicts said once, after the people
  const nobody = lines.filter((line) => line.startsWith("The derelict"));
  return [...lines.filter((line) => !line.startsWith("The derelict")), ...nobody.slice(0, 1)].join(" ");
}

// The two beacons that met, side by side (debris and derelicts are silent).
export function couplet(parties: readonly [StoryParty, StoryParty]): { callsign: string; beacon: string }[] {
  return parties.flatMap((p) => (p.kind === "satellite" && p.callsign && p.beacon ? [{ callsign: p.callsign, beacon: p.beacon }] : []));
}

// "2 satellites, 1 derelict and 1 fragment in orbit"
export function skyCount(sky: readonly { kind: Kind }[]): string {
  const n = (kind: Kind) => sky.filter((o) => o.kind === kind).length;
  const parts = (
    [
      [n("satellite"), "satellite"],
      [n("derelict"), "derelict"],
      [n("debris"), "fragment"],
    ] as const
  )
    .filter(([count]) => count > 0)
    .map(([count, word]) => `${count} ${word}${count === 1 ? "" : "s"}`);
  return parts.length === 0 ? "Nothing in orbit" : `${listed(parts)} in orbit`;
}
