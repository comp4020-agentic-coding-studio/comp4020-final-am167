# 0020. Fewer, less forced collisions: a close pair may never collide, staging is irregular, and a burn-up is told first

**Status:** proposed (2026-10-10; revised the same day after its review).
Supersedes, in 0008, that a pair within the hit distance always collides
in the end, and the staging rate (none staged in the last 5 minutes); the
rest of 0008 (and 0013's head-on chance, and 0019) stands.

## Context

Advay, 2026-10-09: collisions feel too often and too forced; satellites
never seem to burn up, they always get destroyed. ADR 0019 stopped the
staged collisions taking anyone's satellite. Its review (an Opus reviewer,
2026-10-10) found the complaint only partly resolved:

- Natural collisions still destroyed most satellites, in a quiet sky too:
  about 4 in 5 at 2 launches an hour, 19 in 20 at a crit. ADR 0008 made
  each meeting of a close pair a chance, but every close pair still
  collided in the end: head-on, it meets twice a lap for as long as both
  are up, and mid and high satellites are up for a day or two. Debris from
  natural collisions did most of the killing (62%).
- Staging every 5 minutes, with nothing left to interrupt it, came like
  clockwork, always just over a station at the same height: about 85% of
  what a watcher saw.
- A burn-up was barely told. The sky's news line put any collision under 2
  minutes old first, and one under 15 minutes old above "X burned up on
  re-entry"; with a staged collision every 5 minutes there always was one.
  A burn-up got its 30 seconds as "X is burning up on re-entry" when no
  collision was under 2 minutes old: about 18 seconds of the line per
  burn-up, and 27% of them never mentioned at all.

Advay chose two of the levers offered: a close pair that may never
collide, and a burn-up that outranks a story about two derelicts. On the
first round's review (a second Opus reviewer) he asked for natural
collisions a little more often than that round's tuning gave, and staging
every 10 to 15 minutes instead of 5.

## Options

- **Lower the chance a meeting** (`CHANCE.headOn`): a close pair still
  collides in the end, only later, so mid and high satellites still die.
- **A chance a close pair ever collides**, drawn once from its ids: the
  pairs that can collide do so as before; the rest never do.
- **Smaller or fewer fragments**: weakens debris, but not the rule that
  any close pair collides.
- For staging: **a fixed longer gap** (10 or 15 minutes), **a random gap**,
  and for someone just arrived, **a shorter wait**.
- For the news line: **drop staged collisions from it**, or **let a burn-up
  outrank any collision that took nobody's satellite, or an older one**.

## Decision

**Each close pair collides at all with a chance of 0.5 (`CHANCE.ever`),
drawn once from its ids; a pass dead centre still always hits. Staging
waits a random 10 to 15 minutes after the last, or 5 for someone who has
just opened the sky. And the sky's news line tells a person's burn-up
before a collision that took nobody's satellite, or one older than the
burn-up.**

- `fatalMeeting` returns null for a pair that never collides. Its second
  draw decides it, so a pair that does collide hits at the same meeting it
  always did. The server skips the pair; the check before staging (0019)
  treats it as no threat. Staged collisions are dead centre, so they still
  always happen.
- `STAGE.every` is a range: after each staged collision the next waits a
  gap drawn from 10 to 15 minutes. `watcherArrived` (a page opening the
  stream) brings it forward to `STAGE.newcomer`, 5 minutes after the last:
  a marker's ten minutes still see one. Everything else about staging
  stands: nothing coming in the next 4 minutes, not into a busy sky, and
  only where it keeps to itself (0019).
- `src/lib/news.ts`: `freshBurnUp` is a person's satellite burning up now,
  or the latest to burn up in the last 15 minutes (never one of yours
  destroyed); `storyToTell` is the newest collision, unless a fresh
  burn-up is newer or the collision took nobody's satellite (`nobodys`,
  story.ts). An older collision is never told in its place. A collision
  coming is still announced first (25 seconds for a staged one), and its
  card still pops up.
- Someone coming back is told of theirs that burned up, as they already
  were of a collision (ADR 0017): on the sky, in the notice that waits to
  be dismissed ("EMBER burned up on re-entry 2 h ago, heard by 7 people",
  or the names of several, and how many people heard them between them),
  and in Yours' "Since you last looked" (`burnedUpSince`, sky.ts;
  `burnedUpNews`, story.ts). Added after the second review, at Advay's
  request: most satellites now burn up, and were never mentioned.
- 0.5 was chosen against 1 (as it was), 0.4, 0.3 and 0.25: 0.4 was the
  first round's value, and Advay asked for natural collisions a little
  more often.

## Consequences

Measured with the real server code on scratch databases (the clock passed
in, the derelict floor on, launches into random bands, every run played
out until every satellite had come down), with a line-by-line copy of the
sky page's news line fed by the real event stream. "Before" is as it was
before this record (every close pair colliding, staging every 5 minutes,
the old news line):

| | before | this |
|---|---|---|
| Satellites burned up, quiet sky (2 launches an hour, watched a quarter of the time) | 17% | 58% |
| the same with a tab always open | 23% | 55% |
| the same, never watched | 20% | 56% |
| a crit: 60 launches in an hour | 7% | 33% |
| a crit of 40, mostly low | 9% | 36% |
| busy: 10 launches an hour for 12 hours | 7% | 25% |
| Collisions a watcher sees an hour, quiet sky (staged share) | 14.4 (79%) | 7.5 (89%) |
| the same, tab always open | 12.4 (87%) | 6.2 (88%) |
| the same, at a crit of 60 | 26.7 (26%) | 10.9 (55%) |
| Burn-ups watched through their plunge that the news line told | 64–73% | 100% |
| Share of the news line's time about a burn-up, tab open | 0.2% | 13% |

- Collisions halve for a watcher, and staging no longer keeps time: gaps
  of 10 to 15 minutes (a median of 12), shorter only when someone arrives.
  A newcomer still sees a collision in their first 10 minutes 94 to 100%
  of the time, quiet sky or busy.
- Natural collisions are rarer than before, but a little more common than
  this record's first value (0.4): per watched hour, about 0.85 in a quiet
  sky (was 3.1), 5 at a crit (was 20). In a quiet sky nearly everything a
  watcher sees is still staged; staging less still, or only when someone
  arrives, is the lever left.
- The news line is still mostly about collisions that took nobody's
  satellite (about 70% of its time with a tab open): staged ones, while no
  burn-up is fresh. Dropping those from the line (their card already tells
  them) would change that.
- Collisions still rise with satellites up (PLAN.md's requirement), but
  only once people outnumber the derelict floor; see PLAN.md for the
  numbers. A cascade still grows with crowding, far more slowly.
- A pair's fate is still settled when the second of them appears, and a
  replay applies the same collisions; but a server deployed with this
  works out every pair again, so about half the natural collisions
  announced before a deploy won't happen.
- Someone who comes back is told of each of theirs that burned up or was
  destroyed since they last looked. The launchpad, where most people come
  back to, tells neither: only what of theirs is still up.
