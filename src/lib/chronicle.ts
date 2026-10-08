import { ago } from "./format.ts";
import { BANDS, bandAt, radiusAt, type Band } from "./orbit.ts";
import type { History, Party, Root, Step } from "./sky.ts";
import { sharedQuestion, spelled, type StoryParty } from "./story.ts";
import { JOIN, lineOf, tornFrom, type Torn, type WreckPiece } from "./wreck.ts";

// An object's card, told plainly (ADR 0012; rewritten 2026-10-08, after
// Advay found the old card unreadable): what it is in one line, then what
// happened to it, a moment at a time and oldest first, so a cascade reads as
// the steps it was, never as one made-up collision of everything in it.
// Every name a reader meets is said once with what it is ("BRAVO was
// launched by bravo_ops", "a derelict is a dead satellite nobody owns"),
// and no "it" or "the derelict" can be read as the wrong thing. Wording
// only: src/components/ObjectHistory.astro lays it out.

// A piece of a sentence: text, a name (bold, linked to its card when it has
// one), a link, someone's line (quoted), or a moment ("3 h ago").
export type Bit = string | { name: string; href?: string } | { link: string; href: string } | { quote: string } | { at: number };
export type Line = Bit[];

// a line as text: for tests, and for anything that can't take markup
export const plain = (line: Line, now: number): string =>
  line
    .map((bit) =>
      typeof bit === "string"
        ? bit
        : "name" in bit
          ? bit.name
          : "link" in bit
            ? bit.link
            : "quote" in bit
              ? `“${bit.quote}”`
              : ago(now - bit.at),
    )
    .join("");

// One thing that happened to it: when (null for now, or for the folded
// middle of a long cascade), what, and what's worth knowing about it.
// "this" is the moment a fragment broke off; "gap" is the fold.
export interface Moment {
  at: number | null;
  kind: "past" | "this" | "now" | "gap";
  lines: Line[];
  // the pieces a collision left that carry words, each a fragment's card
  wreck: WreckPiece[];
}

// What the telling has said so far, so it can say "another derelict", and
// explain derelicts and the join between two lines' pieces only once.
interface Told {
  derelicts: number;
  glossed: boolean;
  joined: boolean;
}

