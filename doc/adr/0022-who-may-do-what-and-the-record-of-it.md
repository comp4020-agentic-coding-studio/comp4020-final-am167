# 0022. Who may see and change what, and the server's record of who did what

**Status:** proposed (2026-10-13).

## Context

Crit 10 ("Fly by instruments") asks two things of the deployed app. It
must **log who did what, server-side**, and keep doing so after the crit:
two people use it in separate Chrome profiles while someone narrates from
`flyctl logs` alone, and if the logs can't tell them apart, or one can
change the other's things, that's the finding. And what each person **may
see and change** must be checked on the server and **written down, with
why**.

Until now the server logged only errors. What each person may do is
spread across ADRs 0002, 0009, 0010, 0011, 0015, 0016 and 0021: 0009 says
who owns a satellite and what claiming and signing in do, 0011 that "only
the satellite's owner" can deorbit or boost it. None says in one place
what the server refuses, to whom, and why, or what a signed-out visitor,
a signed-in operator and everyone else each see. This record does both,
and adds the log.

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

### What the server refuses, and why

A **person** is a cookie (ADR 0002); an **operator** is a handle a person
claimed (ADR 0009). A satellite is **yours** if it's your operator's, once
it has one, or else your cookie's (`ownedBy`, `sky.ts`). Every rule below
is checked on the server, whatever a page offers or hides.

| Who | May | Is refused, and why |
|---|---|---|
| Anyone, signed in or not | Launch, any number up, one launch a minute (per operator if signed in, per cookie if not), within the launch rules | A launch inside the minute (`gap`: so one person's browser can't fill the sky; a script that drops its cookie, or someone signing out and in, is a new person each time, the loophole ADR 0002 accepted, and the record shows it as a run of new ids); into a full sky (`sky-full`: 200 satellites, so the machine holds it); a form breaking the rules (`bad-callsign`, `bad-beacon`, `bad-band`: no links, no slurs, short lines, since everyone hears it); a form posted from another site, or a manoeuvre or sign-in posted from one (Astro's origin check, a 403 before the app sees it: so no other page can act as you) |
| A satellite's owner | Bring it down; boost it a band, once | Something no longer in orbit (`gone`: a page left open past its burn-up or collision); something already coming down (`coming-down`) or burning up (`burning`); a second boost (`no-fuel`: one boost each, so nothing lives forever); a boost from the high band (`top-band`) |
| Anyone else, signed in or not | Watch it, read its card and history, see who's to blame (ADR 0010) | Bringing down or boosting it (`not-yours`): it's someone else's say whether their line stays up. The same refusal for something that isn't there, a derelict, debris, or an extra's (ADR 0021) |
| A signed-out visitor | Everything anyone may, with what their cookie launched; claim a handle, or sign in to one | Anything of an operator's, even satellites this device launched before signing out: signing out makes it a new person (ADR 0009), so whoever uses the device next can't touch them. A handle that's taken (`taken`) or breaks the rules (`handle-length`, `handle-characters`, `handle-blocked`, `passphrase-length`); one of the words the record uses for who someone is (`handle-reserved`: `anon`, `nobody`, `none`, `extra`, so nobody signed in reads as an anonymous visitor or no-one); more than 60 claims an hour from one address (`too-many-claims`). A wrong passphrase (`wrong-passphrase`, `no-such-handle`), five from one place and then a 30-second wait (`too-many-tries`), so guessing is slow but can't lock the owner out from anywhere else |
| A signed-in operator | Their satellites from any device signed in to them, wherever launched; their Yours (ADR 0015); signing out | Claiming a second handle (`signed-in`): sign out first, so a device is one operator at a time |
| Nobody | | Signing in as an extra (`extras-handle`): their passphrases are random and never kept |

What each sees:

- **Everyone** sees the whole sky, every satellite's callsign, words,
  band and history, every collision named by callsign and handle (ADR
  0010), and how many people heard each beacon (ADR 0016), not who.
- **Only you** see which satellites are yours (`mine`, worked out per
  viewer), your Yours page with its manoeuvre forms and its news of what
  met yours, and the notice that yours burned up while you were away.
  Once you're signed in, "you" is the operator, on any device.
- **Nobody**, through any page or the event stream, sees a cookie, an
  owner, an operator id, a passphrase or its hash, who listened to what,
  or which satellites are the extras' (`toPublic`, `forViewer`; tested in
  `spec/operator.test.ts` and `spec/launch.test.ts`).
