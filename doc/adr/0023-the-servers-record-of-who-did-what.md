# 0023. The server's record of who did what

**Status:** accepted (2026-10-14; Advay: "accept ADR 0023"). Adds to
ADR 0022, which it leaves as it is.

## Context

Crit 10 ("Fly by instruments") asks the deployed app to **log who did
what, server-side**, and keep doing so after the crit: two people use it
in separate Chrome profiles while someone narrates from `flyctl logs`
alone, and if the logs can't tell them apart, or one can change the
other's things, that's the finding.

What each person may see and change, and what the server refuses and
why, is ADR 0022. Until now the server logged only errors, so nothing
showed those rules being kept or tested by anyone. This record is the
log.

## Options

For the log:

- **Structured JSON lines.** Easy for a machine to read; hard to narrate
  from live in a terminal.
- **One plain line per event, `event key=value ...`, on stdout.** Readable
  as it scrolls, greppable, nothing to set up: Fly collects stdout.
- **A table in the database, and a page to read it.** Lasts longer than
  Fly's log retention, but it's something new to protect and to build,
  and the crit reads `flyctl logs`.

For naming people in it:

- **The cookie.** Tells people apart, but the cookie is all it takes to
  act as someone (ADR 0002): anyone who can read the logs could become
  anyone in them.
- **The handle only.** Most people never claim one, so every anonymous
  visitor would read the same.
- **The handle, or `anon`, and a short id made from the cookie.** Tells
  two anonymous visitors apart without writing the cookie down.

## Decision

One plain line per event on stdout, through `src/lib/log.ts`:
`event key=value ...`. A value that isn't a plain word is quoted with
JSON's escaping, and anything that could break a line or turn it round on
screen (newlines, line separators, controls, bidi marks) is escaped, so
every event is exactly one line, whatever someone typed.

### Who

On every line about a person: their handle if signed in, else `anon`,
then `#` and the first six hex digits of a SHA-256 of their cookie
(`ada#3f2a1c`, `anon#9d0b7e`). Two people, anonymous or not, read
differently; the cookie, and any slice of it, never appears. The id is
the cookie's, so it's the device's for as long as the device keeps its
cookie: a handle on two devices shows two ids, and claiming, signing in
or signing out gives a device a new cookie, so those lines say who it was
(`who=`) and who it is now (`now=`).

`who=` is only ever whoever did something; a satellite's owner is
`owner=` (`a_owner=`, `b_owner=` in a collision), named as ownership
works (ADR 0009): an operator's by the handle alone (`owner=ada`), since
it's theirs on every device, otherwise by the cookie that launched it
(`owner=anon#9d0b7e`). An extra is named by their owner, `extra:<name>`,
so their lines are there and marked, not hidden; a derelict's or debris's
owner is `nobody`, and a satellite that was never there is `none`.

### Reserved handles

