# 0021. Extras: invented people who launch like anyone, so a quiet sky isn't empty

**Status:** accepted (2026-10-12; Advay: "seeding fake, but realistic users is approved … needs to look realistic and natural"; revised the same day after its review, before merging).

## Context

The sky only has satellites when people launch them, and most hours nobody
is on. A visitor (or a marker) usually arrives to derelicts and debris, a
catalogue whose latest launch is hours old, and stations with nothing to
hear. The derelict floor (ADR 0008) gives collisions something to hit, but
derelicts say nothing new and nothing is launched while you watch.

PR 5 (2026-10-07, closed 2026-10-10) seeded the sky with sixteen invented
*organisations* (an imaging company, a comms constellation, a school, an
advertiser) launching about two an hour. It was closed unmerged:
`PLAN.md` noted that the balancing after it (ADRs 0019 and 0020) changed
how often collisions happen and how many satellites burn up, so seeding
needed rethinking against that balance. Its lines also read as companies
("Frame 4021 of the south coast, 30% cloud"), not as the people the app is
for.

Advay approved seeding the sky with invented people, on the condition that
they look realistic and natural.

## Options

- **Leave it to people and derelicts.** Honest and simple; the sky is
  quiet most of the time, which is the problem.
- **More derelicts.** Still silent, and more of them raises the collision
  rate ADR 0008 tuned.
- **PR 5's resident organisations.** A varied cast, but corporate voices
  in an app about people saying one thing to each other, and tuned against
  a balance that no longer holds.
- **Invented people ("extras"), as the people who use the app would be:**
  mostly one-off visitors without a handle, a few regulars with handles and
  habits, launching at the hours people are about, answering the day's
  question, sometimes bringing theirs down.
- Whether to **say so on the page**: a mark on their satellites, or
  nothing.
- For the balance: **a lower rate**, **a lower derelict floor while they
  fly**, or **making room for people** (none launch while people are busy
  launching).

## Decision

**Extras: invented people who launch like anyone, with nothing on the page
to tell them apart; about 18 launches a day at Canberra's hours, making
room for people when people are here.** The schedule is `src/lib/extras.ts`,
the cast `src/lib/extras-cast.ts`, the server's part `src/lib/sky.ts`.

- **Who.** Fourteen regulars, each with their own hours in Canberra, how
  many days they come, the bands they like, a habit of naming ("NIGHTJAR
  7", "PIP-3", a regular naming them after sea creatures, a parent naming
  them after whatever the child said) and a dozen lines in their own voice:
  a night owl, a student dodging an essay, an over-eager low-band launcher,
  a careful one who brings theirs down, a hiker, a radio amateur, a parent,
  a grump, someone in Edinburgh, a retiree. Twelve have claimed a handle,
  two launch without one. A regular's satellites are numbered from the
  record (their first is NIGHTJAR 1), so a launch held back or a changed
  schedule never skips or repeats a number. And a crowd of one-off
  visitors, a little over half of launches, who never claim a handle, each
  a new person, naming theirs whatever comes to mind ("Pebble", "space
  potato", "Second Star", then "Second Star 2"). Nobody real: no handle is
  a person's name, no line speaks as a child, nobody mourns someone
  invented.
- **What they say.** About 110 lines a visitor might write (first goes,
  where they are, the shared sky, small talk, kind words), two dozen for a
  second or third launch ("Launching another so you hear me twice. Sorry,
  sky."), and a dozen answers to each of the stations' 21 questions. About
  a fifth of launches answer the day's question, at most half of its
  answers a day, mostly on a visit's first launch; a question about today
  only from 11am. Nothing they say can be checked against the sky and
  found false: a line tied to a time ("9pm at the bus interchange") is said
  only at its hours, one tied to a season only in its months, one naming a
  band ("going high") only from that band, a promise ("I'll bring this
  down when I'm done") only by a satellite whose owner will; and no line
  says something happened to one of theirs, or that they're listening
  (they never are, below). Each pool is
  dealt in a shuffled order that is used up before anything comes round
  again, at least half a pool later, so nobody says the same thing twice in
  a day (tested over four weeks: not within three days). Every callsign and
  line passes the launch form's own rules (`readLaunch`), and no callsign
  is one of the app's own words ("static", "echo", "beacon").
- **When.** A pure function of the clock, like an orbit: each hour a
  generator seeded by the hour picks how many one-offs come (Poisson,
  shaped to a
  Canberra day: busiest in the evening, near nothing at 4am, and some days
  busier than others) and when in the hour; each regular comes on about
  as many days as they do, once that day, at any hour of their window
  (drawn by the day, so no hour of theirs is skipped and no pattern shows
  in the catalogue); then how many each launches (one to three, at least
  70 seconds apart), the bands, and whether one is brought
  down (20 minutes to 3 hours later) or boosted (5 to 45 minutes later) as
  anyone can (ADR 0011). About 0.6 visits an hour (`PER_HOUR`), about 18
  launches a day. Every server agrees on it.
- **Launched like anyone's**: `kind = "satellite"`, heard over the
  stations, colliding, named in the blame (ADR 0010), met in someone's
  Yours (ADR 0017). Only the record knows: each one's owner cookie is
  `extra:` and a key, which no browser can present (the middleware takes
  only a UUID), and a regular's operator row is marked `extra` (migration
  `0010_extras`), with a random passphrase hash, so nobody can sign in as
  one and their handles are taken. A handle a person claimed first stays
  theirs, and that regular never launches, so nobody seems to be them.
- **They don't listen.** "Heard by" stays people who loaded a page (ADR
  0016): an extra never hears anyone, so nobody's audience is invented, and
  the README's "being heard needs other people" stays true.
- **Making room.** None launch in an hour in which people have launched
  four or more (`EXTRA_ROOM`: a crit, a busy evening), none while the sky
  is half full (`SKY_CAP`), and no more than 20 of theirs up at once
  (`EXTRA_CAP`). However many satellites are up, the sky keeps at least
  five derelicts (`DERELICT_MIN`, topped up one every `DERELICT_GAP` like
  the floor), since the extras count towards the derelicts' floor and
  could otherwise take every derelict's place (and their echoes with
  them).
