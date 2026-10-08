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
  // the stations' question it was answering, if any (ADR 0018)
  question?: string | null;
  // a derelict's echo (in `words`): whose last words they were
  echoOf?: string | null;
  // for debris, what it was carrying (ADR 0017)
  words?: string | null;
  // for debris, the satellites and derelicts at the root of its collision
  from: StoryRoot[] | null;
}

// "ALPHA", or "a derelict" for a dead satellite nobody launched here.
const nameOf = (o: { kind: Kind; callsign: string | null }) =>
  o.kind === "derelict" || !o.callsign ? "a derelict" : o.callsign;

// "ALPHA and BRAVO", "ALPHA, BRAVO and a derelict"
const listed = (names: string[]) =>
  names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

// "two", "nine", "12": small counts spelled out, as a sentence says them
export const spelled = (n: number) =>
  ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"][n] ?? String(n);

// "ALPHA and BRAVO's collision": where debris came from. Two roots are one
// collision. Three or more are a chain of collisions (debris that hits
// debris leaves nothing, so each step adds a satellite or derelict), told
// as one ("a chain of collisions involving ALPHA, BRAVO and CHARLIE"), never
// as a collision of all three, which didn't happen (2026-10-08). Three
// people are named, then "two others", and the derelicts counted together
// at the end ("and two derelicts"), never one by one.
export function collisionOf(roots: readonly StoryRoot[]): string {
  const people = roots.filter((root) => root.kind !== "derelict" && root.callsign).map((root) => root.callsign!);
  const dead = roots.length - people.length;
  const rest = people.length - 3;
  const parts = [
    ...people.slice(0, 3),
    ...(rest > 0 ? [`${spelled(rest)} ${rest === 1 ? "other" : "others"}`] : []),
    ...(dead > 0 ? [dead === 1 ? "a derelict" : `${spelled(dead)} derelicts`] : []),
  ];
  if (roots.length > 2) return `a chain of collisions involving ${listed(parts)}`;
  // "two derelicts'", but "ATLAS's"
  return `${listed(parts)}${dead > 1 ? "'" : "'s"} collision`;
}

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

// "ALPHA: launched without a handle. BRAVO: skywriter." Everyone the
// collision traces back to, debris resolved to its roots, each once, and the
// derelicts, which nobody launched, said once at the end. Sorted by what each
// object is, never by its text, so no callsign can pass for a derelict.
export function blame(parties: readonly [StoryParty, StoryParty]): string {
  const named = new Map<number, StoryRoot>();
  for (const party of parties) {
    for (const root of party.kind === "debris" ? (party.from ?? []) : [party]) named.set(root.id, root);
  }
  const roots = [...named.values()];
  const people = roots
    .filter((root) => root.kind === "satellite")
    .map((root) => `${root.callsign ?? "A satellite"}: ${root.operator ?? "launched without a handle"}.`);
  const derelicts = roots.filter((root) => root.kind === "derelict").length;
  const nobody =
    derelicts === 0 ? [] : [derelicts === 1 ? "The derelict was nobody's." : "The derelicts were nobody's."];
  return [...people, ...nobody].join(" ");
}

// "ALPHA", "Derelict no. 12", "Fragment no. 40": what an object's history
// is called (ADR 0012). Only people's satellites have names.
export const titleOf = (o: { id: number; kind: Kind; callsign: string | null }) =>
  o.kind === "satellite" && o.callsign ? o.callsign : `${o.kind === "debris" ? "Fragment" : "Derelict"} no. ${o.id}`;

// The two lines that met, side by side: a satellite's beacon, or the echo
// a derelict was carrying, an old line from the record (debris says its
// piece elsewhere).
export function couplet(parties: readonly [StoryParty, StoryParty]): { callsign: string; beacon: string }[] {
  return parties.flatMap((p) => {
    if (p.kind === "satellite" && p.callsign && p.beacon) return [{ callsign: p.callsign, beacon: p.beacon }];
    if (p.kind === "derelict" && p.words) return [{ callsign: `a derelict, echoing ${p.echoOf ?? "an old line"}`, beacon: p.words }];
    return [];
  });
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

// "Heard by 7 people", "Heard by nobody else yet": a beacon's audience (ADR
// 0016). Its owner isn't counted, so their own says "else".
export function heardBy(n: number, mine: boolean): string {
  if (n === 0) return mine ? "Heard by nobody else yet" : "Heard by nobody yet";
  return `Heard by ${n} ${n === 1 ? "person" : "people"}`;
}

// "1 pass", "12 passes": how often the stations have heard it.
export const passes = (n: number) => `${n} ${n === 1 ? "pass" : "passes"}`;

// "You and 2 others listening": who has the sky open now, the viewer
// among them.
export function listeningNow(n: number): string {
  if (n <= 1) return "Just you, listening";
  return `You and ${n - 1} ${n === 2 ? "other" : "others"} listening`;
}

// "from ALPHA and BRAVO's collision": where a fragment's static comes from
// (ADR 0017), or plain "from a collision" when its roots aren't known.
export const staticFrom = (from: readonly StoryRoot[] | null) =>
  from && from.length > 0 ? `from ${collisionOf(from)}` : "from a collision";

// The question both were answering, if they were answering the same one
// (ADR 0018): two answers that collide.
export function sharedQuestion(parties: readonly [StoryParty, StoryParty]): string | null {
  const [a, b] = parties;
  return a.question && a.question === b.question ? a.question : null;
}