`anon`, `nobody`, `none` and `extra` (in any case) are the words the
record uses for who someone is, so nobody may claim them as a handle
(`handle-reserved`, with the page's "That handle is taken"). Otherwise
someone signed in could read as an anonymous visitor, as no-one, or as
an extra.

### Events

- `visit`: a new cookie set (a browser seen for the first time), and the
  page it asked for.
- `launch`: who, the satellite's id, callsign, band and words.
  `launch-refused`: who, the reason, and what they tried.
- `deorbit`, `boost` (with the band from and to): who and the satellite.
  `deorbit-refused`, `boost-refused`: who, the satellite, its owner and
  the reason, so "B tried to bring down A's satellite" reads off one
  line. `manoeuvre-refused`: a form that isn't a manoeuvre, or can't be
  read.
- `claim`, `sign-in`, `sign-out`, each with who and `now`, and for a
  claim or sign-in how many of the device's satellites became the
  operator's (`took=`); `claim-refused` and `sign-in-refused` with the
  handle tried and the reason, never the passphrase. A handle tried that
  couldn't be a handle (a space, punctuation, too long) is logged only by
  its length (`handle_length=`), in case it's a passphrase typed into the
  wrong box. `operator-refused`: a form that can't be read.
- What the server does on its own, each with its own time (`at=`, ISO),
  since a server that was stopped catches up on what happened meanwhile
  and logs it late: `collision` (both objects, their kinds, owners
  and callsigns, debris's source collision, the fragment count),
  `burn-up` (each satellite and derelict, whose and how it ended; a
  settle's debris as one line with a count, since a staged collision
  makes a dozen fragments every few minutes, from the `first` to the
  last, `at`), `staged` (the derelict pair, when they'll meet and over
  which station), `derelict` (one put up to keep the sky's floor), and
  the extras' `launch`, `deorbit` and `boost`.

### Refusal reasons

Every refusal ADR 0022 lists is logged with a `reason=` in a word or
two:

- Launch: `gap`, `sky-full`, `bad-band`, `bad-callsign`, `bad-beacon`.
- Deorbit and boost: `not-yours`, `coming-down`, `burning`, `no-fuel`,
  `top-band`, and one new to this record, `gone`: your own satellite
  that is no longer in orbit (a page left open past its burn-up or
  collision). The server used to answer that `not-yours` too, and ADR
  0022 lists only that; now it tells the two apart, on the page and in
  the log, and still refuses both.
- Claim: `signed-in`, `taken`, `handle-length`, `handle-characters`,
  `handle-blocked`, `handle-reserved` (above), `passphrase-length`,
  `too-many-claims`, `busy`.
- Sign-in: `wrong-passphrase`, `no-such-handle`, `extras-handle`,
  `too-many-tries`, `busy`. The record may say which, where the page
  says only "that handle or passphrase isn't right" (ADR 0022): the page
  mustn't help anyone find handles; the maintainers may know.

### Logged once

Each event is logged where it's written to the database: a collision in
its transaction's wake, a burn-up only if this settle is the one that
marked it, an extra's launch only if it wasn't in the record already. So
a restart, which catches up from the record, logs nothing twice
(`spec/log.test.ts`).

### Not logged

Cookies, passphrases, or anything else that lets someone act as another.
A form posted from another site, which Astro refuses before any of the
app's code runs (logging it would mean replacing Astro's check with one
of our own, which isn't worth the risk). Beacons being heard (a line per
pass per station would bury the rest, and "heard by" is already counted).
Page views by someone seen before. `console.error`'s errors, which stay as
they are, outside this record.

## Consequences

- Narrating the crit from `flyctl logs`: two profiles are two ids from
  their first `visit`; each launch, manoeuvre and refusal names its
  person; a refusal of someone else's satellite names both.
- The log is now somewhere people's words and handles are kept outside
  the database, for as long as Fly keeps logs. Beacons are public anyway;
  handles too. A refused launch's words are logged even though they were
  never broadcast (a slur, a link): that's what tells the narrator what
  was tried.
- A short id is a hash of a random cookie, so it can't be turned back
  into the cookie; six hex digits make two people sharing one unlikely
  (one in sixteen million per pair).
- Someone who types a passphrase that would pass as a handle (one word,
  20 characters or fewer, no punctuation) into the handle box has it
  logged as the handle tried. Anything else there is only counted.
- Lines with `at=` well before the log's own time are catch-up: a server
  that was stopped, or a new database filling in the extras' last day,
  logs them as it reaches them, not always in time order.
- The record has no client address, so launches from a script that drops
  its cookie read as many people. That's the loophole ADR 0002 accepted;
  if it's abused, a hash of the address could be added to `visit`.
- The aggregate figures once planned for C10 (launches per band,
  collisions, deorbits, cookies per human) can be counted from these lines
  if they're still wanted.
- Logged only as stdout lines: Fly keeps them for a while, not forever.
  If the record must outlast that, it needs storing (a new record).
