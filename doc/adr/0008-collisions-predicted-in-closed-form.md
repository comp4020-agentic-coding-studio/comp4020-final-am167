# 0008. Collisions predicted in closed form, with orbits going both ways

**Status:** proposed (2026-10-06)

## Context

Collisions are the app's argument: two objects meet, become a cloud of
fragments, and the fragments hit other things (`PLAN.md`, "Core loop"). ADR
0003 says each collision is a row, each fragment records the collision it
came from, and a stopped server must apply the collisions that fell in the
gap. ADR 0004 says positions are never sent: every client works them out
from the stored orbit and the server's clock. ADR 0007 made decay a closed
form: radius³ falls at one rate for every object, and the period depends
only on height.

That leaves a snag. The chart's orbits are flat circles all going the same
way, and everything at one height moves at one speed, so two objects at the
same height never close in. Decay doesn't help: radius³ falls at the same
rate for both, so the gap between them in radius³ never changes, and the gap
in height slowly grows as they fall. As built, almost nothing would ever
collide.

The marker has about ten minutes and the sky may be nearly empty, so
something has to be able to happen even when only their two sessions are
open.

## Options

- **Same direction, bigger hit distance.** No change to the model. Two
  objects meet only when the lower one, going slightly faster, laps the
  higher one: once every few hours for a close pair. Rare and slow to watch.
- **Mixed directions.** Each orbit is prograde or retrograde. Two objects
  going opposite ways at nearly the same height meet head-on twice a lap. A
  sign in the maths; the 2D chart stays as it is.
- **Hidden inclinations.** A 3D orbit drawn in 2D, so orbits cross at nodes
  like real ones. The most realistic, but the horizon view would have to be
  redrawn as projected 3D orbits.
- **Detect by stepping.** Check every pair's distance every fraction of a
  second on the server, and replay a stopped server's gap step by step. Head-on
  objects close at a quarter of a planet radius a second, so the steps have to
  be tens of milliseconds: days of replay would take far too long.

## Decision

**Mixed directions, same-direction meetings with their own hit distance,
and every collision predicted in closed form.**

- **Each object has a direction**, +1 (prograde, anticlockwise) or −1
  (retrograde). The server picks it at random for a launch, like height and
  phase; retrograde gives no airtime advantage, so a free choice would be a
  trap. Existing rows are prograde. Its angle is its phase plus its direction
  times the angle swept (ADR 0007), the plunge included.
- **Two objects collide when their angles meet** (the relative angle crosses
  a whole turn) while their heights are closer than the hit distance: one
  for head-on meetings, and its own, tuned separately (it can be the larger),
  for one object lapping another going the same way. The distance is scaled
  by how big the two are: a fragment counts for a fifth of a satellite, so
  debris mostly threatens satellites. Objects in their burn-up plunge don't
  collide. Fragments of the same collision never collide with each other
  (they start at the same point).
- **Each meeting is a chance, not a certainty.** Inside the hit distance a
  head-on pair meets twice a lap for hours, so a certain hit would make
  every close pair collide within a lap of appearing. Instead each meeting
  hits with a fixed chance (higher for the rare lapping meetings), and which
  meeting hits is drawn once from the pair's ids, so it's the same on every
  replay. Collisions come as a steady trickle rather than all at once.
- **Prediction is exact and cheap.** The height gap between two objects only
  grows (radius³ gap fixed, radii shrinking), so a pair already farther apart
  than the hit distance can never collide and is skipped. For the rest, the
  relative angle changes in one direction only, so the next meeting is found
  by bisection on the closed-form angle (the nth meeting is n − 1 turns
  further on), and checked against the height gap and both burn-up times
  then.
- **The server keeps the next hit for every candidate pair**, recomputed
  when the live sky changes, and a timer for the earliest (as it does for
  burn-ups). Before any read of the sky, every predicted hit whose time has
  passed is applied in time order; each can add fragments that hit something
  sooner, so prediction runs again after each. A stopped server catches up
  the same way on its first request, so a stopped and a running server end
  with the same sky without a stored simulation clock or fixed steps (this
  replaces that part of ADR 0003).
- **Every screen is told ahead.** When a hit is predicted, a `conjunction`
  event gives every screen the two objects and the moment of impact, and the
  sky page draws it then. When it's applied, a `collision` event names the
  collision, the two objects destroyed and the fragments made.
- **A collision is a row** (`collisions`: time, the two objects, where).
  Both objects get fate `destroyed`. **Fragments** are debris rows whose
  source is that collision: a few from each satellite or derelict, scattered
  widely in height and a little in angle from the impact, mostly keeping
  their parent's direction, so a head-on hit leaves debris going both ways.
  They're placed by a generator seeded by the collision, so a replay makes
  the same fragments. They decay like anything else. **A fragment that hits
  something is pulverised** and makes no fragments of its own: debris
  destroys satellites but can't multiply by itself, so a cascade feeds on
  satellites and dies out once people stop launching.
- **The collision shows both beacons together**, as a couplet, on every
  screen and in the catalogue.
- **A floor of derelicts.** When the sky holds fewer satellites and
  derelicts than a baseline, the server adds ownerless dead satellites (real
  orbit is full of them), at most one every 10 minutes since the last, so a
  quiet sky still has something to hit but a cascade can't be fed faster
  than the rest of the world launches. They arrive as launches by nobody.
- **Hit distances, fragment counts, the derelict baseline and a cap on live
  objects** are constants, tuned with the simulation running.

## Consequences

- **Whether two objects can ever collide is settled when the second
  appears.** A pair outside the hit distance never will; a pair inside it
  will, at a meeting drawn from their ids, unless one burns up or is hit
  first. Crowding the popular height is what makes a launch risky, which is
  the argument.
- **Tuning (2026-10-06, a simulated day):** without the per-meeting chance,
  pulverised debris and the derelict floor, the first versions ran away:
  one collision's fragments set off the next and the sky sat at the live
  cap with thousands of collisions an hour, never healing. With them, the
  rate is a dial. At 5 to 15 collisions an hour a visitor almost surely
  sees one, but nearly every satellite ends in a collision within an hour
  or two. Advay chose gentler: a quiet sky (a dozen people, the derelict
  floor of 20) has 1 to 5 collisions an hour with 50 to 140 objects up,
  satellites typically last 2 to 4 hours before a hit, and about half burn
  up first. The cost is that a visitor may wait 15 to 30 minutes to see a
  collision; the conjunction warnings say when the next one is coming.
  Settling the sky takes a few milliseconds.
- Conjunction warnings come seconds to hours before impact, depending on
  the meeting drawn; dodging (C10) would fit in that window.
- No positions are sent: the fragments' orbits travel in the `collision`
  event as elements, and clients draw them like any other orbit.
- A cascade grows around the first hit's height and is fed by satellites
  there; the cap on live objects is a backstop against filling the 256 MB
  machine, not what normally stops it.
- The derelicts are placed at random when added, so they're stored like any
  launch; nothing about them is recomputed.
- The physics is a toy: real collisions come from crossing orbital planes,
  not opposite directions in one plane, and real conjunctions are rare per
  pair per year. The `/kessler/` page should say so.
- Testable over HTTP only in part: the maths (meeting times, skipping pairs
  that can't meet, fragments from a seed) gets unit tests, and applying and
  catching up hits gets a server test against a throwaway database with the
  clock passed in, like `spec/decay-server.test.ts`.
