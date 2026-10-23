# Plan: Kessler (working title)

A planning snapshot, not the README. Details get fleshed out later; decisions
that are expensive to reverse go into `doc/adr/` once made. Any agent picking
this up: read this file, then `notes/log.md`, before planning or building.

## Status and next steps

_Last updated 2026-10-23 (`PROCESS.md` marked done, Advay's call. Earlier: a second whole-project review against the spec: an extras test that broke with the clock fixed, the 200 cap tested, the Why page's "real people's words" gone again; the rest listed under C10 for Advay to sort). 2026-10-19 (findings 2 to 8 from the live logs checked: 3 to 6 fixed, 2, 7 and 8 not problems; 1 still open. Earlier: `flyctl logs` watched live; eight findings listed under C10 to evaluate later. Earlier: a `broadcast` line per event sent and a `snapshot` line per stream's opening, ADR 0025 accepted). 2026-10-17 (the CI flake on `main` fixed; `flyctl logs` tried on the real app; README trimmed: SSE named, the no-JavaScript overclaim gone, the extras said; `PROCESS.md` redrafted, CLAUDE.md rules `c89bcbf`). 2026-10-16 (a whole-project review sorted into TODOs and won't-dos, under C10 below; before that, the catalogue pages 25 at a time, with numbered pages and a Rows choice, and its table folds away for the visit so the collisions are a click away). 2026-10-15 (to do: `PROCESS.md` and `README.md` for C10. Earlier: a line per request, and its id on every line inside it, ADR 0024 accepted; errors say who and where. Earlier: listening logged: `listen-open` and `listen-close`; a sky left for another page no longer keeps listening). 2026-10-14: (ADR 0023 accepted: the server's record of who did what. Earlier the same day: C10's logging merged, one stdout line per thing a person does or is refused, and per thing the server does. 2026-10-13: ADR 0022 accepted, who may see and change what; conjunction alerts and dodging dropped: won't do; extras merged, invented people seed the sky, ADR 0021)._

- **C8, done:** idea chosen; the decisions below agreed with Advay; person,
  persistence and real-time settled ("Foundations"), each with a decision
  record in `doc/adr/` (0001–0004; 0002, the person, superseded by 0009).
  2026-10-04: the C8 open questions resolved (scope, overhead, launch flow,
  beacon rules, launch limits, bands); the rest deferred to C9 or later, see
  "Now and later". Stack restored (`618d80a`). C8 slice built (`4be85b1`):
  launchpad, launch rules, the sky chart and catalogue, SSE. First README
  (`7c49d7a`), `PROCESS.md` (`f6bbe13`) and `reflections/crit-8.md`
  (`5ad94df`).
- **C8 cutoff:** Tue 6 Oct 2026, 12:00 (moved from Monday for Labour Day).
- **C9, built (on `main`, merged from branch `C9`):**
  - The sky as a Three.js horizon view over the station (ADR 0005,
    accepted; `f8f7003`), zooming out to the whole planet (`9cc3927`); the
    catalogue on its own page (`455789e`); soft band edges (`baf5342`).
  - The launchpad in Three.js, with a launch that hands off to the sky
    (ADR 0006, accepted; `5c41ccd`).
  - A page explaining Kessler syndrome at `/kessler/` (`356e469`).
  - Orbital decay ending in a burn-up (ADR 0007, accepted; `fb51cae`).
  - Collisions predicted, announced and replayed by the server (ADR 0008,
    accepted; `41f32ef`); launches any number up, one minute apart
    (`5cf1247`).
  - Collisions drawn on every screen, blame traced through lineage, and
    claimable operators (ADRs 0009 and 0010, accepted 2026-10-07;
    `44487ac`).
  - The adversarial review's must-fixes and most should-fixes acted on
    (`2dc518c`); recorded, not fixed: signing out skips the launch gap, and
    no server-side cookie expiry or "sign out everywhere".
  - The catalogue as a filterable, sortable, paged table (`37f104c`); a
    bright collision the view turns to follow (`90dfab9`); the "in orbit"
    notice dropped once that satellite is gone (`811236f`); a nudge towards
    claiming a handle at launch (`487f0a4`), then as a pop-up on arriving
    at the launchpad (once a visit, closable, never a gate; PR #2), since
    moved to open on the first Launch of a visit instead of on arrival.
  - **Deorbiting and boosting** (Advay, 2026-10-07; ADR 0011, accepted;
    `948998e`, review acted on in `e010756` and `f35f752`; PR #3): bring
    your own satellite down in a two-minute descent, with a dialog thanking
    you for keeping the sky clear; or boost it up a band (low to mid, mid
    to high, once) in a 90-second climb. Buttons in the sky's station panel
    only (not the launchpad: too cluttered). No fuel.
  - **Click a satellite or fragment to see its history** (Advay,
    2026-10-07; ADR 0012, accepted; `93f8735`): in the sky, clicking an
    object opens its record, also at `/object/<id>/` and linked from the
    catalogue. Framed as "the sky remembers" (Ostrom: seeing what each
    takes): who launched it, when, any manoeuvre, for debris the collision
    it came from and its roots, how it ended, and **what followed** (its
    fragments, how many are still up, what they destroyed). A live
    satellite's beacon stays hidden (heard only overhead, with a countdown
    to the next pass); once it's gone the beacon is shown as its epitaph;
    its owner always sees their own.
  - **Slower orbits and three ground stations** (Advay, 2026-10-07; ADRs
    0013 and 0014, accepted; `85c97ff`, `67b29a9`; PR #4). Every period
    three times longer, so a beacon is up long enough to read; three
    stations at the Deep Space Network's sites (Canberra, Goldstone,
    Madrid), all heard by everyone, to give the passes back; the sky opens
    on the whole planet with a beacon panel per station, and the horizon
    over any station one click away.
  - Not built, though once listed for C9: conjunction alerts and dodging
    (moved to C10; a maybe since 2026-10-10; won't do since 2026-10-13).
- **Overnight round, 2026-10-07 (branch `claude/nifty-thompson-s7cine`, a
  PR for Advay; not on `main`):** Advay's list after playing with the app,
  each built, tested and logged in `notes/log.md`, the four design changes
  as ADRs **proposed** for him to accept or change:
  - The handle pop-up no longer opens for a launch that would be refused
    (an empty form) (`3b41406`).
  - **Yours** in the catalogue, with each satellite's boost and bring-down;
    every object's history as a **pop-up card** (with its controls if it's
    yours); no controls in the sky's station panel (ADR 0015; `51e1fc0`).
  - **Beacons heard by people** (ADR 0016; `e0db217`): 140 characters, not
    60; who's listening; each pass heard while someone's listening logged,
    with "heard by" counting people; a **Heard** feed beside the sky.
  - **The wreck keeps the words** (ADR 0017; `fd0a0df`): fragments carry
    pieces of both colliding beacons, heard as static; "the wreck says";
    encounters in Yours.
  - **The purpose** (ADR 0018; `248469e`): a question from the stations each day, the
    launchpad's intro rewritten around the why, a Why page (`/why/`), the
    first-launch explainer brought up to date. "A purpose" and "Collisions
    that mean something" below are rewritten as decided.
  - **Adversarial review** (fresh Sonnet reviewer; findings `f262b7e`)
    and five rounds of fixes: "heard" now means on air, by the shared
    turn rule, and counts only people who loaded a page (`1472389`); one
    feed card per wreck, cards never jump, no "no handle" (`855fc08`);
    derelicts carry echoes of gone satellites' last words, and encounters
    are announced (`72a17dd`); the sky's card isn't modal, and an object's
    address is the catalogue with its card popped up (`fe908a4`); the
    question is opt-in and turns at Canberra midnight, the copy matches
    the code, test gaps closed (`262e2b4`). Plus derelicts counted
    together in lineage wording and a bounded feed query (`e0b2562`).
  - **Second adversarial review** (fresh Sonnet reviewer; its
    must-fixes all fixed in one round, `5f14155`, "Review fix 6" in
    `notes/log.md`): a stream counts only from a browser that has loaded
    something here (a new `visitors` table), the 200 cap is drawn at
    random, and people who arrive mid-pass are credited; a 140-character
    line fits the stations on a laptop; a tab opened hidden pauses; the
    derelicts already up get echoes; the encounter notice stays until
    dismissed; on a laptop the sky's card covers the beacons column, not
    the globe; the question's day follows Canberra's clock, summer time
    included.
  - All of it is in
    [PR #7](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/pull/7),
    from `claude/nifty-thompson-s7cine`, for Advay to review.
  - For Advay: accept (or change) ADRs 0015–0018; edit the question list
    (`src/lib/questions.ts`) and the Why page's wording into his own; the
    README is now further out of date (it says 60 characters and "one live
    satellite each", and nothing of being heard, static or the question).
- **The object card, retold (2026-10-08, Advay: "very hard to read and
  understand … detracts from the whole purpose"):** what it is in a line,
  its state as chips, a fragment's words inside the lines they were torn
  from, what happened as a dated timeline (a cascade step by step, never one
  made-up collision), what it led to, and who a chain traces back to
  (`src/lib/chronicle.ts`). Cascades elsewhere (catalogue, Heard feed, sky)
  now read "a chain of collisions involving A, B and C". Opus adversarial
  review acted on. See `notes/log.md`.
- **C9 cutoff:** Mon 12 Oct 2026, 12:00.
- **Next, for C9 (write-ups only; nothing left to build):**
  1. ~~`PROCESS.md`: the C9 part~~ Done 2026-10-10, except the README
     note, left until the README is written.
  2. ~~`reflections/crit-9.md` (Advay's)~~ Done 2026-10-10.
  3. Before the cutoff: `pnpm check` against a fresh build, then preflight.
- **The launchpad fits a desktop (fixed 2026-10-08, at Advay's request):**
  `pnpm test:layout` passes 12 of 12. The notices are one compact box, the
  wait between launches is on the Launch button, each field's rule sits
  beside its name, and the spacing tightens on short screens; the bands
  stay the stacked rows they were (Advay preferred them to side-by-side
  tiles). The tightest case (1440x790, just launched) has 21px to spare.
  Run it after any change to the launchpad or the sky.
- **Staged collisions under the bands (2026-10-09, Advay: collisions felt
  too forced, satellites never burned up; ADR 0019, accepted):** the
  collision staged for a watcher met in the low band's middle, and its
  debris took nearly every low launch (3% burned up, measured). It now
  meets at radius 1.1, under the bands, and keeps its fragments there: low
  launches burn up about 56% of the time, as 0008 intended (`a286df9`).
  **Revised 2026-10-10 after PR 10's test report:** that debris lay where
  every satellite falls to burn up, so a satellite watched through its
  last 40 minutes still almost never burned up; it also broke up the next
  staged pair and set off more collisions than were staged. Now a staged
  collision keeps to itself: it meets at 1.08, its wreck only falls (most
  of it straight into the atmosphere), and it's only sent where nothing
  else gets to its derelicts first and nothing up could meet its debris.
  Measured: no satellite lost to staged material, no staged pair broken
  up, no knock-ons; a watched sky has about 12 collisions an hour, not 25.
  Not committed yet. **Opus review: partly resolved.** The three findings
  are fixed, but natural collisions still destroy most satellites even in
  a quiet sky (about 77% at 2 launches an hour, 95% at a crit), because
  any close pair collides eventually; staging now fires every 5 minutes
  like clockwork (about 85% of what a watcher sees); and the sky's news
  line barely told of a burn-up while collisions kept coming (30 seconds
  at most). Advay chose
  (2026-10-10, ADR 0020, accepted, after a second Opus review): each close
  pair collides at all with a chance of 0.5; staging waits a random 10 to
  15 minutes (5 for someone who has just opened the sky); and the news
  line tells a person's burn-up before a collision that took nobody's
  satellite, or an older one. Measured: 55 to 58% of satellites burn up in
  a quiet sky (was 17 to 23%), a third at a crit (was 7%); a watcher sees
  half as many collisions (about 7 an hour in a quiet sky), but still
  nearly all staged there; every burn-up watched is told (`4e34a4a`).
  Then (Advay, 2026-10-10) someone coming back is told of theirs that
  burned up, on the sky's notice and in Yours, as a collision already
  was (`d85c1db`). Still open: the news line is mostly staged collisions while no
  burn-up is fresh (drop them? their card tells them); the launchpad
  tells no news of yours; crowding only bites once people outnumber the
  derelict floor; `keepDerelicts` counts staged derelicts.
- **Extras (2026-10-12, Advay approved seeding the sky with "fake, but
  realistic users"; ADR 0021, accepted; merged 2026-10-13, PR 13):**
  built on branch `claude/extras` (`df4014c`, then the review's fixes; see
  `notes/log.md`). Invented people launch like anyone so a quiet sky isn't
  empty: fourteen regulars (twelve with handles) with their own hours,
  names and voices, each coming on some days at any hour of theirs, and a
  crowd of one-off visitors without one; about 18 launches a day on a
  Canberra day's rhythm, a fifth answering the day's question, some
  brought down or boosted later; never the same line twice in a day, and
  nothing said that the satellite's card contradicts. Nothing on the page
  tells them apart; the record does (owner `extra:…`, `operators.extra`),
  nobody can sign in as one, and they never listen,
  so "heard by" is still people. They make room for people (none in an
  hour people have launched four in, none in a half-full sky, at most 20
  up), and the sky keeps at least five derelicts. Only a new database
  fills in a day behind it; a deploy starts from the latest thing in the
  record. Rethought from PR 5's resident organisations, which were tuned
  before ADRs 0019 and 0020; measured with `scripts/balance/` (ADR
  0021): in a quiet sky people's satellites burn up 57% of the time (62%
  without extras), and 89% of their passes over a station get a turn on
  air (96.5%); at a crit 29% (31%) and 84% (87%). `EXTRA_CAP` or
  `PER_HOUR` is the dial if being heard less is too much. At the merge
  Advay dropped the PR's README bullet ("An empty sky") and its Why page
  rewording, so the README didn't yet say the sky is seeded and the Why
  page still said "real people's words". The README has said it since
  2026-10-17; the Why page took the PR's wording back on 2026-10-23,
  since `PROCESS.md` says it was fixed. C10's evidence must leave the extras out
  (`isExtra`), and C10's log lines will show the extras' launches and
  manoeuvres alongside people's (their owner is `extra:…`).
- **C10 (week 11; crit 10, "Fly by instruments"), the logging built
  (2026-10-13; merged 2026-10-14 as PR 14):** the spec asks that the app
  **logs who did what, server-side, and the logging outlives the crit**;
  at the crit two of the pod use the deployed app in their own Chrome
  profiles while Advay narrates from `flyctl logs -a <repo>` alone; if the
  logs can't tell them apart, or one can change the other's, that's the
  finding. Built: one plain stdout line per event (`src/lib/log.ts`,
  `event key=value`): `visit`, `launch`, `deorbit`, `boost`, `claim`,
  `sign-in`, `sign-out`, `listen-open` and `listen-close` (2026-10-15:
  each stream, with whether it counts and how many are listening), each refusal as `<event>-refused` with its reason
  (a stranger's manoeuvre names the satellite and its owner), and the
  server's own `collision`, `burn-up`, `staged`, `derelict` and the
  extras' launches and manoeuvres (`who=extra:…`), each with its own time
  and never twice. Who is a handle or `anon` plus six hex digits of a hash
  of the cookie. No passphrases, no cookies, no beacons heard. The record
  is ADR 0023 (accepted 2026-10-14). Rehearsed locally with two
  browser sessions (`notes/log.md`, 2026-10-13). Known gap: a form posted
  from another site is refused by Astro before the app's code runs, so it
  isn't logged. ADR 0023's list of events predates the listen lines; it's
  accepted, so it isn't edited (they follow its format and its `who`).
  Found through them and fixed the same day: a sky page left for another
  stayed in Chrome's back/forward cache with its stream open, still
  counted as listening; it now closes on `pagehide`. 2026-10-15, after
  the week 10 lecture's "reading a request log": a `request` line per
  request (who, method, path, status, ms), each line written while
  serving one tagged with its six-hex id (`[3f9a1c] launch ...`), and
  errors as `error` lines saying who and where; ADR 0024, accepted,
  supersedes 0023's page views, errors and line shape, and lists the
  listen lines.
  - What each person may see and change, **checked on the server and
    written down with why**, is ADR 0022 (accepted 2026-10-13): one record
    of who may do and see what, and what the server refuses. The checks
    were already in place; tests added for the gaps (a stranger's boost, a
    device after it signs out, a signed-in operator and an anonymous
    visitor each refused the other's). The log names the same refusals
    (`not-yours` and the rest), plus `gone` for your own satellite no
    longer in orbit, and reserves the handles `anon`, `nobody`, `none` and
    `extra` (ADR 0023).
  - **Done (2026-10-17):** `flyctl logs -a comp4020-final-am167` against
    the real app shows the request lines with their ids, and opening
    `/api/events` gave `listen-open` and `listen-close`; no launch tried
    there. `reflections/crit-10.md` is written.
  - **Done (2026-10-17):** `PROCESS.md` redrafted to about 1,200 words
    (Advay's cap: 1,100 plus 10%) with the extras and a position on the
    readings (`3ba6956`); three repeated corrections made rules in
    CLAUDE.md (`c89bcbf`). ~~**To do:** Advay rewrites `PROCESS.md` in
    their own words.~~ Done (Advay, 2026-10-23).
  - **Review of the whole project (2026-10-16), sorted by Advay.** The
    gates pass (`pnpm check` 424, `pnpm test:layout` 12 of 12,
    `pnpm check:evidence`), and multi-user, real-time and persistence held
    in a live two-session test and a restart. Against the brief:
    - ~~`PROCESS.md` over length~~: done 2026-10-17, above.
    - ~~The README's "within a second, even without JavaScript"
      overclaim, "Crit 9 version.", and SSE unnamed~~: done 2026-10-17;
      the README now names the server-sent events stream and says only
      launching works without JavaScript.
    - **Changed from won't fix (2026-10-17):** the README now says the sky
      is seeded with the extras, since `PROCESS.md` cites it doing so.
    - **Won't fix:** the README's "Kessler does no moderation" beside the
      word blocklist and link filter in `src/lib/launch.ts`; and "launch
      counts per band will show it", with no count made yet.
  - **Review of the whole project (2026-10-23), against the spec, focused
    on `PROCESS.md`, the README and "good"** (`notes/log.md`). Fixed: an
    extras test that went red on some hours of the clock (its "latest
    thing in the record" counted launches only; the server also counts
    manoeuvres, collisions and heard beacons); the README's tested "at
    most 200 satellites up", which had no test; the Why page's "real
    people's words", which `PROCESS.md` said was fixed; two broken
    sentences in `PROCESS.md`; "each station" in the README. **For Advay
    to sort, in their words:**
    - The cost in "Being heard more has a cost" only shows at crit
      density. Measured (12 runs each): in a quiet sky low satellites burn
      up 78% of the time and high ones 34%, and everyone low makes fewer
      collisions than everyone high (0.44 against 0.75 an hour). At a
      crit, everyone low makes 6.1 to everyone high's 3.9, and passes with
      a turn on air fall from 99.8% to 82%. A watcher's collisions are
      nine in ten staged.
    - The good argument's visibility has little to show: a launch without
      a handle is recorded as "launched without a handle"; nobody can
      reply, report or sanction (live-log finding 1); Ostrom's monitoring
      is one of eight design principles; Kazemi is cited beside "no
      moderation"; the extras shape the record a visitor reads.
    - "What good means here" doesn't say what a good outcome would be,
      and the judged section reports no judgement; the 19 Oct logs could
      count launches per band, deorbits and handles claimed.
    - ~~`PROCESS.md` has no crit 10 section and is 1,271 words, over the
      1,210 cap.~~ Done (Advay, 2026-10-23): `PROCESS.md` marked done.
    - Two date-dependent extras tests in a week (`fb18419`, and this one):
      maybe a CLAUDE.md rule.
  - **CI on `main` (2026-10-17):** the 17 Oct run failed in
    `spec/manoeuvre-http.test.ts` (sign-out, then sign-in on another
    device) because another test's satellite collided with this one
    mid-test, so its boost was refused as `gone`; the test now accepts
    `gone`, which the server gives only to the owner. The 15 Oct failures
    were the extras log test, fixed in `fb18419`.
  - Aggregate figures (launches per band, collisions, deorbits, several
    cookies per human) can be counted from these lines if wanted.
  - **To evaluate later: what `flyctl logs` showed (2026-10-19, 02:57 to
    03:53 UTC).** Three cold starts and up to five on the sky at once, with
    no errors, warnings or crashes; only refused launches gave a 422. Read
    from the logs; 2 to 8 since checked against the code (2026-10-19,
    each marked):
    1. **Beacons the blocklist misses.** "Dick Cheese" got through (sat
       1267) while "fuck this shit" was refused; a joke "DoS attack /
       uranium enrichment" beacon went up too (sat 1277). Nothing lets a
       person report a satellite or take one down.
    2. **Markup in beacons.** `<script> console.log("hi")</script>` was
       refused only as a link (`console.log` reads as a domain), so a tag
       with no dotted word likely passes. Check beacons are escaped on the
       sky, the panel and the catalogue (`set:html`, `innerHTML`).
       **Not a problem:** a launched `<b>…</b> <img onerror…>` beacon shows
       as text on the sky, the panel and the catalogue; Astro escapes it,
       the sky's JSON escapes `<`, and the scripts set beacons as text.
    3. **The sky loads twice after a launch.** Most launches logged
       `GET /sky/` twice, 6 to 7 s apart, and `/api/events` opened only on
       the second. Possibly the launch hand-off (ADR 0006); confirm it's
       meant. **Fixed:** the launchpad prefetched the sky while the launch
       played, but the page is `no-store`, so it was rendered twice; the
       prefetch is gone.
    4. **Request ids on background lines.** `heard`, `collision`,
       `burn-up` and `decay` lines carry the id of whichever request set
       off the check, often a stream already closed, so tracing by id
       misleads (ADR 0024). **Fixed:** the server's timers (the ear, the
       wake-up, the audience's recount) run outside any request, as 0024
       says (`onItsOwn`).
    5. **Conjunctions broadcast again after each cold start.** The same
       pairs (1214/1231, 1169/1238) were announced at 03:32 and 03:46.
       **Fixed:** a server's first look only notes pairs whose objects were
       both up before it started; pages get them in their snapshot.
    6. **The catalogue is the slow page:** 58 to 155 ms, against under
       10 ms for the rest. **Fixed:** its 50 collisions looked up each
       object with a freshly built query; prepared once, that's 2.4 ms, not
       13.6 ms, locally.
    7. **Snapshot counts look capped:** `collisions=5` and `heard=30` in
       every snapshot, through new collisions. Wrong if shown as totals.
       **Not a problem:** the snapshot sends the latest 5 collisions and 30
       heard beacons, and the line counts what it sent (ADR 0025).
    8. **Launch before snapshot.** A newcomer's stream gets the staged
       pair's `launch` and `conjunction` events before its `snapshot`,
       which already holds them; check the sky doesn't draw them twice.
       **Not a problem:** the sky keeps both by id, so the second is the
       same entry set again.
- ~~**Later:** the README rewrite in Advay's words~~: done, per the
  2026-10-16 review; trimmed for the brief 2026-10-17.
- **Never deploy, flip public or commit without Advay's say-so** (CLAUDE.md).

## The idea

One shared low orbit that everyone uses and nobody owns. Visitors launch
satellites into it, and every choice that makes sense on its own pushes the sky
towards a Kessler cascade: a collision makes debris, debris causes more
collisions, and eventually orbit is unusable for everyone.

The argument: space is the newest commons (Hardin 1968, Ostrom 1990), and the
attention economy is an old one. People launch to be seen, crowd the orbits
where they're seen most, and the debris is a cost nobody pays for directly.

Since 2026-10-07 (ADRs 0016–0018) the words carry the argument as much as
the orbits: a beacon is heard by the people present, a collision breaks
two people's words into static everyone hears around, and the question the
app leaves each visitor with is **what's worth saying, if saying it costs
everyone a little?** See "What Kessler is for" below.

## Core loop

1. **Launch.** As many satellites as you like, one minute apart. Pick an altitude band and a
   callsign, and write a beacon of up to 140 characters, answering the
   stations' question of the day or not (ADR 0016, 0018).
2. **Be heard.** Every time your satellite passes over one of the three
   ground stations, its beacon is heard by everyone listening (with the sky
   open) at that moment; the stations log it, and it counts who heard it.
3. **Listen.** Your being here is everyone else's audience. The sky page is
   the sky and, beside it, what the stations hear and have heard.
4. **Share the sky.** Satellites and debris follow deterministic orbits.
5. **Collide.** Two objects that meet become a cloud of fragments carrying
   pieces of both beacons, heard as static, and those fragments can hit
   other objects (ADR 0017). Both owners find the encounter in Yours.
6. **Deorbit or boost (optional).** An owner can bring their own satellite
   down on purpose, giving up their beacon to leave the sky cleaner, or
   boost it up a band once.

## Decisions so far

| Question | Decision |
|---|---|
| Incentive (why launch?) | **Beacon** first: your satellite carries one short line, shown to everyone when it passes overhead. **Some Light** too: each satellite leaves a faint coloured trail, so the sky is also a shared light picture that debris scratches grey. |
| Ending | **No reset; the sky decays.** Orbital decay slowly pulls everything down, satellites and debris alike. Low orbits decay fast, high orbits slowly, so the sky heals over time but a bad cascade takes a long while to clear. |
| Dimension | **2D** orbital chart: clearer, lighter on mobile, easier to make accessible than 3D. |
| Deorbiting | **Allowed** for your own satellite. Debris can't be cleaned up by anyone. |
| C8 scope (2026-10-04) | **Proof of life + SSE:** launch, persist, orbits drawn, launches appear live in other sessions. Collisions, debris, decay and deorbiting move to C9. The C8 brief only asks for proof of life ("the real-time layer and the polish can all wait"); SSE is kept to build the event plumbing early. |
| Overhead (2026-10-07, ADR 0014, accepted) | **Three ground stations** at the Deep Space Network's sites (Canberra, Goldstone, Madrid), all heard by everyone, so everyone still reads the same line at the same moment. The sky opens on the whole planet; the horizon over any station is a click away. Replaces the row below. |
| ~~Overhead (2026-10-04)~~ | ~~**One shared ground station**~~, a fixed point on the planet. A beacon shows to everyone when its satellite crosses that arc, so everyone reads the same line at the same moment. The station is the launchpad. |
| Launch flow (2026-10-04) | The landing page is the **launchpad** with the launch form. Launching plays a rocket rising, then the camera **pans up** into the orbit view and the new satellite appears. C8 gets a simple version of the pan; the cinematic version is week 12 polish. Without JS the form still posts and redirects to the orbit view. |
| ~~Beacon rules (2026-10-04)~~ | ~~**At most 60 characters**~~, plain text, no URLs, a small word blocklist. Shown in the sky while the satellite is live; the catalogue keeps it after. Length replaced by the row below. |
| Beacon length (2026-10-07, ADR 0016, accepted) | **140 characters**: a thought, not a slogan, readable in the dozen seconds a low satellite is over a station. Several overhead take turns sized to the line (4 to 10 s). |
| Heard by people (2026-10-07, ADR 0016, accepted) | **A pass over a station while people have the sky open is heard**: logged, and each listener who isn't the owner counted once ("heard by", people not tabs; cookies hashed). A **Heard** feed beside the sky; who's listening now. A beacon is public in the feed once heard (ADR 0012's withholding until it's gone is relaxed). |
| The wreck keeps the words (2026-10-07, ADR 0017, accepted) | **Each fragment carries a run of words from each colliding line**, heard over the stations as static; "the wreck says" fades as fragments burn up; each owner gets the encounter in Yours. Replaces "fragments carrying words can come later". |
| Question of the day (2026-10-07, ADR 0018, accepted) | **The stations ask one question a day** (fixed list, `src/lib/questions.ts`, turning at midnight in Canberra); a beacon can answer it (a box to tick, not ticked by default). Two answers that collide say so. |
| Managing yours (2026-10-07, ADR 0015, accepted) | **Boost and bring down from Yours (`/catalogue/?show=mine`) and from each satellite's pop-up card**, never the station panel. Every object's history pops up as a card. |
| Launch limits (2026-10-04) | ~~One live satellite per person, plus a cooldown~~ (starting at 10 minutes) after your satellite dies or is deorbited, so relaunching costs something. Replaced 2026-10-06, below. |
| Launch limits (2026-10-06) | **Any number up, one minute apart** (first a minute; Advay set five the same day, after one person launching nonstop took the sky from 2 collisions an hour to 60, and three filled it to its cap). Advay: "someone can send more satellites to send more messages but increase the risk of ruining it for all". Each launch is another beacon heard and another object everyone shares the sky with; the gap is between your launches, not after one dies. The sky cap (200 satellites) stays as the machine's backstop. Replaces "one each keeps it fair" (ADR 0002, superseded): the commons is now tested by how much each person takes, not rationed. |
| Collisions scale with satellites (2026-10-06) | **A requirement from Advay:** the more satellites up, the more collisions. The model does this (more than linearly, the shape of a real cascade): measured with people's satellites held steady, 0 or 5 people up give 1 to 4 collisions an hour (the derelict floor of 20 dominates), 20 give about 20, 50 give about 130. Advay kept the floor at 20 (asked 2026-10-06), so the rise only shows once people outnumber it. Re-check whenever the tuning changes. **Re-checked 2026-10-10** with a close pair colliding at all half the time (ADR 0020): 0, 5, 20, 40 and 50 people's satellites held up give 0.1, 0.2, 0.6, 3.9 and 11.9 collisions an hour (0, 5, 20 and 50 gave 1.7, 0.5, 4.8 and 126 just before it): still rising, steeply once people outnumber the floor, but no longer a runaway. |
| Sky cap (2026-10-04) | **At most 200 satellites in orbit at once**; launches are refused while it's full. Added after review: nothing leaves the sky in C8 and a cookieless client can launch without limit, so this protects the 256 MB machine. Revisit with decay in C9. |
| Catalogue (2026-10-04) | **The "In orbit" table shows callsigns, not beacons.** A beacon is only heard as its satellite passes over the station, so flying low (heard more often) stays worth it. The reviewer pointed out that a permanent list of beacons made "be seen" pointless. |
| Catalogue page (2026-10-05) | **The sky page keeps a short "Sky now" card; the full table moves to `/catalogue/`.** The card has counts per band and the latest launches, live; the catalogue lists what's in orbit or everything ever launched (a plain link), and is where debris and its lineage go. The table under the sky made the page scroll too far, and debris would make it far longer. The card is also where collisions out of view will be announced. |
| Bands (2026-10-04) | **Three bands (low, mid, high) with jitter:** you pick a band, the server picks a random radius and phase inside it, so orbits aren't identical. |
| Decay (2026-10-06, ADR 0007) | **Closed form, then a burn-up.** radius³ falls at one steady rate, so an orbit falls slowly, then faster; from the low band's middle it lasts 4 hours, the mid's about 17 hours, the high's about 2 days (across each band's reach: 1–8 h, 9–27 h, 31 h–3 days). Shortened from a day / a week / two months on 2026-10-06: the high band has to clear within a few days. At 1.06 planet radii it plunges for 30 seconds and burns up, drawn as a real re-entry. Positions stay a pure function of orbit and clock, so nothing new is stored or sent. |
| Slower orbits (2026-10-07, ADR 0013, accepted) | **Every period three times longer**: low middle every 3 minutes, mid about 8, high 24, so a low beacon is up about 12 seconds, not 4. Head-on collision chance tripled to keep collisions per hour; decay unchanged; orbits already up retimed once, in place. |
| Bands as ranges (2026-10-06, ADR 0007) | **One period for each height** (low middle once a minute, high middle every eight; mid now 2.7 min; all three times longer since ADR 0013), and the bands meet at 1.5 and 2.05, so every height is in one band. Counts on the sky page are by where objects are now. |
| Collision geometry (2026-10-06) | **Mixed directions, plus near misses.** Orbits are flat and the period depends only on height, so two objects going the same way at the same height never close in, and decay keeps the gap in radius³ fixed. So each object gets a direction (prograde or retrograde): opposite-direction objects at similar heights cross head-on twice a lap. Same-direction objects can still collide when one creeps up on another within a (larger) hit distance. Rejected: hidden 3D inclinations (rewrites the rendering). Needs a decision record. |
| Collision mechanics (2026-10-06, draft) | **Predicted by the server, broadcast ahead.** Positions are closed-form, so the server solves each pair's next crossing, keeps a queue of upcoming hits and sets a timer for the next (as decay does for burn-ups). A `conjunction` event gives every screen the impact time in advance, so all screens draw it at the same moment. At impact both objects are `destroyed` and seeded fragments spawn near the point, mostly keeping their parent's direction, so a head-on hit leaves debris going both ways. Catch-up after a restart runs the queue forward in time order (decays and collisions, new debris colliding inside the gap). New `collisions` table; `objects` gains direction and source collision (the lineage of ADR 0003). |
| Seeding (2026-10-06) | **The server keeps a baseline of derelicts**: dead, ownerless satellites and old debris, as real orbit has, so collisions can happen when only the marker's two sessions are open. |
| Extras (2026-10-12, ADR 0021, accepted) | **Invented people launch like anyone**, so a quiet sky isn't empty: regulars and one-off visitors, about 18 launches a day at Canberra's hours, answering the day's question, never repeating themselves in a day. Not marked on the page; the record knows (`extra:` owners), and the README says so. They don't listen ("heard by" stays people) and make room for people (none in an hour people launched four in). At least five derelicts kept. Rethought from PR 5's resident organisations. |
| Identity (2026-10-06) | **Optional claim on top of the cookie.** You still launch anonymously within seconds (ADR 0002's reason holds); you can claim a unique operator handle with a passphrase, which keeps your record and blame across devices. No email, no personal data; passphrases hashed with Node's `scrypt`. Supersedes ADR 0002, so needs a new record. Rejected: required sign-up (marker friction), GitHub OAuth (secrets, personal data, marker needs an account), handle without a password (no cross-device). |
| Blame (2026-10-06) | **Worked out from lineage, not stored.** Every fragment traces through its collision to the satellites at the root; their operators are who to blame. |
| C9 scope (2026-10-06) | **Collisions + login.** Collisions, debris, lineage and blame by operator, and the optional claim. Conjunction alerts and dodging wait for C10. The C9 written decision is who sees the blame (ADR 0010). |
| Band edges (2026-10-05) | **Soft edges:** the radius is drawn from a bell curve around the band's middle, so about one launch in eight lands past the band's edges, but never far enough to reach a neighbouring band. The bands are drawn as soft glows to match. |

## The altitude trade-off

| Band | Benefit | Cost |
|---|---|---|
| Low | Passes overhead often, so the beacon is read more | Drag brings it down fast; crowded |
| High | Lasts much longer | Rarely overhead; its debris lingers far longer |

Bands are chosen (three, with jitter; see the table above). Starting values,
in units of the planet's radius, to tune once the sim runs: low r 1.2–1.4,
period about 1 minute; mid r 1.6–1.9, about 3 minutes; high r 2.2–2.6, about 8
minutes (mid is now 2.7 minutes: one period law for every height, ADR 0007).
Decay: about 4 hours from the low band's middle, 17 hours from the mid's,
2 days from the high's; 1 to 8 hours, 9 to 27 hours and 31 hours to 3 days
across each band.

## Co-presence

- Launches, collisions and fragment clouds appear on every open screen at once.
- **Who caused it** (the C9 decision, ADR 0010): every screen names the
  operators behind a collision, traced through lineage.
- **Being heard needs others here** (ADR 0016): a beacon is heard only by
  the people who have the sky open as it passes over a station, and each
  is counted; the sky page says how many are listening now. Your presence
  is someone else's audience.
- ~~**Conjunction alerts** (C10, a maybe; once the likely C9 decision, replaced by ADR
  0010 when dodging moved out): when two satellites are on a
  collision course, both owners are warned and either can spend limited fuel to
  dodge. If both are online, who moves? If an owner is offline, they can't
  dodge, so being absent makes you vulnerable. (Precedent: ESA moving Aeolus
  for a Starlink satellite in 2019.)~~ **Won't do** (Advay, 2026-10-13): "it
  defeats the whole purpose." Collisions stay something nobody can step out
  of; deorbiting and boosting are the only manoeuvres.

## Foundations: person, persistence, real-time

Agreed 2026-10-03, answering the week 8 lecture's three questions. Each is a
decision record in `doc/adr/` (index: `doc/adr/README.md`); this section is the
summary, the records are the source of truth.

| Question | Decision | Record |
|---|---|---|
| Stack | Astro on Node, SQLite via Drizzle on `/data` | `0001-astro-and-sqlite-stack.md` |
| What counts as a person | An anonymous cookie, plus an operator handle you can claim with a passphrase | `0009-an-operator-you-can-claim.md` (supersedes `0002-a-person-is-an-anonymous-cookie.md`) |
| What persists | The sky decays, every object's record stays forever | `0003-the-sky-decays-the-record-stays.md` |
| How a change reaches everyone | SSE events; the server's clock is the only clock | `0004-server-sent-events-and-one-clock.md` |

### What counts as a person

_The C8 decision, kept as history: superseded by ADR 0009 (accepted
2026-10-07), which keeps the cookie and adds an operator you can claim, and
by the launch limits of 2026-10-06 (any number up, one minute apart)._

**An anonymous browser cookie, plus the callsign you pick at launch.**

- A random id in a long-lived, `httpOnly` cookie, set on first visit. No
  sign-up, so a stranger can launch within seconds.
- One active satellite per cookie. The callsign is chosen per launch.
- Accepted cost: a new browser or cleared cookies makes a new person, so one
  human can hold several satellites and loses control of the old one. This
  loophole is deliberate for now; the logs (C10) will show whether it's abused.
  Rejected: a recovery code (extra step, still doesn't stop extra browsers) and
  real accounts (friction kills a stranger's first try; holds personal data).

### What persists

**The sky decays, the record stays.**

- Live objects (satellites and debris) leave the sky through orbital decay,
  deorbiting or collisions.
- Every object's row is kept forever as the catalogue: launch time, owner
  cookie, callsign, beacon, band, fate (`live`, `decayed`, `deorbited`,
  `destroyed`) and, for debris, the collision it came from. The sky heals; the
  history (and the blame) doesn't.
- The server stores the last time it simulated up to, so it can replay the gap
  after the machine has been stopped.
- Rejected: deleting decayed objects (no lineage, nothing for C10) and keeping
  only counts (loses "who caused this", which is the argument).
- Beacon text is kept forever, so it has a rule: 60 characters, plain text,
  no URLs, a blocklist (2026-10-04); once a satellite is gone its beacon is
  shown as its epitaph (ADR 0012).

### How a change reaches everyone

**Server-sent events, with the server's clock as the only clock.**

- Actions go up as ordinary `POST`s (forms that work without JavaScript).
- Events come down one SSE stream: launch, deorbit, collision, decay.
  Positions are never sent: each client draws them
  from the stored orbits and the server time, after measuring its clock offset
  when the stream connects.
- On reconnect, the client catches up from a snapshot of the live sky.
- Rejected: WebSockets (two-way isn't needed; traffic is almost all
  server-to-client) and polling (wasteful, and on the edge of "about a
  second").

### Expiry, history and visibility

- **What expires:** everything in the sky, through orbital decay at rates set
  by altitude.
- **History:** the public catalogue above. Each fragment traces back to the
  collision that made it and who launched what was involved.
- **Visibility:** open. Every screen, the catalogue and each object's record
  name the operators whose satellites a collision traces back to (ADR 0010).
- **What we chose not to build:** debris cleanup, a reset, accounts, and any
  channel to talk to other operators beyond beacons and alerts.

## Technical shape

- Stack (ADR 0001): server-rendered Astro on Node, SQLite on `/data` via
  Drizzle with migrations run at boot. SSE for every change (ADR 0004).
- Orbits are stored as elements plus a start time, so any object's position at
  any moment is a pure function of time.
- Collision checks run on the server. Fly stops an idle machine, so on boot
  the server replays the time it missed in fixed steps and applies any
  collisions that fell in the gap. A restart and an uninterrupted run produce
  the same sky.
- The event fan-out is in memory in the one Node process (fine on one machine).
- The server keeps live objects in memory for collision checks, so 256 MB caps
  the sky's size.
- The canvas is the spectacle. Every action (launch, boost, deorbit) is also a
  normal form control, and the catalogue is a real table.

## Testable claims (draft)

- A launch in one session appears in another within about a second.
- The same object at the same moment is in the same position in every session
  and after a restart.
- A collision produces debris, and every fragment has a catalogue entry
  tracing it to its source.
- Decay follows the documented rates; debris that hasn't decayed yet survives
  a restart.
- Stopping the server and restarting applies the collisions that fell in the
  gap.
- Launches one minute apart per person; only the owner can deorbit or
  boost.

## Now and later

### C8 (week 9, cutoff Tue 6 Oct 12:00): building now

- Stack set up (Astro, SQLite/Drizzle on `/data`, migrations at boot).
- Anonymous person cookie (ADR 0002).
- Landing page = launchpad: form with band, callsign and beacon (rules
  above). One live satellite per person; cooldown stored but only matters
  once satellites can die.
- Launch stores the satellite (band, jittered radius, phase, launch time).
- Simple launch animation and camera pan up to the 2D orbit view; the new
  satellite is highlighted.
- Orbit view draws every live satellite from its stored elements and the
  server clock.
- Beacon shows when a satellite crosses the shared ground station.
- SSE: a launch appears in every open session within about a second;
  reconnect catches up from a snapshot.
- First `README.md`, served at `/readme/`; `PROCESS.md`; `reflections/crit-8.md`.
- Deployed to Fly (only when Advay says so).

### Later

- **Adopted for the sky in C9 (2026-10-05, ADR 0005):** a horizon view
  through an orthographic camera; the launch and collision effects are still
  to do.
- **Visuals (week 12, maybe sooner): Three.js** (Advay, 2026-10-04) for the
  striking version of the sky and the launch: glow, light trails, collision
  bursts. Not for C8; the chart is a 2D canvas for now. It doesn't have to
  undo the 2D decision (an orthographic camera keeps the chart flat), but it
  weighs against the reasons 2D was chosen (light on mobile, accessible), so
  it gets a decision record when it's adopted. The orbit maths in
  `src/lib/orbit.ts` is renderer-agnostic, so swapping the canvas for Three.js
  only touches the drawing code.
- **C9 (week 10), built:** server-side collisions making debris, boot-time
  replay of missed time, orbital decay, deorbiting your own satellite (the
  cooldown became a one-minute gap between launches). Conjunction alerts
  and dodging with fuel moved to C10. See "Status and next steps".
- **A page explaining Kessler syndrome (added 2026-10-06; built
  2026-10-06).** People Advay has shown the app to don't know what Kessler
  syndrome is, so the name and the argument don't land. A short plain-language
  page at `/kessler/`: what it is, how one collision makes the debris
  that causes the next, the real cases (the 2007 FY-1C test, the 2009
  Iridium 33 / Kosmos-2251 collision), why it's a commons problem, and how
  the app's mechanics map onto it, with "not built yet" on collisions, decay,
  deorbiting and lineage. Linked from the nav, the launchpad and the sky.
  The launchpad's intro now carries a one-line explanation ("in a crowded
  orbit one collision can set off the next: Kessler syndrome"), for Advay to
  confirm. The "not built yet" tags are gone now that all four are built.
- ~~**Seeing a burn-up on demand (added 2026-10-06, for later).**~~ Won't do
  (Advay, 2026-10-10): PR 10's balancing addressed it. Most satellites now
  burn up (ADR 0020), the sky's news tells a burn-up first, and someone
  coming back is told theirs burned up (`d85c1db`). The original note: the shortest
  lifetime is hours and everyone has one satellite, so a visitor (or a
  marker) only sees a re-entry if someone else's falls while they watch.
  Ideas: replay the latest burn-up on request, or a short "watch the last
  re-entry" clip from the sky page. Not decided; see ADR 0007.
- **Boosting a satellite (added 2026-10-06; built 2026-10-07, ADR 0011).**
  The other half of deorbiting: an owner raises their own orbit one band,
  once, to stay up longer. No fuel; a boost is a new epoch for that object.
- **C10 (week 11), sorted 2026-10-10 (Advay):** server-side logs will be
  done; first framed as evidence (launches per band, collisions, deorbits,
  leaving the extras out, ADR 0021), reframed 2026-10-12 against the crit
  10 spec as a live record of who did what (see "Status and next steps").
  Won't do: conjunction alerts and dodging with fuel (moved from C9;
  dropped 2026-10-13, see "Co-presence").
  Seeding the sky: built as the extras (2026-10-12, ADR 0021; merged
  2026-10-13). Won't do: seeing a burn-up on demand. The catalogue's
  lineage was built in C9.
- **Week 12:** visual polish (light trails, collision effects), README and
  PROCESS write-up.

## Sources to read

- Kessler & Cour-Palais (1978), the original cascade paper
- 2009 Iridium 33 / Kosmos-2251 collision
- 2007 Chinese anti-satellite test (FY-1C)
- ESA Space Environment Report
- FCC five-year deorbit rule (2022)
- Hardin (1968); Ostrom (1990)
- *Stuff in Space* (visual reference)

## Design direction (from Advay)

- Visually striking and thought-provoking: the mechanics should embody an
  argument, not decorate a utility.
- No proposing or voting on rules; governance comes only from what people can
  see and choose for their own satellite.
- Avoid overlap with classmates' public finals, notably Constellation (people
  as stars joined by declared connections) and The Garden (grows only while
  people are present together).

## Collisions that mean something

_Added 2026-10-06 at Advay's request; the couplet built for C9; explored
again and decided 2026-10-07 (ADR 0017, proposed), after Advay (and the
marker) said the couplet hadn't met it._

Why the couplet fell short: it framed a random pairing and then nothing
changed. Both lines died with their satellites, the fragments were
anonymous dots, and the two people never learned anything of each other.
The collision is the one moment two strangers' words touch here, and it
left no mark on either.

Options weighed (the record is ADR 0017):

- **The couplet** (built in C9): both beacons side by side. A
  juxtaposition, not a connection.
- **Aim at a satellite** (a "reply" launch onto a crossing orbit):
  rejected twice. It makes a collision chosen, which breaks the argument
  (debris as a cost nobody meant to cause), and drifts towards
  Constellation's declared connections.
- **Collide by meaning** (similar lines likelier to meet): the server
  judging text, opaquely. A trick.
- **The wreck keeps the words** (built): each fragment carries a run of
  words from each line, every word of both surviving once, paired with
  pieces of the other; a cut-up neither person wrote. Cascades carry words
  on down the lineage.
- **The wreck keeps talking** (built): fragments with words are heard as
  static at the stations, taking turns over everyone else's beacons, and
  appear in the feed. Crowding costs airtime, not only satellites.
- **The wreck falls silent as the sky heals** (built): "the wreck says"
  fades each piece as its fragment burns up.
- **An encounter** (built): both owners find the collision in Yours: who
  they met, what that person said, what the wreck says. The only way you
  meet a stranger here.
- **Thematic as well as causal** (built with the question, ADR 0018): two
  answers to the same day's question that collide are told as such.

Settled on the old questions: the connection is causal (and thematic only
through the question, which nobody judges); the filter runs on every
shard; fragments' words are one nullable column (`objects.words`).

## What Kessler is for

_Added 2026-10-06 as "A purpose" (three ideas Advay liked); decided and
fleshed out 2026-10-07 at his request (ADRs 0016–0018, proposed). The long
version for visitors is the Why page, `/why/`; the launchpad says it in
four lines._

The why has two halves. The app used to say only the second.

**For a visitor: why launch, why stay, why come back.**

1. **Say one thing to the people who are here.** 140 characters on a
   satellite, heard by whoever has the sky open each time it passes over a
   station, all at once. Not a feed you scroll alone: a moment shared with
   whoever is present.
2. **Be heard, counted.** Each beacon says how many different people have
   heard it ("heard by"), and nobody can raise their own. Being heard needs
   other people to be here at the same time.
3. **Listen.** The sky is also a radio. Your being here is everyone else's
   audience; a line passing over a station with nobody listening isn't
   heard at all.
4. **Answer the question.** One a day from the stations, a prompt to write
   to and a topic shared by everyone that day; tomorrow there's another.
5. **Decide what your words cost.** Every launch crowds a sky everyone
   shares; the low band is heard most and crowds fastest; a collision
   breaks your words into a stranger's and leaves them as static over
   everyone else's. Bringing yours down keeps the sky readable.
6. **Meet someone, the only way you can.** No chat, no replies: a
   collision is the only way your words ever touch a stranger's, and you
   find who you met in Yours.

**For the project: the argument.** Attention is a commons. A post costs
nothing to make and takes a little of a shared, finite thing (the room to
be heard), and nobody pays for that directly, so it's overused (Hardin
1968). Low orbit is the newest commons and fills the same way (Kessler and
Cour-Palais 1978). Kessler makes the cost physical: words take up orbit,
crowding makes collisions, and collisions turn words into noise made of
real people's words, torn out of context and mixed with a stranger's. No
rules to vote on and no moderator; what keeps the sky usable is what
everyone can see (who launched what, who's been heard, what each launch
went on to cost, traced through lineage) and what each person does with
their own satellites (Ostrom 1990).

The question it leaves each visitor with: **what's worth saying, if saying
it costs everyone a little?**

Settled from the old list of things to ponder:

- "Heard by" counts **people**: an operator, or a hashed cookie, once per
  satellite; tabs don't count twice; a new browser still does (ADR 0009's
  known cost). It's shown to everyone, on every beacon, since a social
  space's audience is public; the owner can't raise their own.
- **Debris takes airtime** by taking turns like a beacon, sized to its
  words; a cascade fills the stations with static until it burns up (hours
  in the low band). Watch whether that's too much once real people use it.
- **Questions** are a fixed list in the code for Advay to edit; beacons
  may ignore them (a box to tick, not ticked for you).
- Left out still: a shared sky-health number on every screen.

## Open questions

Resolved 2026-10-04 (now in "Decisions so far"): C8 scope, overhead, launch
flow, beacon rules, launch limits, bands.

- **C9 (settled 2026-10-06):** the written decision is **who sees the
  blame** (every screen live, the catalogue, or only you; the answer itself
  goes in its record); **the server picks direction at random**, like
  height and phase; signing in on a device with its own live satellite
  **merges** it into the operator's record (no new launch until both are
  gone); a collision shows **both beacons as a couplet** on every screen
  and in the catalogue, and fragments carrying words can come later as a
  nullable column.
- **C9, tuned 2026-10-06 (ADR 0008):** a floor of 20 satellites and
  derelicts, topped up at most one every 10 minutes; 3 fragments per
  satellite, none from debris; a 2% chance a meeting; debris decays like
  everything else. Advay chose the gentler rate: 1 to 5 collisions an hour
  in a quiet sky, about half of satellites burning up before a hit.
- ~~**C9:** collision radius~~: settled in ADR 0008 (hit distance and a 2%
  chance a meeting), with the head-on chance tripled in ADR 0013 to keep
  collisions per hour once orbits slowed.
- ~~**C10, a maybe:** how fuel works, and whether it refills (moved with dodging;
  boosting needs none)~~: moot, dodging won't be built (2026-10-13).
- ~~**C10, a maybe:** whether to seed the sky with launches the server makes (resident
  operators, PR 5, closed 2026-10-10 with its commits kept on the PR)~~:
  yes, as invented people rather than organisations, rethought against
  ADRs 0019 and 0020 (Advay, 2026-10-12; ADR 0021).
- ~~**C9:** exact cooldown length~~: replaced by a one-minute gap between
  launches (2026-10-06).
- ~~**Week 12 (or sooner):** whether to move the sky's rendering to
  Three.js~~: done in C9 (ADRs 0005 and 0006).
- **Before the final README:** the name (Kessler stays the working title).
- ~~**Open:** whether the catalogue shows owners' callsigns next to the
  debris they caused~~: yes, on every screen (ADR 0010).
- ~~**Before the C9 debris table:** how colliding beacons connect~~: a
  couplet; words on fragments later (see "Collisions that mean something").
- ~~**Open:** which of the purpose ideas to adopt~~: all three, with the
  wreck (ADRs 0016–0018, accepted; see "What Kessler is for").
- **Open (2026-10-07):** whether static should take full turns at the
  stations in a cascade, or less; whether to archive answers per question
  in the catalogue; whether Yours should tell you about an encounter the
  next time you visit (it lists them, but doesn't announce them).
- **Open:** seeing a burn-up on demand (see "Now and later").