- **The app's maintainers**, reading `flyctl logs`, see what follows.

### The record of who did what

One plain line per event on stdout, through `src/lib/log.ts`:
`event key=value ...`. A value that isn't a plain word is quoted with
JSON's escaping, and anything that could break a line or turn it round on
screen (newlines, line separators, controls, bidi marks) is escaped, so
every event is exactly one line, whatever someone typed.

**Who**, on every line about a person: their handle if signed in, else
`anon`, then `#` and the first six hex digits of a SHA-256 of their
cookie (`ada#3f2a1c`, `anon#9d0b7e`). Two people, anonymous or not, read
differently; the cookie, and any slice of it, never appears. The id is
the cookie's, so it's the device's for as long as the device keeps its
cookie: a handle on two devices shows two ids, and claiming, signing in
or signing out gives a device a new cookie, so those lines say who it was
(`who=`) and who it is now (`now=`). `who=` is only ever whoever did
something; a satellite's owner is `owner=` (`a_owner=`, `b_owner=` in a
collision), named as ownership works (ADR 0009): an operator's by the
handle alone (`owner=ada`), since it's theirs on every device, otherwise
by the cookie that launched it (`owner=anon#9d0b7e`). An extra is named
by their owner, `extra:<name>`, so their lines are there and marked, not
hidden; a derelict's or debris's owner is `nobody`, and a satellite that
was never there is `none`.

**Events:**

- `visit`: a new cookie set (a browser seen for the first time), and the
  page it asked for.
- `launch`: who, the satellite's id, callsign, band and words.
  `launch-refused`: who, the reason, and what they tried.
- `deorbit`, `boost` (with the band from and to): who and the satellite.
  `deorbit-refused`, `boost-refused`: who, the satellite, its owner and
  the reason, so "B tried to bring down A's satellite" reads off one
  line. `manoeuvre-refused`: a form that isn't a manoeuvre, or can't be
  read, with what it said.
- `claim`, `sign-in`, `sign-out`, each with who and `now`, and for a
  claim or sign-in how many of the device's satellites became the
  operator's (`took=`); `claim-refused` and `sign-in-refused` with the
  handle tried and the reason, never the passphrase. A handle tried that
  couldn't be a handle (a space, punctuation, too long) is logged only by
  its length (`handle_length=`), in case it's a passphrase typed into the
  wrong box. The record may say `no-such-handle` where the page says
  only "that handle or passphrase isn't right": the page mustn't help
  anyone find handles; the maintainers may know. `operator-refused`: a
  form that can't be read.
- What the server does on its own, each with its own time (`at=`, ISO),
  since a server that was stopped catches up on what happened meanwhile
  and logs it late: `collision` (both objects, their kinds, owners
  and callsigns, debris's source collision, the fragment count),
  `burn-up` (each satellite and derelict, whose and how it ended; a
  settle's debris as one line with a count, since a staged collision
  makes a dozen fragments every few minutes, from the `first` to the
  last, `at`), `staged` (the derelict
  pair, when they'll meet and over which station), `derelict` (one put up
  to keep the sky's floor), and the extras' `launch`, `deorbit` and
  `boost`.

**Each event is logged once**, where it's written to the database: a
collision in its transaction's wake, a burn-up only if this settle is the
one that marked it, an extra's launch only if it wasn't in the record
already. So a restart, which catches up from the record, logs nothing
twice (`spec/log.test.ts`).

**Not logged:** a form posted from another site, which Astro refuses
before any of the app's code runs (logging it would mean replacing
Astro's check with one of our own, which isn't worth the risk); beacons being heard (a line per pass per station would
bury the rest, and "heard by" is already counted); page views by someone
seen before; `console.error`'s errors, which stay as they are, outside
this record.

## Consequences

- Narrating the crit from `flyctl logs`: two profiles are two ids from
  their first `visit`; each launch, manoeuvre and refusal names its
  person; a refusal of someone else's satellite names both.
- The log is now somewhere people's words and handles are kept outside
  the database, for as long as Fly keeps logs. Beacons are public anyway;
  handles too. A refused launch's words are logged even though they were
  never broadcast (a slur, a link): that's what tells the narrator what
  was tried. Nothing that lets anyone act as someone else is logged.
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
