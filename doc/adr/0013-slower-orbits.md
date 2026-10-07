# 0013. Slower orbits, so a beacon can be read

**Status:** accepted (2026-10-07; proposed 2026-10-07). Supersedes the period law in 0007 and
the head-on chance in 0008; the rest of both stands.

## Context

ADR 0007 fixed one period for each height: the low band's middle comes
round once a minute, the high band's every eight, the mid's every 2.7
minutes. A satellite is overhead while it's within 12° of a station, a
fifteenth of its lap, so a low satellite's beacon was on screen for about
four seconds, a mid one's for eleven. A beacon is up to 60 characters,
and four seconds is barely time to read one. The low band is the one
people pick to be heard, and it was the hardest to read. Advay, on
2026-10-07: the satellites orbit too fast.

Positions are a pure function of the stored orbit and the clock (ADR
0004), and the period is part of the stored orbit (`objects.period`), so
whatever changes the law also has to say what happens to the orbits
already up.

## Options

- **Slow everything by a factor**, keeping the shape of the law (the same
  power of the radius, so higher is still much slower). The beacon stays
  up for that many times longer; passes are that many times rarer.
- **Widen the station's window** instead. A beacon stays up longer at the
  same speed, but a wider wedge reads as less precise, and the sky still
  races.
- **Slow only the low band.** Breaks one period for each height, which
  collisions rely on (the lower of two objects going the same way is
  always the faster, ADR 0008).

## Decision

**Every period is three times longer.**

- `periodAt` keeps its power (radius^3.39) and is multiplied by three: the
  low band's middle comes round every 3 minutes, the mid's about every 8,
  the high's every 24. A low beacon is on screen for about 12 seconds, a
  mid one for about 32.
- Three times fewer passes over a station would make a beacon heard three
  times less often. Three ground stations (ADR 0014) give that back: a
  satellite now passes one of them about as often as it passed the one
  station before.
- **Head-on collisions per hour stay about the same.** Head-on meetings
  are three times rarer at a third of the speed, so each one's chance of a
  hit triples, from 2% to 6%. Lapping meetings (same direction) are left at
  50%, so lapping collisions become about three times rarer; they were the
  minority already.
- **Decay is untouched.** radius³ falls at the same rate, so every
  lifetime in ADR 0007 is the same; an orbit just goes round fewer times
  before it burns up. Manoeuvres keep their durations (ADR 0011).
- Trails are drawn for 36 seconds of travel instead of 12, so they keep
  their length on screen.
- **Orbits already up are retimed once.** On the first settle after the
  server starts, any live object whose stored period is the old law's
  (under 60% of the new period for its height) gets a new epoch: where it
  is now, with the new period for its height there. Nothing jumps; it
  carries on from where it was, slower, and burns up when it would have.
  A manoeuvre carries on: a climb still under way keeps its rate and end, a
  finished one falls by drag alone from now, a descent keeps its rate. An
  object already in its last 30-second plunge, or not up yet, is left
  alone. The check is idempotent, so a second start does nothing; if it
  fails (a busy disk), the next settle tries again.

## Consequences

- Copy that quoted periods changes with them: the launchpad's bands, the
  Kessler page, the README.
- A sparse sky has fewer passes to watch; three stations and the whole-sky
  view (ADR 0014) are what keep it from looking empty.
- The staged collision (ADR 0008) keeps its 25-second lead; at a third of
  the speed each derelict starts 50° from the meeting point, not 150°.
- The retiming is code, not a migration: it needs the closed-form orbit to
  find where each object is. It stays in until nothing launched under the
  old law can still be up (three days after deploy), then can go.
- A retimed pair's meetings are counted from the new epoch, so which of
  their meetings is the fatal one (ADR 0008) is drawn afresh, and a
  collision that would have fallen between the deploy and the first
  request after it doesn't happen. Positions don't jump; the future of a
  few pairs changes.
- If the speed is still wrong, the factor is one constant; this record
  says what else moves with it (the head-on chance and the trail length).
