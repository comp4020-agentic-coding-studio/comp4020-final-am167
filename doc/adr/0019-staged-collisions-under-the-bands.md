# 0019. Staged collisions happen under the launch bands

**Status:** proposed (2026-10-09). Supersedes the height of the staged
collision in 0008; the rest of 0008 (and 0013's head-on chance) stands.

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

## Options

- **Stage less often** (every 15 minutes): low survival only rises to
  about 10%, and a visitor sees fewer collisions.
- **Stage under the launch bands**, and keep a collision there from
  throwing fragments up into them. The collision to watch is kept, at the
  same rate; its debris can't reach anything launched since.
- **Make debris less deadly** (smaller, or fewer fragments): weakens every
  collision, not just the staged ones, and the cascade with them.

## Decision

**Staged collisions meet at radius 1.1, under the launch bands, and a
collision under the bands keeps its fragments under them.**

- `STAGE.radius` is 1.1 (about 200 km on the chart's scale), under the low
  band's reach (1.14). Its derelicts and their debris burn up within about
  half an hour.
- `fragmentsOf`: when the impact is under the low band's reach, the spread
  is cut, and any fragment capped, so every fragment is at least the
  widest satellite–debris hit distance below the lowest launch. It's
  worked out from the two objects, so a replay makes the same fragments.
  It applies to any collision down there, not only staged ones: an old
  satellite hit near the end of its fall leaves its debris below the bands
  too.
- Everything else in 0008 stands: the hit distances, the chance a
  meeting, the fragment count, the staging rate and lead, and staging over
  a station.

## Consequences

- In the same simulation, low launches burn up about 56% of the time with
  staging every 5 minutes, as they do with none: the quiet-sky figure 0008
  chose. Mid (about 75%) and high (about 90%) are unchanged.
- Staged debris can still meet a satellite in its last half hour or so,
  once it has fallen under 1.14; by then it's nearly burned up anyway.
- A satellite brought down (ADR 0011) still descends through staged
  debris, as it does through everything below it.
- The staged collision is drawn just above the atmosphere, close to the
  planet in the whole-sky view; checked by eye at 1920x1080, it reads
  over Canberra.
- The staging rate is unchanged, so a watcher sees as many collisions as
  before; what changes is the debris they leave, and so the collisions it
  went on to cause.
- Satellites in a busy sky still mostly die: any two objects launched
  within a hit of each other collide eventually, since each meeting is
  another chance. Giving a close pair a chance of never colliding is the
  next lever, if this isn't enough.
