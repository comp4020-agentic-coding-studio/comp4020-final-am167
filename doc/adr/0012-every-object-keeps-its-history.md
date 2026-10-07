# 0012. Every object keeps its history, and a beacon is read in full once it's gone

**Status:** accepted (2026-10-07).

## Context

Advay asked for C9: click a satellite or fragment in the sky to see its
history. The record has always been kept (ADR 0003): every object, its
fate, every collision and the lineage of every fragment. But the only way
to read it is the catalogue, a table with a line of lineage per row, which
says where debris came from and nothing about what an object went on to
cause.

The app's argument (`README.md`, "What good means here") leans on Ostrom: a
commons survives when the people using it can see the state of the resource
and what each of them takes. The sky shows the state. A history is where
anyone can see what one launch took: the debris it left, and what that
debris destroyed. Kessler syndrome is a cascade, so the cost of a launch is
mostly downstream of it, and a record that only looks back hides it.

Two earlier decisions limit what a history can show. A beacon is only heard
as its satellite passes over the station, and the catalogue shows callsigns,
not beacons (`PLAN.md`, "Catalogue"), so flying low to be heard more stays
worth it. ADR 0003 left open whether a dead satellite's beacon is still
shown.

## Options

**What a history says.**

- **Where it came from.** Who launched it, when, into which band, and for a
  fragment the collision it came from and the satellites at its root. What
  `PLAN.md` first asked for; the catalogue's lineage, told at length.
- **Where it came from, and what followed.** The same, plus everything
  downstream of it: the fragments its collision left, how many are still
  up, the collisions those fragments caused and what they destroyed. And
  for something still up, when it next passes the station and when it burns
  up.

**Its beacon.**

- **Always.** Simple, but clicking any satellite would read its line, and
  passing over the station would stop mattering.
- **Never.** Keeps the station as the only place a beacon is heard, but a
  satellite's line is then lost for good once it's down, and a history of
  something that only ever said one thing leaves that thing out.
- **Once it's gone.** While a satellite flies, its history says the beacon
  is heard only over the station, and when it next passes. Once it has
  burned up, been brought down or been destroyed, the history shows the
  line in full, as an epitaph: the words left on the record of something
  that has died. Its owner always sees their own.

## Decision

**A history tells where an object came from and what followed, and a beacon
becomes readable once its satellite is gone.**

- Every object has its own page at `/object/<id>/`, server-rendered so it
  works without JavaScript and can be linked to. Clicking an object in the
  sky opens the same history in a panel over the scene; each name in the
  catalogue links to it.
- A history says: who launched it (handle, or "launched without a handle";
  derelicts are nobody's), when and into which band; any boost or deorbit
  (ADR 0011); for a fragment, the collision it came from, both beacons that
  met (the couplet, ADR 0008) and who it traces back to (ADR 0010); how it
  ended; and **what followed**: the fragments its collision left, how many
  are still up, and the collisions and losses downstream of it, worked out
  from the lineage as the blame is (not stored).
- Wording follows ADR 0010: two objects "collided", and debris "destroyed"
  what it hit. A satellite's history names what its debris went on to
  destroy, which is the blame read forwards.
- The beacon follows the rule above: withheld while the satellite flies
  (with a countdown to its next pass), shown once it's gone, and always
  shown to its owner. The page calls it "What it said", not "epitaph".

## Consequences

- The cost of a launch becomes something anyone can look up, from either
  end: from a fragment back to who made it, or from a satellite forward to
  what it did. That's the argument made concrete, one object at a time.
- The station stays the only place the app *shows* a live beacon, so "be
  seen" is unchanged. It's a rule of the game, not a secret: the sky page
  and the event stream already send every live beacon to every browser, so
  the station can show it the moment its satellite comes overhead, and
  anyone reading the page's source can see them all. The catalogue's rule
  has always been the same kind. Truly withholding beacons (sending each
  only while its satellite is overhead) would change the stream, and isn't
  worth it for a line of text that's public the moment it passes over. Dying makes a line permanent, which is a fitting irony, not an
  incentive: nobody can choose to be destroyed, since nobody aims a
  collision.
- Every beacon in a collision's couplet was already shown (ADR 0010), and
  both objects in a collision are destroyed, so the rule holds there too.
- No data model change: everything comes from rows already kept (ADR 0003,
  0008, 0011). Walking a cascade forwards reads every collision and every
  fragment once and walks them in memory, two queries however long the
  cascade, which is fine at this sky's size (a few hundred objects, a few
  collisions an hour).
- Testable over HTTP: a stranger's view of a live satellite's history (the
  page and the sky's panel) leaves its beacon out, the owner's shows it; the history of a fragment names its
  roots. The server-side tests can stage a collision and check what follows.
