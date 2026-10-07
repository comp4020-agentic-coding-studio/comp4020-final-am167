# 0011. Bringing your satellite down, or boosting it up a band

**Status:** accepted (2026-10-07; proposed 2026-10-07).

## Context

The core loop has always ended with deorbiting (`PLAN.md`, "Core loop"): an
owner can bring their own satellite down on purpose, giving up its beacon to
leave the sky cleaner. Without it, the only thing a person can do for the
commons is not launch. Advay asked for it on 2026-10-07: a gradual descent,
not a vanishing, and a dialog that thanks whoever does it. He also asked for
the opposite: **boosting**, raising your satellite a band (low to mid, mid
to high) in a gradual climb, so it stays up longer.

Orbits are closed form (ADR 0007, 0008): a position is a pure function of
the stored orbit and the server's clock, every screen draws it the same,
and the server predicts every collision from it. Every orbit falls the same
way (radius³ drops at one rate), which is what lets the server say two
orbits farther apart than the hit distance never meet. A manoeuvre breaks
both: the orbit changes, and it moves through other orbits' heights.

## Options

- **Instant.** Deorbiting removes the satellite at once; boosting moves it
  to the new band at once. Simple, but nothing to watch, and a satellite
  that teleports can't be hit on the way.
- **A gradual change in closed form.** A manoeuvre is a new epoch for the
  object: from where it is, it falls (or climbs) faster than drag alone, by
  a stored multiple, so positions stay a pure function of the orbit and the
  clock. Its collisions are worked out again from then on.
- **Stepped by the server.** The server moves it a little at a time and
  sends positions. Against ADR 0004 (positions are never sent).

## Decision

**A manoeuvre is a new epoch for the orbit, with its own rate of fall, in
closed form.**

- An orbit gains a **rate**: how fast radius³ falls, as a multiple of drag
  alone (1 for everything else). Over 1, it is being brought down; below 0,
  it is climbing. And an optional **until**: when a climb ends, after which
  it falls by drag alone from the height it reached.
- **Deorbiting**: from where it is, the satellite falls to the top of the
  atmosphere in **two minutes**, then burns up as anything else does (ADR
  0007, 30 seconds). Its fate is `deorbited`, not `decayed`. Its owner is
  thanked in a dialog. Everyone sees it come down, and the news line says
  it is being brought down on purpose.
- **Boosting**: the satellite climbs from where it is to a random height in
  the next band up (picked like a launch's, so boosted satellites don't all
  share one height) in **90 seconds**, then falls by drag alone from there.
  From low to mid gives it hours more; from mid to high, days. **Each
  satellite carries fuel for one boost**, so a launch can buy one band, not
  live for ever; nothing in the high band can boost. The database write
  itself checks the boost is unused, so asking twice at once, or from two
  devices, still boosts once.
- Only the satellite's owner can do either (ADR 0009), through a form that
  works without JavaScript, in the sky's station panel, for the one it is
  telling you about. Not on the launchpad: that's for launching, and was
  getting cluttered (Advay, 2026-10-07). A satellite already coming down,
  or burning up, can't do either; one climbing can be brought down, but
  not boosted again.
- **Collisions**: the object's predicted meetings are thrown away and
  worked out again from its new orbit. A meeting is found in pieces: while
  two objects fall at different rates their radius³ gap changes linearly,
  so the moment their heights cross, and the stretch either side where they
  are within the hit distance, are found by bisection, and so is each whole
  turn of the angle between them within it. A boost can take a satellite
  out of a collision coming, or into one; a satellite being brought down
  can be hit on the way. Everyone is told (`manoeuvre`), so screens drop
  the collisions that were called off, and the new ones are announced.
- Each manoeuvre is kept (a `manoeuvres` table: which object, which kind,
  when, from what height to what height), for the record (ADR 0003) and for
  clicking an object to see its history later.

## Consequences

- A person can now act for the commons, and everyone sees them do it. The
  thank-you is the only reward; nothing is scored. Whether people use it is
  for the C10 logs.
- Boosting is a way to stay up longer and be heard for longer, at nobody
  else's visible cost but the same crowding; one boost each keeps it from
  becoming immortality.
- Collision prediction is no longer a single search per pair, so it costs
  more for manoeuvring objects (a handful of bisections); plain pairs are
  found exactly as before, so a replay of an old sky is unchanged.
- A manoeuvre is something the server can't replay from orbits alone: the
  stored orbit is the one after it. A server stopped mid-descent still
  catches up exactly, because the descent is the stored orbit.
- Trails a few seconds behind a satellite that has just manoeuvred are drawn
  from the new orbit, so they bend a little early.
- Deorbiting doesn't give back the launch gap, and boosting doesn't use it.
- New columns on objects (rate, until, when it was brought down, boosts
  used) and the `manoeuvres` table, as a migration.
