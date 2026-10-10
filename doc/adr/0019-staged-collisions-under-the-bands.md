# 0019. Staged collisions keep to themselves, under the launch bands

**Status:** proposed (2026-10-09; revised 2026-10-10 after its review).
Supersedes the height of the staged collision in 0008; the rest of 0008
(and 0013's head-on chance) stands.

## Context

Advay, 2026-10-09: collisions feel too often and too forced; satellites
never seem to burn up, they always get destroyed.

ADR 0008 tuned collisions so that "about half of satellites burn up
before a hit" in a quiet sky. After its adversarial review it added a
collision to watch: when someone has the sky open and nothing is coming,
the server sends two derelicts at each other, at most every 5 minutes.
They met at radius 1.3, the middle of the low band, and their 6 fragments
were spread up to ±0.15 in height, across most of the band.

Every object falls at one rate in radius³, so heights keep their order:
a fragment can only ever meet what was within a hit of it when it was
made, or what is launched beside it later. Staged in the middle of the
low band, every staged collision put fragments beside the next hour's
low launches.

Measured with the real `collide.ts` and `orbit.ts` (a Monte Carlo of a
satellite launched into a sky of 7 derelicts a band, with a staged
collision every 5 minutes for the last 4 hours): one staged collision's
debris alone took about 14% of low launches. With staging, 3% of low
satellites burned up, the rest destroyed a median 3 minutes after launch;
without it, 54%. Mid and high launches were untouched (debris made below
them can't reach them), so the harm fell on the band people pick to be
heard.

The first version of this record moved the staged collision to radius
1.1 and kept its fragments under the bands. Its review (PR 10, 2026-10-09)
found that this only moved the harm:

- Every low satellite spends its last hour falling through 1.06 to 1.14,
  where all the staged debris now lay. A fragment made within a hit of a
  satellite stays within reach until it burns up, so with someone
  watching through a satellite's last 40 minutes, it was nearly always
  destroyed instead of burning up (1 in 60 burned up in the review's
  runs).
- Staged pairs started inside the last hour's staged debris, and about
  one in five was broken up before it met, so the collision announced
  over a station never happened.
- Fragments packed into that thin shell met each other and the next
  pairs: a watcher saw about 20 collisions an hour, most of them
  knock-ons among staged material.

## Options

- **Stage less often** (every 15 minutes): low survival only rises to
  about 10%, and a visitor sees fewer collisions.
- **Stage under the launch bands**, and keep a collision there from
  throwing fragments up into them. Its debris can't reach anything
  launched since, but it still lies where satellites fall to burn up.
- **Don't stage while a satellite is in its last hour**: closes that,
  but most of the time some satellite is, so it would rarely stage.
- **Stage where the collision keeps to itself**: low, where its wreck
  burns up within minutes, and only where nothing else can be drawn in.
- **Make debris less deadly** (smaller, or fewer fragments): weakens every
  collision, not just the staged ones, and the cascade with them.

## Decision

**A staged collision keeps to itself: it happens just over the
atmosphere, its wreck only falls, and it's only sent where nothing else
gets to its derelicts first and nothing up could ever meet its debris.**

- `STAGE.radius` is 1.08 (about 160 km on the chart's scale, 40 km over
  the top of the atmosphere), under the low band's reach (1.14).
- `fragmentsOf`: a collision under the low band's reach only falls. Each
  fragment goes down from the impact (no higher than the widest
  satellite–debris hit distance below the lowest launch), by the same
  random spread as anywhere else. From a staged collision about four
  fragments in five land in the atmosphere and burn up at once (many from
  just over the ground, where the spread is cut off); the rest burn up
  within 16 minutes. It's worked
  out from the two objects, so a replay makes the same fragments, and it
  applies to any collision down there, not only staged ones.
- `stageCollision` checks before it sends a pair: nothing up meets either
  derelict, at the meeting the pair's ids say hits, before they meet each
  other; and nothing up could meet any of their fragments, at any meeting
  (a fragment's id isn't known until it's made). Fragments fall with
  everything else, so whatever is out of reach when they're made stays
  out of it, and anything launched later starts higher. (Not quite
  everything: a later natural collision can throw a fragment down beside
  them, and a satellite brought down or boosted crosses them. The review
  measured 1 such knock-on in 1,576 staged collisions.) If the station
  picked at random fails, it tries the other two; if all fail, nothing is
  staged, and the next settle tries again.
- Everything else in 0008 stands: the hit distances, the chance a
  meeting, the fragment count, the staging rate (since changed by 0020)
  and lead, and staging over a station.

## Consequences

Measured with the real server code (`sky.ts`) on scratch databases, the
clock passed in, a settle every 15 seconds (as for someone watching):

| | first version (1.1) | this |
|---|---|---|
| 10 low launches at once, watched throughout: burned up | 0 of 80 | 34 of 80 |
| the same, watched only through their last 40 minutes | 2 of 80 | 18 of 80 |
| the same, never watched (no staging) | 17 of 80 | 22 of 80 |
| satellites destroyed by staged material, across all the runs | 65 | none |
| staged pairs broken up before they met | 11 to 14% | none |
| collisions an hour, watching an empty sky | 25 (17 knock-ons) | 12 (none) |
| collisions an hour, watching a quiet sky (3 launches an hour) | 27 (18 knock-ons) | 12 (none) |

- A watcher no longer costs anyone a satellite: with staging, low
  satellites burn up as often as without it (the differences in the table
  are within the runs' spread). Mid and high are unchanged.
- A watcher sees the staged collisions and nothing they set off: about 12
  an hour in a quiet sky, as often as 0008's rate allows, where before
  half the cards were knock-ons. The staging rate is a dial if that is
  still too often.
- When something is in the way, staging waits: in a busy sky (10 launches
  an hour) about 7 an hour are staged, not 12. A satellite or derelict in
  its last 20 minutes or so can hold it off until it has burned up: until
  something else goes up, the next try's pair gets the same ids, and its
  wreck would break the same way.
- Checking a pair takes under 10 ms with 150 objects up.
- A satellite brought down (ADR 0011), or boosted from the bottom of the
  sky, can still cross a staged wreck's lingering fragments, as it can
  any debris below it; they're few and burn up within 16 minutes.
- The staged collision is drawn just over the airglow line, close to the
  planet in the whole-sky view.
- Satellites still mostly die, in a quiet sky as well as a busy one: any
  two objects launched within a hit of each other collide eventually, since each meeting is
  another chance, and mid and high satellites live long enough to meet
  many times. Without any staging, about 30% of low, 9% of mid and 4% of
  high satellites burned up in the quiet runs (3 launches an hour for 12
  hours), and 15%, 5% and 1% in the busy ones (10 an hour). Giving a close
  pair a chance of never colliding is the next lever.
- With nothing left to interrupt it, the staging timer now fires every 5
  minutes like clockwork, always just over a station at the same height:
  about 85% of what a watcher sees is staged. And the sky's news line lets
  a collision story under 15 minutes old outrank a burn-up, so a watcher
  is barely told of one: 30 seconds as it burns, if that (the review,
  2026-10-10). Both are taken up in 0020.
