# 0003. The sky decays, the record stays

**Status:** accepted (2026-10-03)

## Context

The brief requires data to survive sessions, restarts and redeploys, and asks
for deliberate decisions about what expires and what history is kept.

In Kessler, objects leave the sky in four ways: orbital decay, deorbiting by
the owner, destruction in a collision, and (for debris) decay. The app's
argument is about consequences: who launched what, which collision made which
fragment, and who that fragment later hit. The sky is meant to heal slowly
(see `PLAN.md`: no reset, orbital decay at rates set by altitude).

The Fly machine stops when idle, so the sky must also move on correctly while
nobody is watching (ADR 0001).

## Options

- **The sky decays, the record stays.** Objects leave the sky, but every
  object's row is kept forever as a public catalogue: launch, beacon, fate and
  lineage. The sky heals and the history doesn't. Beacon text is kept forever,
  so it needs a rule.
- **Only what's still up.** A decayed or deorbited object is deleted, beacon
  and all. The sky truly forgets; simple and private. No lineage, no blame,
  and the C10 logs have to carry all the history.
- **The live sky plus counts.** Live objects persist; afterwards only anonymous
  totals are kept. A middle ground on privacy, but it loses "who caused this",
  which is most of the argument.

## Decision

**Objects leave the sky; their records never leave the database.**

- Every object (satellite or debris) is one row, kept forever, with: id, kind,
  orbit (elements plus epoch), owner cookie (satellites only), callsign,
  beacon, launch time, **fate** (`live`, `decayed`, `deorbited`, `destroyed`)
  and when that fate happened, and for debris the **collision it came from**.
- Each collision is its own row: when, and the two objects involved.
- The sky is the set of rows whose fate is `live`; the catalogue is all rows.
- The server stores the **simulation clock**: the last time it has simulated up
  to. On boot it replays from there to now in fixed steps, applying collisions
  and decay that fell in the gap, so a stopped machine and a running one end
  up with the same sky.

## Consequences

- Every fragment can be traced back through collisions to the satellites and
  callsigns that started it. Whether the catalogue *shows* owners' callsigns
  beside the debris they caused is a visibility decision still open in
  `PLAN.md`.
- The database only grows. Rows are small, so this is fine for the life of the
  course, but the in-memory sky (ADR 0001) must load only live objects.
- **Beacon text is kept forever,** so it needs a rule before C8 ships: length
  limit, and whether a dead satellite's beacon is still shown. Open in
  `PLAN.md`.
- Replay on boot is a hard requirement with its own test: stop the server, let
  time pass, restart, and the collisions and decay in the gap must have
  happened.
- Deleting a row by hand would break lineage, so fixes to bad data are new
  rows or fate changes, never deletes.