type Named = Pick<Party, "id" | "kind" | "callsign">;
const card = (id: number) => `/object/${id}/`;
const band = (b: Band) => BANDS[b].label.toLowerCase();
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// a line said in full, with its full stop unless it brings its own
const quoted = (text: string): Bit[] => [{ quote: text }, /[.!?…]["'”’)]*$/.test(text) ? "" : "."];

// "ALPHA", "a satellite", "a derelict" ("another derelict" once one has
// been named), "debris": linked to its card
function nameOf(o: Named, told?: Told): Bit {
  if (o.kind === "satellite") return { name: o.callsign ?? "a satellite", href: card(o.id) };
  if (o.kind === "debris") return { name: "debris", href: card(o.id) };
  const word = told && told.derelicts > 0 ? "another derelict" : "a derelict";
  if (told) told.derelicts++;
  return { name: word, href: card(o.id) };
}

function capitalised(bits: Bit[]): Bit[] {
  const [first, ...rest] = bits;
  if (typeof first === "string") return [capital(first), ...rest];
  if (first && "name" in first) return [{ ...first, name: capital(first.name) }, ...rest];
  return bits;
}

// "A and B", "A, B and C", as bits
function listed(bits: Bit[]): Bit[] {
  return bits.flatMap((bit, i) => (i === 0 ? [bit] : [i === bits.length - 1 ? " and " : ", ", bit]));
}

// what a step tells of each side: debris first (what hit), then people's
// satellites, then derelicts
const rank = { debris: 0, satellite: 1, derelict: 2 } as const;
const ordered = <T extends { kind: Party["kind"] }>(both: readonly T[]): T[] => [...both].sort((a, b) => rank[a.kind] - rank[b.kind]);

// "ALPHA and BRAVO", "MOTH and a derelict", "two derelicts"
function pairOf(both: readonly Named[], told?: Told): Bit[] {
  if (both.length === 2 && both.every((o) => o.kind === "derelict")) {
    const other = told !== undefined && told.derelicts > 0;
    if (told) told.derelicts += 2;
    return [other ? "two other derelicts" : "two derelicts"];
  }
  return listed(ordered(both).map((o) => nameOf(o, told)));
}

const launchedBy = (operator: string | null): Bit[] =>
  operator ? ["launched by ", { name: operator }] : ["launched without a handle"];

// What to know about each side of a collision a reader hasn't met yet: what
// debris was carrying, who launched a satellite and what it said, what a
// derelict was carrying (and, the first time, what a derelict is). `other`:
// the other side of the object's own collision, so a derelict is "the other
// derelict", never one that could be the object itself.
function introduce(parties: readonly Party[], told: Told, other = false): Line[] {
  const lines: Line[] = [];
  for (const p of ordered(parties)) {
    if (p.kind === "debris" && p.words) lines.push(["The debris was carrying ", ...quoted(p.words)]);
    if (p.kind === "satellite") {
      lines.push([...capitalised([nameOf(p)]), " was ", ...launchedBy(p.operator), ".", ...(p.beacon ? [" Its beacon said ", ...quoted(p.beacon)] : [])]);
    }
  }
  const derelicts = parties.filter((p) => p.kind === "derelict");
  if (derelicts.length > 0) {
    const gloss = told.glossed ? null : derelicts.length > 1 ? "Derelicts are dead satellites nobody owns." : "A derelict is a dead satellite nobody owns.";
    told.glossed = true;
    const echoes = derelicts
      .filter((p) => p.words)
      .map((p, i): Line => {
        const who = derelicts.length > 1 ? (i === 0 ? "One" : "The other") : gloss ? "This one" : other ? "The other derelict" : "That derelict";
        return [`${who} was carrying ${p.echoOf ?? "a gone satellite"}'s last words: `, ...quoted(p.words!)];
      });
    if (gloss) lines.push([gloss, ...(echoes.length > 0 ? [" ", ...echoes.shift()!] : [])]);
    lines.push(...echoes);
  }
  const both = parties.length === 2 && sharedQuestion(parties as [StoryParty, StoryParty]);
  if (both) lines.push(["Both were answering the stations' question ", ...quoted(both)]);
  return lines;
}

// One collision in a fragment's lineage: "ALPHA and BRAVO collided", or
// "Debris from that collision hit CHARLIE and destroyed it". `previous`:
// the step told just before it, if any.
function stepOf(step: Step, previous: Step | undefined, told: Told): Moment {
  const i = step.parties.findIndex((p) => p.kind === "debris");
  let headline: Line;
  if (i === -1) {
    headline = [...capitalised(pairOf(step.parties, told)), " collided."];
  } else {
    const from = step.sources[i] !== null && step.sources[i] === previous?.collision ? "that collision" : "an earlier collision";
    headline = [{ link: "Debris", href: card(step.parties[i].id) }, ` from ${from} hit `, nameOf(step.parties[1 - i], told), " and destroyed it."];
  }
  return { at: step.at, kind: "past", lines: [headline, ...introduce(step.parties, told)], wreck: [] };
}

// the object itself, as a side of a collision
const selfOf = (h: History): Party => ({
  id: h.id,
  kind: h.kind,
  callsign: h.callsign,
  beacon: h.beacon,
  words: h.words,
  question: h.question,
  echoOf: h.echoOf?.callsign ?? null,
  operator: h.handle,
  from: h.origin?.roots ?? null,
});

// names from a lineage's roots: people's satellites, then the derelicts
// counted ("ALPHA, BRAVO and two derelicts")
function tracedNames(roots: readonly Root[]): Bit[] {
  const people = roots.filter((r) => r.kind === "satellite").map((r) => nameOf(r));
  const dead = roots.filter((r) => r.kind === "derelict").length;
  return listed([...people, ...(dead === 0 ? [] : [dead === 1 ? "a derelict" : `${spelled(dead)} derelicts`])]);
}

// How it was destroyed, from its own side, and what its collision left.
function endOf(h: History, told: Told): Moment {
  const end = h.end!;
  const other = end.with;
  const lines: Line[] = [];
  if (h.kind !== "debris" && other.kind === "debris") {
    lines.push(["Hit by ", { link: "debris", href: card(other.id) }, " and destroyed."]);
    if (other.from && other.from.length > 0) lines.push(["The debris traces back to ", ...tracedNames(other.from), "."]);
    if (other.words) lines.push(["The debris was carrying ", ...quoted(other.words)]);
  } else if (h.kind === "debris" && other.kind === "debris") {
    lines.push(["It collided with ", { link: "another fragment", href: card(other.id) }, ". Both were pulverised: debris that hits debris leaves nothing."]);
  } else {
    lines.push(
      h.kind === "debris"
        ? ["It hit ", nameOf(other, told), " and destroyed it."]
        : ["It collided with ", nameOf(other, told), ". Both were destroyed."],
    );
    lines.push(...introduce([other], told, true));
    const both = sharedQuestion([selfOf(h), other]);
    if (both) lines.push(["Both were answering the stations' question ", ...quoted(both)]);
  }

  const left = h.followed.left;
  const carrying = end.wreck.length;
  if (left > 0) {
    // the first time a "…" shows, say what it is
    const join = !told.joined && end.wreck.some((piece) => piece.words.includes(JOIN.trim()));
    if (join) told.joined = true;
    const words =
      carrying === left ? (left === 1 ? "The words it carries" : "The words they carry") : `${carrying} ${carrying === 1 ? "carries" : "carry"} words`;
    lines.push(
      carrying === 0
        ? [`The collision left ${plural(left, "fragment")}, carrying no words.`]
        : [`The collision left ${plural(left, "fragment")}${carrying === left ? ". " : "; "}${words}${join ? " (a “…” joins pieces of the two lines)" : ""}:`],
    );
  }
  return { at: end.at, kind: "past", lines, wreck: end.wreck };
}

// a long cascade's story: where it began, the middle folded, the last few
// steps; never one step folded on its own
const FIRST = 1;
const LAST = 3;

// Everything that happened to it, oldest first, ending with now while it's up.
export function momentsOf(h: History): Moment[] {
  const told: Told = {
    derelicts: h.kind === "derelict" ? 1 : 0,
    glossed: h.kind === "derelict",
    joined: h.kind === "debris" && (h.words ?? "").includes(JOIN.trim()),
  };
  const moments: Moment[] = [];
  const past = (at: number, ...lines: Line[]) => moments.push({ at, kind: "past", lines, wreck: [] });

  if (h.kind === "satellite") {
    past(h.launchedAt, h.handle ? ["Launched into the ", band(h.band), " band by ", { name: h.handle }, "."] : [`Launched into the ${band(h.band)} band, without a handle.`]);
  } else if (h.kind === "derelict") {
    past(h.launchedAt, [`Appeared in the ${band(h.band)} band. The sky keeps a few derelicts, so it's never empty.`]);
  } else {
    const steps = h.ancestry;
    const fold = steps.length > FIRST + LAST + 1;
    const shown = fold ? [...steps.slice(0, FIRST), null, ...steps.slice(-LAST)] : steps;
    let previous: Step | undefined;
    for (const step of shown) {
      if (step === null) {
        moments.push({ at: null, kind: "gap", lines: [[`Then ${steps.length - FIRST - LAST} more collisions in the chain.`]], wreck: [] });
        previous = undefined;
        continue;
      }
      moments.push(stepOf(step, previous, told));
      previous = step;
    }
    const left = h.origin?.left ?? 0;
    moments.push({
      at: h.launchedAt,
      kind: "this",
      lines: [[left > 1 ? `This fragment broke off, one of ${left}.` : "This fragment broke off, the only piece."]],
      wreck: [],
    });
  }

  for (const m of h.manoeuvres) {
    past(m.at, m.kind === "boost" ? [`Boosted to the ${band(m.to)} band by its operator.`] : ["Its operator began bringing it down, to keep the sky clear."]);
  }

  if (h.fate === "decayed" && h.fateAt !== null) past(h.fateAt, ["Its orbit decayed and it burned up on re-entry."]);
  if (h.fate === "deorbited" && h.fateAt !== null) past(h.fateAt, ["It burned up on re-entry. The sky is a little clearer for it."]);
  if (h.end) moments.push(endOf(h, told));
  if (h.fate === "live") {
    moments.push({
      at: null,
      kind: "now",
      lines: [[h.deorbitedAt !== null ? "Coming down, to burn up on re-entry." : "Still in orbit."]],
      wreck: [],
    });
  }
  return moments;
}

// What it is, in a line, and how it ended if it's gone (while it's up, the
// card's chips say so).
export function summaryOf(h: History): Line {
  let start: Line;
  if (h.kind === "satellite") {
    start = [...(h.handle ? ["Launched by ", { name: h.handle }] : ["Launched without a handle"]), " ", { at: h.launchedAt }, "."];
  } else if (h.kind === "derelict") {
    start = ["Appeared ", { at: h.launchedAt }, "."];
  } else if (h.origin) {
    const breakers = h.origin.parties.filter((p) => p.kind !== "debris");
    start =
      breakers.length === 2
        ? ["A piece of ", ...pairOf(breakers), ", broken off when they collided ", { at: h.origin.at }, "."]
        : breakers.length === 1
          ? ["A piece of ", nameOf(breakers[0]), ", broken off when debris destroyed it ", { at: h.origin.at }, "."]
          : ["A piece of debris, from a collision ", { at: h.origin.at }, "."];
  } else {
    start = ["A piece of debris."];
  }

  const ended = ((): Line => {
    if (h.fate === "decayed" && h.fateAt !== null) return ["Burned up ", { at: h.fateAt }, "."];
    if (h.fate === "deorbited" && h.fateAt !== null) return ["Brought down by its operator ", { at: h.fateAt }, "."];
    if (h.end && h.fate === "destroyed") {
      const other = h.end.with;
      if (h.kind === "debris") {
        return other.kind === "debris" ? ["Pulverised in a collision ", { at: h.end.at }, "."] : ["It went on to destroy ", nameOf(other), " ", { at: h.end.at }, "."];
      }
      // on a derelict's own card, the one it met is "another derelict"
      const named = nameOf(other, { derelicts: h.kind === "derelict" ? 1 : 0, glossed: true, joined: true });
      return other.kind === "debris" ? ["Destroyed by debris ", { at: h.end.at }, "."] : ["Destroyed when it collided with ", named, " ", { at: h.end.at }, "."];
    }
    return [];
  })();
  return [...start, ...(ended.length > 0 ? [" ", ...ended] : [])];
}

// The band it's in now: a boost or the fall can have moved it since launch.
export const bandNow = (h: History, now: number): Band => (h.orbit ? bandAt(radiusAt(h.orbit, now)) : h.band);

// Where a fragment's words were torn from: each line of the collision that
// made it, with the words it carries marked, in the order it says them.
export function tornFromOf(h: History): { label: Line; tokens: Torn }[] {
  if (!h.words || !h.origin) return [];
  const parties = h.origin.parties;
  const [a, b] = parties.map((p) => ({ id: p.id, text: lineOf(p) }));
  return tornFrom(a, b, h.origin.left, h.origin.index, h.words).map(({ side, tokens }) => {
    const p = parties[side];
    const label: Line =
      p.kind === "satellite"
        ? [nameOf(p), "'s beacon"]
        : p.kind === "derelict"
          ? [`${p.echoOf ?? "a gone satellite"}'s last words, carried by a derelict`]
          : ["what the ", { link: "debris", href: card(p.id) }, " was carrying"];
    return { label, tokens };
  });
}

// Who a lineage traces back to, oldest first, each said plainly: a
// satellite and whose it was, the derelicts counted together as nobody's.
export function tracedTo(h: History): { name: string; whose: string }[] {
  const seen = new Map<number, Root>();
  const roots = h.ancestry.length > 0 ? h.ancestry.flatMap((step) => ordered(step.parties)) : (h.origin?.roots ?? []);
  for (const root of roots) if (root.kind !== "debris" && !seen.has(root.id)) seen.set(root.id, root);
  const people = [...seen.values()]
    .filter((r) => r.kind === "satellite")
    .map((r) => ({ name: r.callsign ?? "A satellite", whose: r.operator ? `launched by ${r.operator}` : "launched without a handle" }));
  const dead = [...seen.values()].filter((r) => r.kind === "derelict").length;
  return [...people, ...(dead === 0 ? [] : [{ name: dead === 1 ? "A derelict" : `${capital(spelled(dead))} derelicts`, whose: "nobody's" }])];
}