- **Caught up like everything else** (ADR 0004, 0008): `settle` launches
  each extra's launch and manoeuvre at the time it was due, between the
  collisions before and after it, so ids follow the order things happened.
  A new database, an empty sky, goes back a day (`EXTRA_BACKFILL`), so the
  record has people in it from the first visit. Any other start, the first
  deploy with extras included, goes back only to the latest thing the
  record shows happening (a launch, a collision, a manoeuvre, a beacon
  heard): the server was up until then and people may have watched, so
  nothing behind it is rewritten. Nothing is launched twice (a launch is found by its
  owner and time), and only what's under a minute old is announced to open
  pages. `EXTRAS_PER_HOUR` (0 for none) and `EXTRA_CAP` override the
  defaults; the server tests that need an exact sky set
  `EXTRAS_PER_HOUR=0`, as they set `DERELICTS=0`.
- **Not disclosed on the page**, at Advay's call: the point is a sky that
  looks lived in. The record says so, and so does `README.md` ("An empty
  sky", under what was chosen not to build), since the app is marked on
  whether the two agree; the Why page no longer calls a wreck's noise
  "real people's words".

## Consequences

Measured with `scripts/balance/` (the real server code on scratch
databases, the clock passed in, the derelict floor on, people launching
into random bands, every run played out until every person's satellite had
come down; nobody watching unless said), against the same runs without
extras. The runs without extras match ADR 0020's own numbers within their
spread. "On air" is how much of their time over a station people's
beacons were the one broadcast, by the stations' own turn-taking
(`airtime.ts`).

| | without extras | with extras |
|---|---|---|
| People's satellites burned up, quiet sky (2 launches an hour for 12 hours; 40 runs each) | 62% | 54% |
| the same, at a crit (60 launches in an hour; 24 runs each) | 31% | 31% |
| the same, busy (10 an hour for 12 hours; 24 runs, and 16 of the first version) | 26% | 22%\* |
| Collisions an hour, quiet sky, unwatched | 0.47 | 0.64 |
| People's beacons on air, of their time over a station, quiet sky | 58% | 37% |
| the same, at a crit | 30% | 25% |
| Collisions a watcher sees an hour, quiet sky (staged, natural; 16 runs) | 5.9 (5.5, 0.4) | 6.8 (5.4, 1.4)\* |
| A newcomer sees a collision within 10 minutes | 99% | 100%\* |

\* Measured with the first version, before its review: the same rate and
rules, but regulars only every other hour and a few different lines. To
be measured again with `scripts/balance/`.

- The sky has people in it at any hour: a day's launches on a first start,
  someone launching most hours of a Canberra evening, beacons over the
  stations to hear, answers to the day's question, a regular's satellites
  in the catalogue across days. On a new database, the day it fills in
  holds about 17 of their launches, 1 to 12 of them still up (7 on
  average, over ten start times).
- More satellites means more collisions, which is the app's own argument:
  in a quiet sky, about half of people's satellites still burn up (54%,
  against 62% without them, and ADR 0020's 56 to 58%); at a crit the
  extras make room and nothing changes (31% either way). At the full default
  rate without making room, a quiet sky dropped to about 48%, and a lower
  derelict floor didn't help (the extras added satellites mostly low and
  mid, where derelicts spread over all three bands); the rate and the room
  rule are what keep it near ADR 0020's tuning. `PER_HOUR` is the dial.
- People's beacons get less airtime: the extras' beacons take turns over
  the stations like anyone's (ADR 0016), so in a quiet sky a person's
  beacon is on air for 37% of its time over a station, against 58%
  without them (25% against 30% at a crit). What decides being heard is
  getting a turn at all in a pass, which this doesn't measure yet; if
  that falls as far, the extras should give way at the stations, or fly
  fewer at once.
- A watcher sees more natural collisions (1.4 an hour, against 0.4), so a
  smaller share of what they see is staged (79%, against 93%); staging
  itself is unchanged.
- The app is no longer purely a record of what people did, and nothing on
  the page says which satellites aren't people's. Activity a visitor (or
  the marker) sees may be the extras', not other visitors'; the README
  says so. Any evidence drawn from the record (C10's launches per band,
  "do people crowd low?") must leave the extras out: their owner starts
  `extra:` (`isExtra`).
- The first deploy fills in nothing behind it, so the deployed sky gets
  its first extras over the hours after, not a day of them at once. (The
  first version filled in a day there too, and its review found that this
  rewrote people's history: satellites people had watched turned out
  destroyed hours before by an extra's debris.)
- What an extra can't fake is presence: a real launch hands off to the
  sky and adds a listener; an extra's never does, so the sky can say
  "Just you, listening" while someone launches. Lines that claim to be
  listening were cut for that reason.
- A redeploy that changes the cast, the rate or the question list changes
  what's due and what's said from then on; what's launched stays as it
  was. A question with no answers in the cast is never answered by an
  extra, and `spec/extras.test.ts` fails until it has a dozen.
- Blame lands on extras like anyone, and a person's satellite can be
  destroyed by an extra's, and find them in Yours: the only invented thing
  a person can meet.
