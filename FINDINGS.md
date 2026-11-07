# Findings: adversarial review against the final-project spec

_Review of `main` at `c1e5cd7`, run 2026-11-07, two days before the
deadline (noon, Mon 9 Nov 2026)._

## How it was run

One workflow of 22 Opus agents, each blind to the others' drafting:

1. **Nine adversarial reviewers**, one per dimension: the three fixed
   requirements (tested in two browsers, a restart and a mobile viewport);
   robustness and security under unplanned use; the README against the
   brief; `PROCESS.md`; the rest of the process evidence (CLAUDE.md,
   reflections, ADRs, log, commits, CI); the spec suite; first-visitor UX
   at both marking viewports; server correctness; and whether the app is
   actually good.
2. **One verifier per dimension** that tried to refute every finding and
   re-graded what survived.
3. **A completeness critic** that looked for what no reviewer checked.
4. **Three judges**, one per marking criterion, who spot-checked the
   evidence and gave a band.

Every write went to a scratch database on a local server built from
`c1e5cd7`. The live app was only read (GET and look-only browser
sessions). No tracked file was changed by the review.

**Counts:** reviewers raised 105 findings; verifiers refuted 2 and
re-graded the rest; the critic added 7 (not independently verified).
**110 stand: 23 major, 46 minor, 41 nits.** None is critical: no fixed
requirement fails.

## Verdict

**D on all three criteria** (process 50%, deployed app 25%, response to the
brief 25%). The engineering is strong and the concept is not the median
answer; the marks are lost in the writing, in rules that don't exist yet,
and in the sky a marker actually sees. Most of it is fixable before Monday.

- **Engineering holds.** Real-time was under 50 ms between desktop and
  phone; 20 people launching at once reached all 20 open skies in about
  220 ms with nothing dropped. Identity, handles, a deorbit in progress
  and a collision that fell during downtime all survived a restart; an
  8-day gap replays in under 70 ms. 431 tests green; the ownership, cap
  and people-not-tabs rules go red when reverted.
- **The concept holds.** Attention as a commons, drawn as orbital debris,
  with no chat: strangers touch only through collisions that cost everyone
  airtime. Rejected options are documented with reasons.
- **The argument doesn't yet show.** On the live sky, about 35 of 36
  station readings sampled were static from derelict-on-derelict
  collisions, every satellite up was an invented extra, and about 9 in 10
  collisions a watcher sees are staged. The project's own balance runs show
  "being heard more has a cost" runs backwards in a quiet sky. The
  admissions live in `PLAN.md` and `notes/log.md`, not the README or the
  pages. One reviewer: "a well-made puppet show of the argument rather than
  the argument working."

## The major findings, in short

**Process (50%)**

1. **`PROCESS.md` is over length:** 1,277 to 1,394 words by any count,
   against 900 to 1,100, and over the self-imposed 1,210. It was 1,235 at
   `4d246bc`.
2. **No crit 10 section.** The logging work (ADRs 0022 to 0025) isn't
   mentioned. The 23 Oct "no crit 10 section" item was struck out as done
   without being written.
3. **Authorship is visible in git.** About 64% of the current words were
   last written in Claude-co-authored commits, and about 76% match the
   agent redraft `3ba6956`. The spec says to write the documents yourself.
4. **Smaller catches:** two citations point at the wrong commit (the globe
   decision is `f8f7003`, not `5c41ccd`; the crit-9 review is `44487ac`, not
   `41f32ef`); "People typically crowd the low band" contradicts the
   README's judged list; a screenshot caption is wrong; the stack and
   workflow sections name choices but never their costs.

**Response to the brief (25%)**

5. **CLAUDE.md has no rules derived from the README's argument** (flagged by
   four reviewers independently). Nothing says "heard-by counts people
   only", "staging only uses derelicts" or "extras never listen", so
   README, CLAUDE.md and `spec/` don't visibly agree.
6. **"Judged, not tested" reports no results.** "Launch counts per band will
   show it" is future tense, though 12-run balance figures exist.
7. **README claims the app doesn't keep:** "Kessler does no moderation"
   beside a word blocklist (marked won't-fix earlier); "any object's card
   shows who launched it" fails for anonymous launches ("launched without a
   handle"); "a restarted server catches up to the same sky" holds only
   with derelicts off, which is how the tests run.
8. **Sources stretched:** Ostrom, Kazemi and Shirky are cited for
   monitoring, moderation and a known group, which the app explicitly
   lacks.

**Deployed app (25%)**

9. **The launch gap can be bypassed.** A cookieless request is minted a
   fresh person, so one curl loop skipped the minute between launches and
   filled the sky to 200 in about 1.8 s, locking everyone out of launching
   for 31 to 75 hours. The README lists the gap as enforced, and halving
   the gap leaves the whole suite green.
10. **Station rows flicker** (open since 31 Oct, worse than recorded): on
    today's live sky, half the turns are cut short, median 1.65 s. "Heard
    by" is credited by the same rule, so a listener can be credited for a
    fraction of a second.
11. **A normal showcase room hits the cap:** 30 people launching once a
    minute filled 200 in about 7 minutes in simulation (critic; not
    independently verified).
12. **Date-dependent extras tests fail** at every hour sampled from Mon 9
    Nov 14:00 and across most of Tue 10 Nov AEDT, the start of marking.
    Reproduced twice. This test family has broken on the date before.
13. **The live volume and machine were replaced on 6 Nov.** Three old
    volumes are pending destruction, the new one has no snapshots, and
    nothing logs it. The data carried over (critic; not independently
    verified).

## Fixes before Monday noon, in order

The three judges converged on these:

1. Cut `PROCESS.md` to 1,100 words or fewer; add about 80 words on crit 10;
   fix the wrong hashes and the caption; rewrite the agent-drafted
   paragraphs in your own voice.
2. Add a short "Product rules" section to CLAUDE.md: one rule per README
   principle, each naming the spec test that checks it.
3. Rewrite the README's judged section with a method and a result for each
   item; fix the moderation, card and restart claims.
4. Close the cookieless launch bypass (a per-IP gap, or require a cookie
   seen on an earlier request), and pin the gap with a test against a
   literal 60 s.
5. Pin the clock in the date-dependent extras tests.
6. If there's time: give each speaker a stable turn in `src/lib/airtime.ts`;
   silence staged derelict static; set a request body limit (one oversized
   POST likely crashes the 256 MB machine, verified locally).

## Every finding

Ranked by the verifier's grade, then by dimension. Each has the reviewer's
evidence, why it matters, the verifier's check and a suggested fix. Paths
under `/Users/advaymenon/.claude/jobs/3ff57576/tmp/` are the reviewers'
scratch files and screenshots; they go when the job is deleted.

### Major (23)

#### `robust-cookieless-gap-bypass-fills-sky`: The 'minute between launches' doesn't apply to a POST without a cookie; one script fills the sky to 200 in under 2 s and locks everyone out for a day or more

*Robustness and security · criterion: brief · confirmed*

#### advay: wont fix, i dont expect marker to try this

- **Evidence:** src/middleware.ts:15 mints a fresh person for any request without a valid cookie, and nextLaunchAt (src/lib/sky.ts:1567) keys the gap on that person, so every cookieless POST is a first launch. On my server, three cookieless POSTs to / in a row all returned 201 (ids 42, 43, 44). scripts/fill.mjs then sent 220 cookieless launches to the high band from one IP: 189 returned 201 in 1766 ms, and the sky stood at 194 high + 5 mid + 1 low = 200. A real visitor's launch then got `422 {"errors":{"form":"The sky is full: 200 satellites in orbit, the most it holds."}}`. The high band lasts 31.0 h to 75.1 h (lifetimeRange, measured with scripts/block.ts). There is no limit per address (grep finds fly-client-ip only in operators.ts). README.md:35 lists 'a minute between launches; at most 200 satellites up' under 'Enforced, and tested'. ADR 0022 admits 'a new browser ... gets them more launches' but never considers that this lets one person deny launching to everyone else.
- **Why it matters:** The README claims as enforced a rule that a curl loop, or repeated incognito windows, gets round. The commons argument (Hardin and Ostrom, 'how much each takes') then fails in its simplest form: one person takes the whole sky. A marker who comes back the next day could find launching blocked. Even without a script, a busy showcase launching to high at once a minute each could plausibly reach the cap and hold it for over 31 hours (not measured; the live sky has 65 up right now).
- **Verifier:** Reproduced. middleware.ts:15 mints a new person for any cookieless request, and nextLaunchAt (sky.ts:1567) keys the gap on that person. Three cookieless JSON POSTs to / all returned 201. With a cookie jar the second launch got 422 'You can launch again in 1 min 00 s', so the gap works only per cookie. 220 cookieless high-band launches (20 at a time) gave 188x201 and 32x422 in about 4 s. A fresh visitor then got `{"errors":{"form":"The sky is full: 200 satellites in orbit, the most it holds."}}`. SKY_CAP=200 counts the whole sky, with no per-band, per-person or per-IP limit (fly-client-ip is used only in operator/index.astro). README.md:35 lists 'a minute between launches; at most 200 satellites up' as 'Enforced, and tested' and never says the gap is per browser. ADR 0022:61 says only that the count is per operator when signed in. Incognito windows (which markers use) give the same bypass by hand. The README overclaims, and one person can lock everyone out of launching for days, so major is fair, though it does take intent.
- **Suggested fix:** Refuse launches from requests without a cookie (make a launch require a cookie seen on an earlier request: the visitors table already tracks this for listening). Add a per-fly-client-ip launch rate (for example 5 a minute) and a per-person cap on high-band satellites, or make the cap per band. Say in the README that the gap is per browser, and test the cookieless case in spec/.

#### `brief-claude-md-has-no-rules-from-good`: CLAUDE.md has no rules derived from the README's argument; it holds only workflow and layout rules

*Response to the brief · criterion: brief · confirmed*

- **Evidence:** The spec says good lives in three places that must agree, and CLAUDE.md is 'the rules derived from the argument'. CLAUDE.md (187 lines) has sections for the plan, checks, performance, layout, how to work, visual verification, tests, logging, review and pristine output. `grep -n -i -E "beacon|heard|staged|extras|moderation" CLAUDE.md` matches nothing on any of those words. Its only product rule is the layout fit (line 60). Nothing says what the app must never do in light of the argument: never stage a collision that takes a person's satellite, never count an extra or an owner as 'heard by', never reset the sky, never hide who launched what, extras must give way to people. Those rules exist only in ADRs and tests.
- **Why it matters:** The marker reads README, CLAUDE.md and spec/ against each other. As it stands CLAUDE.md is a harness for the agent, not a statement of 'good', so README's promises are 'missing from rules', which the marking criteria name as a mark-down.
- **Verifier:** CLAUDE.md headings (lines 1-182): plan, checks, performance, layout, how to work, visual verification, tests, process logging, adversarial review, pristine output. Grepping for beacon/heard/staged/extras/moderation finds no product rule. The only rules about the product are the layout fit (line 60) and the balance-numbers rule (line 132). None of the README's principles or 'chose not to build' items (staging uses only derelicts, heard-by counts people only, nothing resets, extras give way) is written as a rule. The spec names 'README promises missing from rules' as a mark-down, so this is real.
- **Suggested fix:** Add a short 'What the app must never do' section to CLAUDE.md. Give one rule per README principle and per 'chose not to build' item, each naming the spec test that enforces it (for example 'staging never uses a person's satellite: spec/collision-server.test.ts "a collision staged..."').

#### `brief-judged-section-reports-no-judgement`: 'Judged, not tested' says neither how each item was judged nor what the judgement was, though measurements exist

*Response to the brief · criterion: brief · confirmed*

- **Evidence:** README lines: 'Whether it makes anyone think. I judge by playing; crits tell me more.' / 'Whether people crowd low. Launch counts per band will show it.' (future tense, never done) / 'Whether collisions feel earned. Only watching tells me; most are still staged.' The project's own 2026-10-23 review already flagged this (PLAN.md C10: '"What good means here" doesn't say what a good outcome would be, and the judged section reports no judgement; the 19 Oct logs could count launches per band'). PLAN.md 2026-10-16 lists 'launch counts per band will show it, with no count made yet' as **Won't fix**. Real figures sit unused in notes/log.md around line 4303 (`node scripts/balance/index.ts 12 0.6 quiet|crit`: low 78% / mid 57% / high 34% burn-up; watched 6.25 collisions/h, 5.56 staged) and in PROCESS.md ('57% ... burn up, and 99.5% of newcomers see a collision within ten minutes').
- **Why it matters:** The spec says the strongest READMEs say how the judged claims were judged. Here the judged half is three placeholders. A marker reads 'I judge by playing' as process asserted rather than shown.
- **Verifier:** I checked the README text: 'I judge by playing; crits tell me more' / 'Launch counts per band will show it' (future tense) / 'Only watching tells me; most are still staged'. PLAN.md lines 259-261 mark 'launch counts per band will show it, with no count made yet' as Won't fix. PLAN.md around line 283 records the project's own 23 Oct review saying 'the judged section reports no judgement'. Measured figures do exist (notes/log.md:4307-4310: 0.44/0.75 collisions an hour, watched 6.25/h with 5.56 staged) but the README doesn't use them. The spec explicitly rewards saying HOW judged claims were judged.
- **Suggested fix:** For each judged item, give the method and the result in one line. Example: 'Crowding: of N real launches in the live logs 19 Oct to 7 Nov, X% low (flyctl logs, launch band=...)'. 'Feel earned: balance harness, 12 runs: a watcher sees ~6 collisions/h, ~9 in 10 staged; crit players said ...'. Cite the crit reflections for 'makes anyone think'.

#### `brief-process-md-over-length`: PROCESS.md is roughly 1,350 to 1,390 words against the 900 to 1,100 required

*Response to the brief · criterion: process · confirmed*

#### advay: wont fix

- **Evidence:** `wc -w PROCESS.md` = 1394. With link URLs and image markdown stripped it is 1347. Spec: 'PROCESS.md 900-1100 words'. PLAN.md records a self-imposed cap of '1,100 plus 10%' (1,210), and even that is exceeded. The 2026-10-23 entry marks PROCESS.md done at 1,271, and the 2026-11-07 commit c1e5cd7 added the live-suite section and screenshots on top of that.
- **Why it matters:** Process legibility is 50% of the mark, and length is one of the few hard constraints on PROCESS.md. Going about 25% over invites a deduction and suggests nothing was cut.
- **Verifier:** wc -w PROCESS.md = 1394. With link URLs and image markdown stripped it is 1347. Both exceed the spec's 900-1100 by about 22-27% and exceed even the self-imposed 1,210 cap in PLAN.md:244. PLAN.md records it at 1,271 when marked done on 23 Oct, and commit c1e5cd7 added more on top. Length is a hard stated constraint on the 50% process deliverable.
- **Suggested fix:** Cut to 1,100. Candidates: the staged-collision table (the balance numbers can be one sentence), the duplicated 'What I built' paragraph (which repeats the README intro nearly verbatim), and one of the 'three failures' bullets.

#### `process-wordcount-over`: PROCESS.md is 1,277 to 1,394 words against the 900 to 1,100 spec, and today's edit made it longer

*PROCESS.md · criterion: brief · confirmed*

#### advay: wont fix

- **Evidence:** `wc -w PROCESS.md` gives 1394. With image captions and link URLs removed it is 1347. With hashes, PR refs and markdown markup also removed it is 1277 (my python counter in /tmp/wc_proc.py). Every way of counting is 16 to 27% over 1,100. It is also over the student's own looser cap of 1,210 ('Advay's cap: 10% over', notes/log.md:4083; PLAN.md:286 '1,271 words, over the 1,210 cap'). History of the prose count: 3ba6956 1173, then 4d246bc 1140, 21de098 1267, c1e5cd7 1277. The last two commits added words. scripts/check-evidence.ts has no word count, so `pnpm check:evidence` passing ('29 cited commit(s), all resolve') says nothing about length.
- **Why it matters:** Length is a stated deliverable constraint on the document that carries 50% of the mark. The repo's own review on 2026-10-23 flagged the overrun, and PLAN.md:286 struck it out as 'Done (Advay): PROCESS.md marked done' without cutting anything. Since then the 21de098 incident paragraph (+~120 words) went in with no matching cut.
- **Verifier:** `wc -w PROCESS.md` = 1394. My own counter, with images, link targets, bare hash/PR link text and markdown markup stripped, gives 1318. Both are over the spec's 1100 and over the student's own 1,210 cap (PLAN.md:244-245, notes/log.md:4083). PLAN.md:286-287 strikes out '1,271 words, over the 1,210 cap' as 'Done (Advay, 2026-10-23): PROCESS.md marked done', and nothing was cut. Since then 21de098 added the incident paragraph (+120 words by blame) and c1e5cd7 added more. scripts/check-evidence.ts has no length gate. The spec states the length outright, so this costs marks.
- **Suggested fix:** Cut about 200 to 300 words: the balancing table (3 rows that need project context), the duplicated Opus anecdote and the third bullet's 'as with assignment 2's home page'. Optionally add a prose word count to check-evidence so the cap is enforced rather than judged.

#### `process-no-crit10`: Crit 10's work (server logging, ADRs 0022 to 0025) is entirely absent; the 'C10 section' was drafted, cut, removed and never written

*PROCESS.md · criterion: process · confirmed*

#### advay: wont fix

- **Evidence:** `grep -n -i 'crit 10\|logging\|Fly by\|logs' PROCESS.md` returns nothing. History: 8d9338d drafted 'Flying by the logs', e4525ce cut it, and 408634c removed it ('The C10 part of PROCESS.md is still to write', notes/log.md:3924). The 2026-10-23 review listed 'PROCESS.md has no crit 10 section' (notes/log.md:4319), and PLAN.md:286 struck it out as 'Done (Advay, 2026-10-23): PROCESS.md marked done', which dismissed it rather than doing it. The README's enforced list includes 'the server logs who did what, one line per action or refusal', and reflections/crit-10.md names a real process breakthrough: rereading the crit spec caught that totals were the wrong design. Only one git tag exists (crit-8), so the crit-9 and crit-10 cutoff states of PROCESS can't be checked from tags. The crit-10 cutoff (about 10-15) holds 6200f2f from 10-11, so no rewrite happened for crit 10.
- **Why it matters:** The spec asks for PROCESS.md to be rewritten per crit and read against the commits. A whole crit of commits (eca1ae7, 9430a2d, af7ebf8, 551e774, 8a52a97) and four accepted ADRs has no account. A README claim (server logs) traces to nothing in PROCESS. To a marker this reads as process missing for a quarter of the project.
- **Verifier:** `grep -i 'crit 10|logging|logs' PROCESS.md` returns nothing. The crit-10 work is real and dated: eca1ae7 (10-13, 'Log who did what... for crit 10 (ADR 0022)'), 9430a2d and af7ebf8 (10-15), and ADRs 0022-0025 exist. notes/log.md:4319 lists 'PROCESS.md has no crit 10 section (still to write since 408634c)', and PLAN.md:286 dismisses it without writing one. PROCESS history: 6200f2f on 10-11, then nothing until 3ba6956 on 10-17, so no rewrite landed for the crit-10 cutoff. reflections/crit-10.md has a real breakthrough (rereading the spec: per-action lines instead of totals) that PROCESS never uses. A whole crit, plus a README claim about server logs, has no process account.
- **Suggested fix:** Add about 80 to 100 words on crit 10: the plan reframed after rereading the spec (f0dc97e), and the review that found `anon` claimable and a passphrase logged while tests were green (eca1ae7). Pay for it by cutting elsewhere.

#### `process-authorship`: Most of the current text was last written in Claude-co-authored commits; the student's 'rewrite in own words' was a 4-line change

*PROCESS.md · criterion: process · confirmed*

#### advay: already rewritten what I can, wont fix

- **Evidence:** `git blame` word attribution of PROCESS.md: 4d246bc 444 words, 3ba6956 314, 21de098 120, 3ef73c9 7, 099b47b 5 and 035768e 2. All of these carry `Co-Authored-By: Claude Opus`, about 890 of 1394 words (~64%). Student-only commits: c1e5cd7 285 words, 6200f2f 196, 32f6549 17. 79% of HEAD's words appear in order in the agent redraft 3ba6956 (difflib, /tmp/sim.py). The log at 4082 says '3ba6956 ... A draft for Advay to rewrite in their own words'. PLAN.md:246 marks that rewrite 'Done (Advay, 2026-10-23)', but between 3ba6956 and 4d246bc the only student-only edit is 2be559d (4 lines). 4d246bc ('Merge the PROCESS.md rewrite under the word cap', co-authored) then smoothed the student's own phrasing. For example, 2be559d's 'The tutor in crit 8 noted to me that what I had incentivised being seen' became 'In crit 8 the tutor pointed out I'd given people a reason to be seen' (git show 4d246bc). The whole incident paragraph (lines 69-79) went in via agent commit 21de098 and was never reworded.
- **Why it matters:** The spec says documents are written by the student, and a marker reading the commit history alongside PROCESS will see the trailers. The 06 to 07 Nov student pass (c1e5cd7) helps, but the bulk is still agent prose, phrased in the agent's recognisable style ('The test holds the constraint; whether it looks right is still my call').
- **Verifier:** I reproduced the blame word counts: 4d246bc 444, 3ba6956 314, c1e5cd7 285, 6200f2f 196, 21de098 120. 4d246bc, 3ba6956 and 21de098 all carry `Co-Authored-By: Claude Opus`; c1e5cd7, 6200f2f and 2be559d do not. Difflib word similarity of HEAD to the agent redraft 3ba6956 is 0.76 (the reviewer said 79%). The 3ba6956 log says 'A draft for Advay to rewrite in their own words'. Between it and 4d246bc the only student-only commit is 2be559d (4 lines). 4d246bc did smooth the student's tutor sentence ('The tutor in crit 8 noted to me that what I had incentivised...' became 'In crit 8 the tutor pointed out I'd given...'), though the agent's 9096558 had already fixed that sentence, so the smoothing wasn't only 4d246bc's. One caveat: blame is line-granular, so 4d246bc's 444 words overstate its share, since many of those lines were minor rewordings of the 3ba6956 text. That base was agent-drafted anyway, so the conclusion holds. The spec requires documents written by the student, and the trailers are visible in the history.
- **Suggested fix:** Do one honest student rewrite pass over the remaining agent paragraphs: the incident, the harness bullets and 'What good means here'. Or say plainly in PROCESS how drafting was split (agent drafts from the log, student rewrites) so it is shown rather than hidden.

#### `evidence-process-over-word-limit`: PROCESS.md is over the spec's 900-1100 words, and today's commit is what pushed it over

*Other process evidence · criterion: brief · partly confirmed*

#### advay: wont fix

- **Evidence:** Prose word count at HEAD, leaving out headings, the table, image alt text, link URLs and SHA link text: 1207. With the table: 1343. Raw `wc -w PROCESS.md`: 1394. The same method gives 978 at 4d246bc (10-24), 1104 at 21de098 (11-03) and 1207 at c1e5cd7 (11-07, 'Update PROCESS.md for clarity and add launchpad screenshots'). So the 11-03 live-suite paragraph took it to the cap and today's edit added about 100 words more. PLAN.md records 'Advay's cap: 1,100 plus 10%', which is a self-set allowance, not the spec's.
- **Why it matters:** PROCESS.md carries the 50% legibility criterion and has an explicit 900-1100 word range. A marker counting finds it about 10% over at minimum, and more if the table counts.
- **Verifier:** It is over the limit. My strip-script count at c1e5cd7 gives 1175 words of prose without the table, 1253 with it, and `wc -w` gives 1394. But the story that 'today's commit pushed it over' doesn't hold. c1e5cd7 turned the stack table into prose (5 table lines now against 10 at 21de098), so most of the prose growth is words moving out of the table. Counting the table, the file went from 1243 at 21de098 to 1253 at c1e5cd7, about 10 words, and it was already 1117 at 4d246bc. PLAN.md:244/287 shows the overrun was a known, self-set cap ('1,100 plus 10%', '1,210 cap'). Even the generous count is 7% over a stated limit, and a marker counting will see it.
- **Suggested fix:** Cut about 120 words. Candidates: the 'Three failures' bullets (fold the citations into one sentence), the balancing table's prose lead-in, and the two-screenshot captions. Re-count with the table included.

#### `evidence-known-review-findings-left-in-readme`: Review findings against README claims were logged and then left unfixed, including one that contradicts README principle 2

*Other process evidence · criterion: brief · partly confirmed*

#### advay: wont fix

- **Evidence:** PLAN.md (2026-10-16 review) says: '**Won't fix:** the README's "Kessler does no moderation" beside the word blocklist and link filter in `src/lib/launch.ts`; and "launch counts per band will show it", with no count made yet.' The code confirms both: src/lib/launch.ts:41 has `const BLOCKED = [`, and :108 returns 'That line has a word we don't broadcast'. README.md still says 'Kessler does no moderation' and 'Whether people crowd low. Launch counts per band will show it.' The 2026-10-23 review in PLAN.md lists 'For Advay to sort': 'in a quiet sky low satellites burn up 78% of the time and high ones 34%, and everyone low makes fewer collisions than everyone high (0.44 against 0.75 an hour)'. That contradicts README principle 2 ('Being heard more has a cost ... flying where it's crowded') everywhere except at crit density. The same review also says 'the judged section reports no judgement'. README.md is unchanged on all of these (last README edit 6a34288, 10-23).
- **Why it matters:** The brief marks down 'README promises missing from rules and checks', and the deployed-app criterion tests the README's claims. CLAUDE.md says 'Act on its findings', yet the project's own reviews found these gaps and the trail shows them parked. A marker reading PLAN.md sees that they were known.
- **Verifier:** Confirmed: PLAN.md:259-261 has the 'Won't fix' entry for 'no moderation' and 'launch counts per band'. src/lib/launch.ts:41 has BLOCKED and :108 refuses words. README.md:16 still says 'Kessler does no moderation', and :47 still says 'Launch counts per band will show it' with no count reported. The judged section (README:45-50) gives no result for any item, which PLAN:284 itself flags. That is the strong part. Overstated: 'contradicts principle 2'. The quiet-sky figures (low burns up 78% against 34% high) are themselves a cost of flying low, and the crit-density figures (6.1 against 3.9 collisions) support principle 2. So it is a qualification, not a flat contradiction. 'No moderation' next to a word filter can also be read as 'no human moderation'. The empty judged section is the part that will cost marks.
- **Suggested fix:** Rewrite 'no moderation' as 'no moderation beyond a word blocklist and no links'. Either do the per-band count from the logs (the 10-19 logs exist) and report it in 'Judged', or drop the claim. Qualify principle 2 as a crowd-density effect and cite the measured numbers. For each judged claim, give one sentence on how it was actually judged and what was found.

#### `evidence-claude-md-has-no-rules-from-the-argument`: CLAUDE.md has no rules derived from the README's definition of good, so README, CLAUDE.md and spec/ don't agree

*Other process evidence · criterion: brief · confirmed*

- **Evidence:** `grep -n -iE 'heard|derelict|moderation|commons|staged|extras|record|README' CLAUDE.md` finds only workflow lines: 26-27 (ADR records), 136 (balance runs), 170-173 (reviewer reads README). CLAUDE.md never states any product rule the README argues for: that 'heard by' counts people and not owners, tabs or extras; that staging only ever uses derelicts, so the server never destroys a person's satellite on purpose; that nothing resets; that fragments trace to operators; that extras must never be marked as real people. All 187 lines are process: checks, layout, servers, commits, logging, review.
- **Why it matters:** The spec defines good as three places that must agree: README (the argument), CLAUDE.md (the rules derived from it) and spec/ (the checks). Here CLAUDE.md derives nothing from the argument, so a fresh agent could break a README promise (for example, stage a collision between people's satellites) without any rule stopping it. This is exactly the 'README promises missing from rules' pattern.
- **Verifier:** `find` shows only one CLAUDE.md (no nested ones), and .claude/ holds only launch.json and worktrees. Grepping CLAUDE.md for heard/derelict/moderation/extras/reset finds no product rule; the README is mentioned only as something a reviewer reads (lines 170-173). None of the README's enforced or 'chose not to build' items appears as a rule: heard-by counts people, staging uses derelicts only, nothing resets, extras unmarked but never listening. The spec says CLAUDE.md holds the rules derived from the argument, and this is a direct gap in the README/CLAUDE.md/spec agreement.
- **Suggested fix:** Add a short 'What good means here, as rules' section to CLAUDE.md, mapping each README principle and enforced bullet to a rule and to the spec file that checks it (e.g. spec/story.test.ts, spec/heard-server.test.ts, spec/extras*.test.ts). Mark which ones are judged.

#### `evidence-known-open-flicker-bug`: PLAN.md records an open bug that hits the showcase scenario: station rows swap who's on air every 250-500 ms in a crowded sky

*Other process evidence · criterion: deployed-app · confirmed*

#### advay: wont fix

- **Evidence:** PLAN.md line 9: 'Found on the way and still open: in a crowded sky the station rows swap who's on air every 250 to 500 ms, since `turnAt` cuts the turns again whenever anything enters or leaves a window'. notes/log.md ~4367: 'the on-screen flicker is pre-existing and still open'. The code confirms the mechanism: src/lib/airtime.ts:14-23 computes `into = time % total`, where `total` is the sum of turn lengths of whatever is currently overhead, so any change to that set moves the turn boundary discontinuously. airtime.ts is unchanged since 1472389 (10-07). I did not reproduce it in a browser myself.
- **Why it matters:** The spec asks for design for co-presence in a showcase room full of simultaneous users. That is a crowded sky, the exact condition for this flicker. The station panel is how a beacon gets 'heard', the app's core promise, and the same rule decides who is credited as heard.
- **Verifier:** The code confirms the mechanism. In src/lib/airtime.ts:14-23, turnAt computes `into = time % total` with `total` the sum of the current overhead lengths. onAir (:42-53) rebuilds `lengths` from whatever is overhead, so any object entering or leaving a window shifts `total`, and the turn index jumps to an unrelated slot. The project's own Chrome observation records it (notes/log.md:4367-4371: 'swap who's on air every 250 to 500 ms in a crowded sky ... the on-screen flicker is pre-existing and still open'), and so does PLAN.md:9. airtime.ts was last changed in 1472389. I did not reproduce it in a browser myself, but the code plus the documented observation is enough. A crowded showcase room is exactly the trigger, and the same function credits who was 'heard'.
- **Suggested fix:** Anchor turns to a fixed epoch per station window, or keep each beacon's turn slot stable when the set changes (e.g. schedule from entry time). Add a spec test that adding or removing one overhead object doesn't change whose turn it is mid-turn.

#### `spec-date-dependent-extras-tests`: Two extras tests fail on certain wall-clock dates; the window starts hours after the deadline

*Spec suite · criterion: spec-contract · partly confirmed (raised as critical)*

- **Evidence:** I preloaded a Date shift (scratch /Users/advaymenon/.claude/jobs/3ff57576/tmp/spec/shift.mjs, a copy of the repo, nothing tracked touched) and ran spec/log.test.ts, extras-server.test.ts and extras.test.ts at +0..504h in 4h steps. 11 of 127 runs failed, and each failure reproduces every time (3/3 reruns). spec/log.test.ts:509 'logs their manoeuvres as an extra's' fails with 'expected 0 to be greater than 0' at every sampled hour from Mon 9 Nov 14:00Z to Tue 10 Nov 09:00Z, and again at Thu 12 09Z, Sat 14 05Z and Tue 24 09-13Z. That covers roughly 01:00 to 21:00 AEDT on Tue 10 Nov, the first full day of marking. spec/extras-server.test.ts:158 'ends up with the same sky whether it ran all along...' fails with 'expected 12 to be greater than 12' at Sat 14 13Z and Mon 23 13Z. The cause is `T = Math.floor(Date.now()/HOUR)*HOUR + 10*DAY` (log.test.ts:73; extras-server.test.ts:57), which feeds the deterministic extras schedule. The day-search loop at log.test.ts:479-486 asks for 'a manoeuvre in the two days after', but the test then needs one to be logged. The log already records this test family breaking on the date twice (notes/log.md:3988 '2026-10-16 — A date-dependent extras log test, fixed'; PLAN.md status 'an extras test that broke with the clock fixed').
- **Why it matters:** The spec contract is 'pnpm check passes'. If a marker or CI (once public) runs it during the failure windows, it goes red with no code change. That breaks the 'pristine output' rule and shows that the third fix again patched the search instead of removing the dependency on the clock.
- **Verifier:** I reproduced this in the real repo (not the reviewer's copy) against my own server on 8096, using the reviewer's Date-shift preload. The suite passed at +0h and +100h. At +64h, +68h and +80h, spec/log.test.ts 'logs their manoeuvres as an extra's' failed with 'AssertionError: expected 0 to be greater than 0'. At +180h, extras-server.test.ts 'ends up with the same sky...' failed with 'expected 12 to be greater than 12'. The cause is T = Date.now()-based (log.test.ts:73, extras-server.test.ts:57). The day search at log.test.ts:479-486 checks that a non-launch extra is due, but not that one is logged. History confirms this keeps recurring: notes/log.md:3986 and 4270-4285, and PLAN.md:288 'Two date-dependent extras tests in a week ... maybe a CLAUDE.md rule'. notes/log.md:4336-4341 adds that pinning the clock was tried and dropped at Advay's word because 'it wasn't clear what it was for'. So leaving it was a decision, but the log shows the rationale was weak. I downgraded it from critical: the failure window starts about 16h after the deadline (Mon 9 Nov 01:00Z), CI is green at HEAD, and the contract check at submission would pass. It only goes red if someone reruns pnpm check during the window (roughly Mon 9 Nov 17Z to Tue 10 Nov 09Z, plus scattered later hours). That is still a real, reproducible flake in the marking period, and it undercuts the 'tests are deterministic and enforced' story.
- **Suggested fix:** Pin T to a fixed instant (for example Date.UTC(2026,10,20)) in log.test.ts and extras-server.test.ts, or pass the schedule a fixed seed, so these tests never read Date.now(). Then sweep the clock (as done here) to show they're stable, and log it. Add a CLAUDE.md rule: in-process tests use a fixed T, never Date.now().

#### `ux-live-sky-is-static-and-derelicts`: The live sky a marker sees has no real people in it and is mostly static from derelicts nobody launched

*First-visitor UX · criterion: brief · confirmed*

#### advay: wont fix

- **Evidence:** Read-only view of https://comp4020-final-am167.fly.dev/sky/ at 1920x1080 (live-sky-desktop.png): '6 satellites, 16 derelicts and 42 fragments in orbit'. All 6 'latest launches' (ALBATROSS-2, ALBATROSS, Dusty, Sky Pigeon, ORBIT-X, MARMALADE 13) are names from src/lib/extras-cast.ts:444-454, so they are invented extras. I sampled the station rows for 8 s and all three stations were STATIC on almost every sample ('CANBERRA 5 overhead STATIC Old … boooooooom', 'MADRID 4 overhead STATIC where … the'). The live catalogue (GET /catalogue/?show=all) lists 26 recent collisions: 10 are 'A derelict and a derelict', several more are chains of derelict debris, and only 'Jess sat and Space Dog' and 'GOOSE-24 and NIGHTJAR 12' are satellite against satellite (both extras). My fresh local DB looked the same: 'Next: static, in 2 s / 36 s / 3 s' on all three stations, and the first collision announced was 'a derelict and a derelict … The derelicts were nobody's.'
- **Why it matters:** The README's argument is 'crowding the low band … causes collisions' and 'the record keeps who caused what'. What a marker actually sees is noise made by server-staged derelicts that trace to nobody. So the cost visible in a few minutes is not caused by anyone's choice to crowd, and the station panel, the main way the app shows 'heard', mostly plays static. The README admits 'most are still staged', but it reads as a sky that is broken or abandoned rather than one where saying something costs everyone a little.
- **Verifier:** Checked read-only. Live GET /catalogue/?show=all lists 11 'A derelict and a derelict collided', 2 chains made mostly of derelicts, and 5 derelict-vs-satellite collisions. Only 2 are satellite against satellite (GOOSE-24/NIGHTJAR 12, Jess sat/Space Dog), and both pairs are extras. On live /sky/ at 1920x1080 (window asserted 1920x1080), all three station rows showed STATIC at the first read and for most of a 10 s sample. The Heard list's top ~10 entries are 'STATIC from two derelicts' collision' or chains involving derelicts, with only a few beacons in between. My fresh local DB (port 8097) opened on 'Collision coming: a derelict and a derelict' and a mobile banner 'Debris from two derelicts' collision destroyed a derelict … The derelicts were nobody's.' The README concedes 'most are still staged', so this is not hidden. Still, it undercuts the 'crowding causes collisions / record keeps who caused what' argument a marker sees in the first minutes.
- **Suggested fix:** Cut derelict-on-derelict staging so static mostly traces to people's (or extras') launches. Cap how much static may take a station's turn so beacons stay audible. Before the marking window, check that the live sky shows a readable mix of words and static. Measure it with scripts/balance/ and quote the run, as CLAUDE.md requires.

#### `ux-station-rows-flicker`: Station rows swap who's on air every 250 to 750 ms in a crowded sky, which is the live sky today

*First-visitor UX · criterion: deployed-app · partly confirmed*

- **Evidence:** Sampled the live /sky/ aside rows every 50 ms for 8 s (read-only). The text changed at 950, 1451, 4201, 4951, 5701, 5951, 6201, 6451 and 6700 ms. For example CANBERRA went 'STATIC you just say hello. … for' -> 'STATIC habits' -> back again within 1.5 s, and the 'N overhead' counts went 5->4->5. PLAN.md status line 9 already records this as open since 2026-10-31 ('station rows swap who's on air every 250 to 500 ms … turnAt cuts the turns again'), and it is still unfixed two days before the deadline. The rows also sit in aria-live='polite' regions (3 found with id post-heard), so a screen reader would announce the churn. That last point is plausible but I did not test it with a screen reader.
- **Why it matters:** The Beacons panel is where 'being heard' happens. A line that changes before it can be read fails the core experience, and the live sky is crowded enough (64 objects) to trigger it constantly. It is exactly the 'holds up under unplanned use' case the top band asks about.
- **Verifier:** Reproduced on live /sky/ (read-only), sampling every 50 ms for 10 s. Rows change because the overhead set changes, not because a turn ends. Goldstone's shard changed at 255, 1238, 2078, 5487, 6263, 8226 and 9721 ms; Madrid's at 255, 1238, 2235, 4245, 5225 and 9468 ms. Several of those changes come with the count flipping between '3 overhead' and '4 overhead'. The cause fits src/lib/airtime.ts: turnAt() takes time % total, and total changes whenever an object enters or leaves, so the turn is re-cut. STATIC_TURN=5000 and TURN.min=4000 are never honoured. PLAN.md status line 9 records it as open. In my sample the intervals were mostly ~0.8 to 2 s rather than 250 to 750 ms, so the stated rate is overstated, but the defect is real, known and unfixed. The aria-live point was not verified.
- **Suggested fix:** Give each turn a minimum dwell (for example 3 to 4 s) that isn't re-cut when objects enter or leave the window. Add a regression test with a crowded window asserting a minimum time between changes on a row.

#### `ux-jargon-derelict-static-wreck`: The first sky view leans on unexplained jargon (derelict, overhead, passes, echoing, 'the wreck says')

*First-visitor UX · criterion: brief · confirmed*

- **Evidence:** A first visit to /sky/ shows 'Collision coming: a derelict and a derelict, in 1 min 37 s.', station rows 'Next: static, in 2 s' / '1 more overhead' / '3 overhead', Heard items 'STATIC from Orbital Toast and PIP-1's collision … Over Goldstone · 2 passes · 3 of 6 pieces still up', and the collision banner '"Sorry in advance if this ends up as static" a derelict, echoing Orbital Toast … The wreck says Sorry … Did / in advance … get / if … through? / this ends … Sending backup.' (sky-collision-after.png). The word 'derelict' never appears on /, /why/ or /kessler/: curl + grep counts 0 on each, and /why/ only says obliquely 'Even the dead satellites the sky keeps carry an echo'. It is defined only inside a derelict's own card ('A dead satellite nobody owns'). 'Answering', 'Yours' (a catalogue tab, not in the nav, yet the first-launch dialog says 'If yours collides, Yours shows who it met'), 'band', 'handle' and 'operator' ('Your operator' at /operator/) are also used before being introduced.
- **Why it matters:** CLAUDE.md asks reviewers to flag every sentence that needs project context. 'A derelict, echoing Orbital Toast' and the slash-joined wreck text are only legible once you know derelicts carry dead satellites' last words and fragments carry pieces of both. A marker meeting this on first contact reads word salad, and the collision, the app's central moment, loses its meaning.
- **Verifier:** curl on local /, /why/ and /kessler/: 'derelict' occurs 0 times on each, against 14 on /sky/. Live /why/ only says 'dead satellites the sky keeps carry an echo: the last words of one that's gone' and never uses the word. src/lib/story.ts:119 builds 'a derelict, echoing ${echoOf}', and Wreck.astro / sky.ts:646 add 'The wreck says'. On a fresh visit on iPhone 14, the first thing under the canvas was '"Payday" a derelict, echoing Space Dog / The wreck says the / letter … Payday / The derelicts were nobody's.' That is unreadable without project context, at the app's central moment, and CLAUDE.md explicitly asks reviewers to flag exactly this.
- **Suggested fix:** Explain derelicts in one line on the launchpad hero and on the sky ('dead satellites nobody owns, carrying someone's last words'). Replace 'echoing X' with 'carrying X's last words'. Render the wreck as the fragments' lines one per line rather than slash-joined. Rename 'Yours' in prose to 'your satellites (Catalogue → Yours)'.

#### `code-onair-flicker`: Station rows switch speakers every 0.5 to 2 s in any sky with more than a handful of beacons, including the live sky now; the server credits 'heard' from those fragments of turns

*Server correctness · criterion: deployed-app · confirmed*

- **Evidence:** Known open bug (PLAN.md status 2026-10-31; notes/log.md:4368). Cause: src/lib/airtime.ts:14-23 `turnAt` takes `time % total`, and `total` changes whenever anything enters or leaves a station's window, so the turns are recut. I measured it with the real onAir/stationOver/placeInBand code, sampling every 50 ms over 20 simulated minutes (script /Users/advaymenon/.claude/jobs/3ff57576/tmp/code/flicker2.mts and flicker3.mts). I counted only turns that ended while the speaker was still overhead and lasted under TURN.min (4000 ms). Results: live-sized sky (6 satellites + 42 word-carrying fragments; the live /sky/ reads '6 satellites, 14 derelicts and 42 fragments'): 52% of such turns cut short, median 1650 ms, about 8.7 per station per minute, 96 at 500 ms or less. Showcase (30 + 60): 64%, median 1350 ms, about 13 per station per minute. 60 satellites, no debris: 66%, median 1500 ms. 60 satellites, 80% low: 80%, median 1050 ms. 200: 96%, median 650 ms. The server's ear (src/lib/heard.ts:202-236) samples onAir once a second by the same rule, so a beacon that was on air for a few hundred milliseconds at a sampled instant credits every listener with having 'heard' it.
- **Why it matters:** The stations are how the app shows its central claim (README point 1: 'a beacon is heard only by others with the sky open as it passes a station'), and airtime.ts promises turns 'each long enough to read'. In a showcase room, or for a marker watching the live sky today, the rows change before a 140-character line can be read. 'Heard by N' then counts people who could not have read the line. That undercuts the 'heard' figure the README treats as enforced, and it is the first thing a co-present audience looks at.
- **Verifier:** I re-ran the reviewer's flicker2.mts and flicker3.mts against the real onAir, stationOver and placeInBand code and got the same numbers. Live-sized sky (N=6 satellites, D=42 fragments): 52% of turns cut short, median 1650 ms, 8.7 per station per minute. N=60: 66% cut short, median 1500 ms, 12.9 per station per minute. N=30: 39% cut short. The cause is as stated. src/lib/airtime.ts:14-23 computes `time % total`, and `total` changes as speakers enter and leave a window. heard.ts:213 credits listeners from the same onAir result at each sampled second. The repo already admits the bug: PLAN.md:9 says 'station rows swap who's on air every 250 to 500 ms … still open', and so does notes/log.md. One caveat on the live-sky figure: most of those cuts are swaps between static and a beacon. I counted only turns that were a beacon's (my variant, verify-code/f3b.mts). Then the live sky drops to 4% (0.8 per station per minute), while showcase size (30+60) stays at 19%, about 4 per station per minute. 60 satellites with no debris is all beacons and gives 66%. The rows still change visibly in the live sky, but the 'heard by people who couldn't read it' harm mostly shows in a crowded room. That is exactly the co-presence case the spec asks students to design for, and the app's central claim rests on it, so major stands.
- **Suggested fix:** Stop deriving turns from `time % total` over a set that changes. Keep a per-station schedule: when the current turn ends, hand the next turn to the lowest-id speaker overhead that hasn't had one this pass. That needs no shared state beyond the sorted overhead list at turn boundaries, so every screen still agrees. Or keep the speaker until its turnLength runs out or it leaves the window. Add a spec test that no turn shorter than TURN.min ends while its speaker is still overhead (the flicker2.mts measurement as a test), and confirm it fails on the current turnAt.

#### `good-stations-drown-in-staged-static`: The 'radio' a visitor hears is mostly static from collisions nobody caused

*Is it good? · criterion: deployed-app · confirmed*

- **Evidence:** Sampled the live /sky/ station rows every 5 s for 60 s (agent-browser, session good, 1920x1080): of 36 station readings (12 samples x 3 stations), 31 were STATIC (for example 'Old … boooooooom', 'Mum, … being kind.', 'Boosting … I'm') and 5 were beacons, all from extras (ALBATROSS, Dusty). Static gets a whole turn at each station (src/lib/airtime.ts:30 STATIC_TURN = 5000), and in this quiet sky the static comes from staged derelict collisions whose 'echoes' are gone satellites' last words (PLAN.md:93-95).
- **Why it matters:** The README's story is that crowding causes collisions, and collisions turn words into static that 'takes airtime from everyone'. On the live app nobody crowded anything, yet the stations are about 85% static. So the cost appears without the cause, which teaches the opposite of the argument: noise is just how the sky sounds. A first-time visitor at the stations mostly reads word fragments they can't parse.
- **Verifier:** Reproduced independently. I sampled live /sky/ at 1920x1080 (agent-browser session verify-good, read-only) every 5 s for 60 s: 12 samples x 3 stations = 36 readings, 35 STATIC and 1 beacon (ALBATROSS, an extra). Examples: 'short … to the next', 'Instructions … the dishes', 'believe that. … one just'. The live Heard feed's attributed static sources are 'from two derelicts' collision' (8 entries) or extras plus derelicts (FOOTNOTE 2, Orbital Toast, smol sat, WREN 13, MARMALADE 15), and none involves a person. STATIC_TURN=5000 at src/lib/airtime.ts:26. So a first-time visitor or marker at the Beacons panel almost only sees word fragments from collisions that no person caused. The README's cause-and-effect story ('crowding causes collisions, which turn both messages into static') is not what the live app shows.
- **Suggested fix:** Keep staged wrecks' fragments silent (staged fragments mostly burn up within 16 minutes anyway, ADR 0019), or don't give derelicts echoes, so that static on air means someone actually crowded the sky. Then measure the share of station time that is static, quiet against crit, with scripts/balance.

#### `good-judged-reports-no-judgement`: 'Judged, not tested' names three judgements and reports none of them

*Is it good? · criterion: brief · partly confirmed*

- **Evidence:** README.md:44-49: 'Whether it makes anyone think. I judge by playing; crits tell me more.' / 'Whether people crowd low. Launch counts per band will show it.' / 'Whether collisions feel earned. Only watching tells me; most are still staged.' No count was ever made (PLAN.md:229-230 lists 'launch counts per band will show it, with no count made yet' under Won't fix). PLAN.md:280-282 lists 'the judged section reports no judgement' for Advay to sort. No README commit since 2026-10-23.
- **Why it matters:** The brief says the strongest READMEs say HOW the judged claims were judged. This section promises future methods and gives no results, and 'crits tell me more' says nothing about what the crits said. The data exists: live launches per band could be counted read-only (people's launches: 19 low, 15 mid, 14 high, nearly all test accounts, which is itself the honest answer).
- **Verifier:** README.md:46-49 checked. It names a method for each judged claim ('I judge by playing; crits tell me more', 'Launch counts per band will show it', 'Only watching tells me') but reports no results, and one is in the future tense. So 'reports none of them' is accurate about results. The suggestion that it gives no 'how' is overstated, since methods are named. PLAN.md lists 'the judged section reports no judgement' as unresolved, and git log shows no README commit after 2026-10-23. The data exists: my read-only count of non-extra launches is 20 low, 14 mid, 13 high. The brief names judged-claim methods as the mark of the strongest READMEs, so this is still a real cost on Response to the brief.
- **Suggested fix:** For each judged claim, write one sentence of result and method. For example: 'Crowd low? Of N real launches between dates, X% low (excluding extras), counted from the record.' 'Make anyone think? At crit 9, players said…' 'Earned? Measured share staged: 89%.'

#### `good-claude-md-carries-no-argument`: CLAUDE.md holds no rules derived from the README's argument, so the three places don't agree

*Is it good? · criterion: brief · confirmed*

- **Evidence:** grep -n -i 'extra\|heard\|stag\|good\|commons\|moderat' CLAUDE.md finds only process lines (32, 136, 170, 173). CLAUDE.md has no rule like 'heard by counts people only', 'extras never listen', 'staging never destroys a person's satellite', 'nothing resets', or 'no chat, no replies'. The spec checks some of these (spec/heard-server.test.ts, spec/extras-server.test.ts:226), but the rule layer is missing.
- **Why it matters:** The brief defines good as README (argument), CLAUDE.md (rules derived from it) and spec/ (checks), and says they must agree. Here CLAUDE.md is all workflow (layout, logging, commits). A marker comparing the three finds the middle layer doesn't exist for the design argument.
- **Verifier:** grep -n -i 'extra|heard|stag|good|commons|moderat|reset|chat' CLAUDE.md matches only line 32 ('extra gate') and line 136 ('staging or extras' in the balance-numbers rule). No CLAUDE.md rule states any README principle (heard counts people only, extras never listen, staging never destroys a person's satellite, nothing resets). Those rules exist only in ADRs and spec tests. The brief explicitly defines good as README, then CLAUDE.md rules derived from it, then spec checks, all three agreeing. The middle layer is all workflow. The closest thing is the balance-numbers rule, which is about process, not design.
- **Suggested fix:** Add a short 'What good means, as rules' section to CLAUDE.md that maps each README principle to a rule and names the spec file that checks it. For example: 'An extra never listens: spec/extras-server.test.ts', 'A staged collision never takes a person's satellite: spec/collision-server.test.ts'.

#### `good-process-over-length`: PROCESS.md is about 1,350 words against the 900-1,100 range

*Is it good? · criterion: process · confirmed*

#### advay: wont fix

- **Evidence:** python3 count of PROCESS.md with link URLs and image captions removed and link text kept: 1,347 words (1,343 without the hash and PR tokens; 1,394 with captions). The spec says 900-1100. PLAN.md:213 uses 'Advay's cap: 1,100 plus 10%' = 1,210, which is the student's own allowance, not the spec's, and the count is over that too.
- **Why it matters:** The word range is a fixed deliverable constraint, and process is 50% of the mark. Being about 22% over invites a penalty and suggests the write-up isn't edited to its argument.
- **Verifier:** Re-counted. wc -w PROCESS.md = 1394. With images removed and link text kept it's 1347, and without headings 1313. The spec says 900-1100, so even the most generous count is about 19% over. Git shows the over-length came from today's commit c1e5cd7: at 4d246bc ('Merge the PROCESS.md rewrite under the word cap') the same count was 1235. The 'live suite' paragraph added since accounts for much of the growth. It's a fixed deliverable constraint on a criterion worth 50%.
- **Suggested fix:** Cut to 1,100 or under. The balancing table and the live-suite incident can each lose about half their words. The 'Three failures' list repeats what CLAUDE.md already says.

#### `good-station-flicker-crowd`: In a crowded sky the station rows swap who's on air every 250-500 ms, and it's still open

*Is it good? · criterion: deployed-app · confirmed*

- **Evidence:** notes/log.md:4367-4371: 'The station rows themselves swap who's on air every 250 to 500 ms in a crowded sky … the on-screen flicker is pre-existing and still open.' Code: src/lib/airtime.ts:16-26 turnAt uses `time % total`, and `total` changes whenever an object enters or leaves a window. PLAN.md:9 status lists it as open. No commit to airtime.ts since 1472389 (2026-10-07). Not reproduced by me (the live sky was quiet).
- **Why it matters:** The showcase room, 20-40 people launching mostly low, is exactly the crowded case. The central 'heard' moment then turns into an unreadable strobe, in front of the marker the brief tells you to design for.
- **Verifier:** Mechanism verified in code. src/lib/airtime.ts:14-23 computes turnAt with `time % total`, and onAir (:42-53) rebuilds the lengths from whoever is overhead, so any object entering or leaving changes `total` and reshuffles who is on air. I ran a scratch script (tmp/verify-good/flick.mjs): adding one 6 s beacon to a 7-beacon window changed the speaker in 60 of 60 sampled seconds. That shows the reshuffle is total, not a nudge. notes/log.md records it being seen in Chrome ('swap who's on air every 250 to 500 ms in a crowded sky… still open'), and PLAN.md:9 lists it as open. git log shows no change to airtime.ts since 2026-10-07. I didn't see the strobe myself, because the live sky is quiet. The crowded case is exactly the showcase room, so major stands.
- **Suggested fix:** Anchor turns to a cycle start that only moves at cycle boundaries, or schedule each newcomer after the current turn ends. Test it with a crowded overhead set whose membership changes mid-turn.

#### `critic-room-fills-cap-legitimately`: A showcase room using the app normally fills the 200-satellite cap in about 7 minutes and locks everyone out

*Completeness critic · criterion: deployed-app · not independently verified*

#### advay: wont fix

- **Evidence:** Simulated with the real server code (src/lib/sky.ts launch/settle) on scratch DBs. Script: /Users/advaymenon/.claude/jobs/3ff57576/tmp/critic/room.ts and room2.ts. 30 people each launching every 60 s (the allowed gap), spread across the three bands: first 'sky is full' refusal at 7.2 to 7.4 min; over 30 min 389 launches got through and 514 were refused as full. 60 people at one launch per 2 min: full at 7.5 min, 287 refusals. 30 people at one per 3 min stays under the cap (195 at the end). After the room stops, a slot frees within 5 min, 150 at 15 min and 100 at 40 min. So the lockout ends quickly but repeats while the room keeps launching. The only cap finding so far (robust-cookieless-gap-bypass-fills-sky) is about abuse; this is honest use.
- **Why it matters:** The spec says to design for a co-present showcase room. The README presents '200 up' as a fairness limit, but in a busy room the most visible behaviour becomes 'The sky is full', with the Launch button disabled, for most people's later attempts. A marker who launches into a sky other testers already filled sees refusals, not the dilemma. The README argues crowding has a cost to everyone, and the cap turns that cost into a flat refusal.
- **Suggested fix:** Measure it with scripts/balance (add a 'room' scenario) and either raise SKY_CAP for the 256 MB machine (its cost was measured in code-ear-cost-at-cap), make the cap per person or per band, or let a full sky accept the launch at a cost (for example, it collides) instead of refusing. Then state the room behaviour in the README.

#### `critic-volume-replaced-undocumented`: The live volume and machine were replaced on 6 Nov with no log, ADR or PROCESS entry; three old volumes are pending destruction and the new one has no snapshots

*Completeness critic · criterion: process · not independently verified*

- **Evidence:** `mise exec -- flyctl volumes list -a comp4020-final-am167 --all`: vol_rkg3e866ddmozzo4 created 06 Nov 26 15:15 UTC and attached; vol_491xzzq8qmo7l15r (1 month ago), vol_v3g87oln99jx19l4 and vol_vz8ode95y8xm9pqv (2 days ago) all 'pending_destroy'. `flyctl volumes snapshots list vol_rkg3e866ddmozzo4`: 'No snapshots available'. Machine 2865d22a36e398 was created 2026-11-06T15:15:34Z. The data did carry over: the catalogue shows 'Everything ever launched (3105)' and the sky holds 31 Oct and 2 to 3 Nov timestamps. But `grep -n -E '2026-11-0[4-7]' notes/log.md PLAN.md` returns nothing, and the last log entry is 2026-11-03. Releases v57 and v58 are by ben@benswift.me, so a course-side migration is possible (unverified).
- **Why it matters:** Markers test persistence 'by returning next day after machine restart', and the README claims nothing resets. A storage migration two days before the deadline, with no record of who did it, why, or how data integrity was checked, is the kind of event a legible process should show. The 3 Nov cleanup is cited in PROCESS.md as a restore-versus-surgery decision, but that snapshot safety net no longer exists for the current volume, and the 'pre-cleanup.db' backup sat on a volume that is now pending destroy.
- **Suggested fix:** Find out from the course staff (or the fly logs) what happened on 6 Nov. Log it with the integrity checks run (row counts before and after, PRAGMA integrity_check). Confirm scheduled snapshots will begin on the new volume before marking, or take one by hand.


### Minor (46)

#### `fixed-realtime-only-sky`: Only /sky/ is live: the catalogue, Yours and object pages go stale until reloaded

*Fixed requirements · criterion: deployed-app · confirmed*

- **Evidence:** `grep -rln 'EventSource|/api/events' src/` matches only src/scripts/sky.ts. Test on my server (port 8094): desktop on /catalogue/ showed 'In orbit (53) / Everything ever launched (90)'. Another cookie POSTed a launch (201). After 5 s the page still showed 53/90 and `document.body.innerText.includes("CATTEST")` was false. A stranger had /object/42/ open, then the owner deorbited sat 42 (200). After 4 s the open card still read 'In orbit | Mid band | 1,353.35 km … Burns up in about 14 h'. A fresh GET of the same URL read 'Coming down | Low band | 403.34 km, ↓ 23,600 km/h | Burns up in about 1 min'. Screenshot: /Users/advaymenon/.claude/jobs/3ff57576/tmp/fixed/desk-object-stale.png
- **Why it matters:** The spec says one person's change shows in every other open session. Yours in the catalogue is where the boost and bring-down controls live, and the object card is what the README cites for 'the sky remembers'. A marker who keeps one of those pages open next to the other session sees nothing change. The README only promises 'every open sky', so this is scoped honestly, but it's a gap on the requirement as a marker would test it.
- **Verifier:** Reproduced on my own server (port 8094, scratch DB). At 1920x1080, /catalogue/ showed 'In orbit (23) / Everything ever launched (41)'. Another cookie launched VFCAT (303 to /sky/?launched=42). After 5 s the open page still read 23/41 and innerText.includes('VFCAT') was false. A reload showed 24/42 with VFCAT. `grep -rlnE 'EventSource|/api/events' src/` matches only src/scripts/sky.ts, and object-card.ts has 0 EventSource references. The catalogue script (catalogue/index.astro:486+) refreshes only after your own manoeuvre (`inPlace`), not on other people's events. README:32 promises only 'every open sky', so the scope is stated honestly, and a marker testing real-time will most likely have /sky/ open, which is live. A real gap, but minor.
- **Suggested fix:** Have the catalogue and the standalone object page open the same EventSource and update their counts and the open card on launch, manoeuvre, decay and collision, as the sky already does with refreshHistory. At least, refetch the open card's panel on events about that object.

#### `fixed-busy-on-simultaneous-claims`: Simultaneous handle claims or sign-ins beyond 4 are refused as 'The station is busy'

*Fixed requirements · criterion: deployed-app · confirmed*

- **Evidence:** src/lib/operators.ts:79 `const HASHING_MAX = 4;` and :83 `if (hashing >= HASHING_MAX) return null;` lead to BUSY (:81), with no queue. On my server, 12 cookies POSTed /operator/ claims at once: `["303@68","303@64","303@62","303@68","422BUSY@32","422BUSY@32","422BUSY@33","422BUSY@35","422BUSY@36","422BUSY@40","422BUSY@41","303@123"]`: 7 of 12 refused. This was localhost on an M-series Mac; scrypt on a shared-cpu-1x will hold each slot longer, so the window is wider (not measured on Fly).
- **Why it matters:** The top band asks for unplanned use with simultaneous actions, in a showcase room full of people. The launch pop-up nudges every first-time launcher towards 'Claim a handle', so a room told to claim handles together will see refusals. The message is retryable, but it's a rough first impression.
- **Verifier:** src/lib/operators.ts:79-83: HASHING_MAX = 4, and hashOf returns null (BUSY) with no queue. Reproduced on my server with distinct cookies claiming distinct handles at the same moment. 12 at once gave 7 BUSY and 5 claimed. 6 at once gave 2 BUSY. 5 at once gave 1 BUSY ('422BUSY@4'). So more than 4 requests inside one hashing window (~30-45 ms locally) are refused. On a single shared vCPU each hash takes longer, so the window is wider (not measured). The error is retryable and only hits truly simultaneous submits, so it stays minor.
- **Suggested fix:** Queue the hashing (a small semaphore that awaits instead of refusing) with a timeout of a few seconds, or raise the cap. Refuse only when the queue is long.

#### `fixed-mobile-sky-news-below-fold`: On mobile the sky's Live indicator, collision news and launch list sit about 1.4 screens down

*Fixed requirements · criterion: deployed-app · confirmed*

- **Evidence:** iPhone 14 viewport (innerWidth/innerHeight = 390x844) on /sky/. Measured page tops: #station-title (Beacons) 587, #connection (Live/Reconnecting) 1200, #sky-news (e.g. 'Smol sat and a derelict collided just now') 1365, #recent 1406; scrollHeight 4887. Screenshots: /Users/advaymenon/.claude/jobs/3ff57576/tmp/fixed/mob-sky-0.png and mob-desksat.png show the globe, then Beacons, with no 'Sky now' panel in the first screens.
- **Why it matters:** Markers test real-time with one session at a mobile viewport. A new launch does show on the phone's globe as a label (DESKSAT appeared in 48 ms). But the text that says what happened (a collision, a burn-up, 'X to Low') and whether the page is live is out of sight unless the marker scrolls past the beacons rail. A collision on the phone reads only as dots moving.
- **Verifier:** Measured on my server with agent-browser set to iPhone 14 (asserted innerWidth x innerHeight = 390x844). Page tops: station-title 587, connection 1111, sky-news 1276, recent 1339; scrollHeight 2061 (a smaller DB than the reviewer's, so the numbers differ, but the order is the same). The Live state and news line sit about 1.3-1.5 screens down, under the Beacons rail. The globe itself does show changes live, so the real-time requirement is still visibly met on mobile. Only the textual explanation is below the fold. Minor.
- **Suggested fix:** On narrow screens, put the Sky now summary (or at least the news line and the Live state) straight under the globe, above the Beacons rail, or pin the news line as a toast over the globe.

#### `fixed-anon-who-missing`: For the default (anonymous) launch, 'who launched it' is just 'without a handle', so two anonymous people look the same to everyone else

*Fixed requirements · criterion: brief · partly confirmed*

- **Evidence:** Cookie B's view of A's satellite before A claimed a handle (GET /object/42/): 'ALPHA1 | Satellite | Launched without a handle | … | Launched into the low band, without a handle.' A's own view adds '· yours' and the controls. src/lib/chronicle.ts:103 `operator ? ["launched by ", …] : ["launched without a handle"]`. README: '3. The sky remembers. Any object's card shows who launched it and what its debris destroyed.'
- **Why it matters:** Multi-user passes: the server keeps each cookie apart, the owner sees 'yours' and controls, and a stranger is refused with 422 'not-yours'. But launching without a handle is the default path, and there the card can't say who launched it, only that nobody named it. Two anonymous markers in incognito windows can't tell each other's satellites apart from the extras' anonymous visitors. That leaves README claim 3 resting on handles most visitors skip.
- **Verifier:** Real: src/lib/chronicle.ts launchedBy gives 'launched without a handle', and on my server the catalogue row for an anonymous launch reads 'no handle'. So README:24 'Any object's card shows who launched it' is overstated for the default anonymous path, and the spec explicitly marks down README promises the app doesn't keep. Overstated in two ways. First, the multi-user requirement is that the app distinguishes people, and it does (owner sees 'yours' and controls, strangers are refused). Second, the README's 'What I chose not to build' says outright that a handle is optional and accounts aren't required, and ADRs 0002/0009 deliberately make an anonymous person unnamed. The fix is mostly a README wording tweak. Minor, bordering on nit.
- **Suggested fix:** Give an anonymous launcher a stable public pseudonym derived from the cookie (e.g. 'visitor 3f9a'), shown on cards and in the Heard feed. Or reword README claim 3 to say the card names the operator when they have a handle.

#### `robust-oversized-body-oom`: A single large POST crashes the server: no request body limit (the adapter allows 1 GB)

*Robustness and security · criterion: deployed-app · partly confirmed (raised as major)*

- **Evidence:** node_modules/@astrojs/node/dist/index.js:70 `bodySizeLimit: userOptions.bodySizeLimit ?? 1024 * 1024 * 1024`; astro.config.mjs passes only `node({ mode: "standalone" })`. src/pages/index.astro:24 calls `await Astro.request.formData()` before any validation (operator and manoeuvre pages do the same). I tested on my own server (port 8095, scratch DB). A 100 MB urlencoded POST to / with a matching Origin header: with no heap cap, RSS went 76 MB -> 693 MB -> 920 MB and a concurrent GET /why/ took 7.23 s instead of 0.007 s. With `--max-old-space-size=128` and again at 180 the process died: `FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory` (server8.log, server9.log), and curl got status 100 with the connection dropped. 30 MB bodies (three at once) survived at a 128 MB heap. Without an Origin header Astro refuses with 403 before reading, but anyone can add that header with curl.
- **Why it matters:** The deployed machine has 256 MB. One curl command from anyone in a showcase room would probably OOM-kill the only process. That drops every SSE stream, and on Fly the next request has to cold-start the machine. This is the opposite of 'holds up under unplanned use', and it takes no skill. I haven't tried it on the live app, which would mean writing to it.
- **Verifier:** Reproduced. astro.config.mjs passes only node({mode:'standalone'}) and the adapter defaults to bodySizeLimit 1 GB (node_modules/@astrojs/node/dist/index.js:70). index.astro calls Astro.request.formData() before validating. On my server (8095, node --max-old-space-size=180, scratch DB) one 100 MB urlencoded POST with an Origin header crashed it: curl got 100 after 7.5 s, then server.log line 1112 `FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory`, and the port stopped listening. The Dockerfile CMD sets no heap cap and fly.toml has 256 MB, so on the live machine it would plausibly be OOM-killed (not tested there). Real, and a one-line fix. But it needs a deliberately hostile request: markers test simultaneous use and slow connections, not attacks, so 'clearly costs marks' is overstated. Downgraded to minor; it matters mainly as showcase-room risk.
- **Suggested fix:** Set `adapter: node({ mode: "standalone", bodySizeLimit: 64 * 1024 })` (no form here needs more than a few KB), and add a spec test that a 1 MB POST to / gets 413 or 400 and the server still answers afterwards.

#### `robust-blocklist-trivially-bypassed`: The word filter misses obvious hate and abuse, the beacon is kept forever, and nothing lets anyone take it down

*Robustness and security · criterion: brief · partly confirmed (raised as major)*

- **Evidence:** I ran `blocked()` from src/lib/launch.ts on sample lines (scripts/block.ts). These pass: 'Dick Cheese', 'f*ck you', 'fцck' (Cyrillic ц), 'ｆｕｃｋ' (fullwidth), 'fuuuck', 'fu ck', 'fück', 'fvck', 'heil hitler', 'sieg heil', '1488', 'kill yourself', 'kill all jews', 'cock', 'asshole', 'pussy', 'twat'. There is no NFKC normalisation or confusable folding (squash() only maps a few ASCII digits and symbols). grep finds no admin, report or takedown route in src/. PLAN.md:303-306 already records 'Dick Cheese got through ... Nothing lets a person report a satellite or take one down', still open. A beacon is broadcast on every open sky, kept in the Heard feed and shown as an epitaph after it ends (ADR 0012).
- **Why it matters:** In a showcase room, one person can put 'kill all jews' on every screen, and it stays on record for good. The README's 'Kessler does no moderation' makes that a deliberate choice, but the app then can't recover at all, short of a manual SQLite edit on the volume.
- **Verifier:** Reproduced with tsx against src/lib/launch.ts blocked(). 'Dick Cheese', 'f*ck you', 'fцck', fullwidth 'ｆｕｃｋ', 'fuuuck', 'heil hitler', '1488', 'kill yourself', 'kill all jews' and 'asshole' all return false; 'fuck you' and 'sh1t' return true. squash() (launch.ts:52) has no NFKC or confusable folding, and src/ has no takedown or report route. But README.md:16 says 'Kessler does no moderation', ADR 0022 records the choice, and PLAN.md ~303-306 already lists the 'Dick Cheese' miss as open. It's a documented limit of a deliberately minimal filter, not a broken claim; any keyword list can be got round. Abuse in a showcase room is plausible but not part of marking, and having no takedown is a real operational gap. Minor, not major.
- **Suggested fix:** At minimum, NFKC-normalise and fold confusables before matching, collapse repeated letters, and add the common hate phrases. Better: an owner-only (env-secret) takedown route that marks a beacon withheld, and a 'report' that hides a beacon after N distinct people report it. Either way, have the README state the limit honestly.

#### `robust-hashing-busy-refuses-not-queues`: Claims and sign-ins are refused as 'busy' instead of queued: simultaneous claims fail, and a flood from one IP blocks sign-in for everyone

*Robustness and security · criterion: deployed-app · confirmed*

- **Evidence:** src/lib/operators.ts:79-90: `HASHING_MAX = 4`, and hashOf returns null (giving 'The station is busy. Try again in a moment.') once 4 hashes are in flight. scripts/claims.mjs: 12 claims at once from distinct cookies and IPs gave `{ '303': 5, '422 station is busy': 7 }`. scripts/sustain.mjs: 8 concurrent sign-in loops from one IP with random handles (the lockout is keyed `${from}|${handle}`, so a new handle each try is never locked) meant 10 of 10 legitimate claims from other IPs got 'station is busy' (920 attacker requests). Measured on an M-series Mac; a shared-cpu-1x hashes more slowly, so the window would be wider.
- **Why it matters:** 'Everyone claim a handle now' in a crit gives a visible refusal to over half the room. A trivial script makes claiming and signing in unusable for everyone, though launching still works.
- **Verifier:** Code confirmed: operators.ts:79-90, HASHING_MAX=4, hashOf returns null and gives BUSY 'The station is busy. Try again in a moment.' Reproduced: 12 simultaneous claims from distinct fly-client-ip values gave 5x303 and 7x422; a second batch of 12 had 3 'station is busy' replies. I didn't re-run the per-(IP, handle) lockout bypass flood, but the comment in the code confirms the lockout is keyed by place plus handle. Minor is right: claiming is optional (launching needs no account), but simultaneous claiming in a crit visibly fails.
- **Suggested fix:** Queue hashing (a small semaphore with a waiting list and a timeout of a few seconds) instead of refusing. Also count failed sign-ins per IP across all handles, not only per (IP, handle).

#### `robust-bidi-format-chars-accepted`: Bidi and format characters (\p{Cf}) get into beacons and flip the text around them

*Robustness and security · criterion: deployed-app · confirmed*

- **Evidence:** src/lib/launch.ts readLaunch rejects only `/\p{Cc}/u`. A beacon starting with U+202E (RIGHT-TO-LEFT OVERRIDE) was accepted (id 435). In Yours it renders as `“”tser eht dna txet live`: the override spills outside the beacon and moves the closing quote mark to the front (screenshot /Users/advaymenon/.claude/jobs/3ff57576/tmp/robust/yours.png). Zero-width characters can't evade the word filter (squash strips them; 'f​u​c​k you' was refused).
- **Why it matters:** Lets someone mangle the page's punctuation, or write lines that read differently from how they're stored. A small but visible way to deface what everyone sees.
- **Verifier:** launch.ts:106 rejects only /\p{Cc}/u. readLaunch on a beacon starting with U+202E returned ok:true. The reviewer's screenshot (tmp/robust/yours.png) shows the RTL card rendering '“”tser eht dna txet live', with the closing quote moved. grep finds no <bdi> or unicode-bidi in src (only an unrelated `isolation: isolate` in index.astro:656). Visible defacement of shared text, so minor.
- **Suggested fix:** Also reject `\p{Cf}` apart from ZWJ/ZWNJ inside emoji, or wrap rendered beacons in `<bdi>` / `unicode-bidi: isolate`.

#### `brief-core-mechanic-mostly-staged`: The README admits most collisions are staged, and its own measurements show 'being heard more has a cost' fails in a quiet sky

*Response to the brief · criterion: brief · partly confirmed (raised as major)*

- **Evidence:** README principle 2 states as fact: 'Being heard more has a cost... being heard more means flying where it's crowded.' notes/log.md (2026-10-23 review, 12 runs each): 'In a quiet sky ... everyone low gives 0.44 collisions an hour, everyone high 0.75', so in a quiet sky going low causes fewer collisions. Only at crit density does low cost more (6.1 vs 3.9). Same entry: 'Watched: 6.25 collisions an hour, 5.56 staged' (89%). README judged bullet: 'most are still staged.' On the live app's catalogue (GET https://comp4020-final-am167.fly.dev/catalogue/), 9 of the 17 most recent collision headlines read 'A derelict and a derelict collided'. PLAN.md lists this as 'For Advay to sort', still unresolved.
- **Why it matters:** The whole argument rests on 'your crowding causes collisions that cost everyone'. What a marker actually sees (one or two people, ten minutes) is mostly server-scripted derelict collisions, so in the case the marker observes the cost is theatre rather than consequence. The README says so in four words but doesn't argue why that is acceptable. PROCESS.md does argue it ('Staging collisions bets that seeing the cost matters more than a sky left alone'), but the README, which is what gets marked for the brief, doesn't.
- **Verifier:** The figures check out: notes/log.md:4307 shows everyone low gives 0.44 collisions/h against 0.75 for everyone high in a quiet sky, and :4310 shows 5.56 of 6.25 watched collisions staged. On the live /catalogue/ I counted 11 'A derelict and a derelict collided' headlines in the recent list, consistent with the finding. However, the README discloses staging and argues why ('Staged collisions between people... staging uses derelicts'), and PROCESS.md argues the bet. A marker won't run the balance harness, and principle 2's mechanism (low passes stations more often, low is where people crowd) holds as stated. The finding is a fair design critique, but 'theatre rather than consequence' overstates the mark cost. Moving it into the README is cheap and worthwhile.
- **Suggested fix:** Move PROCESS.md's argument into the README in a sentence or two: staging is a demonstration of the cost for a sky too empty to cause one, it never touches people's satellites, and here is the measured fraction. Also qualify principle 2: 'once the sky is busy (measured: ...)'. Better still, make staged collisions visibly different (e.g. labelled 'demonstration') so the marker can tell earned from staged.

#### `brief-sources-misapplied`: Ostrom, Kazemi and Shirky are cited for close to the opposite of what they argue

*Response to the brief · criterion: brief · partly confirmed (raised as major)*

- **Evidence:** README: 'Ostrom (1990) found they survive when users can see the resource and what each takes... Kessler does no moderation, just a record of what each launch cost. Kazemi (2019) says small communities hold through limits.' (1) Ostrom's eight design principles include clearly defined boundaries, collective-choice arrangements, monitors accountable to users, graduated sanctions and conflict resolution. The app has no boundaries (anonymous cookie launches), no sanctions, no reporting, no collective choice. PLAN.md's own review: 'nobody can reply, report or sanction... Ostrom's monitoring is one of eight design principles.' Even the monitoring is thin: 5 of the 6 live satellites on the live catalogue show 'no handle', and the object card reads 'Launched without a handle', so 'who launched it' is usually nobody. (2) Kazemi's Run Your Own Social is centrally about active moderation, a code of conduct and screening members; citing it next to 'Kessler does no moderation' inverts it. (3) Shirky's situated software is software for a specific known group that leans on that group's social fabric. Kessler is built for anonymous strangers, which Shirky would class with the 'Web School' he contrasts it with. (4) 'Kessler does no moderation' is contradicted by the word blocklist and link filter in src/lib/launch.ts:28-108. PLAN.md marks this Won't fix, and the Why page itself says 'Nobody moderates (beyond a small filter on words)'.
- **Why it matters:** 'Argued from sources' is one of the brief criterion's three questions. A marker who knows these texts will see the citations as decoration fitted to a conclusion. The required small-web citations (Shirky, Kazemi) are the ones bent hardest.
- **Verifier:** Real: 'Kessler does no moderation' sits beside the word filter. PLAN.md:259 marks it Won't fix, and the Why page itself says 'beyond a small filter on words', so the README contradicts the Why page. Citing Ostrom for only the monitoring principle is selective, and Kazemi's guide does centre on moderation and screening. Overstated: 'close to the opposite' goes too far. Ostrom's monitoring/visibility is a genuine principle. Kazemi does argue that small size and limits matter. PROCESS.md:159-166 explicitly parts from them ('Kazemi's small communities hold because their members are screened friends; Kessler's sky is full of strangers... Where I part from them is time'), so the process document shows the departure; only the README omits it. That is worth fixing, but it isn't a major misreading.
- **Suggested fix:** Cite them honestly as positions the app departs from. For example: Ostrom needs monitoring and sanctions; Kessler builds only monitoring (the record), because strangers in a 10-minute visit can't sanction, and here is what is lost. Kazemi's small groups hold through moderation and screening; strangers get neither, so the rules (gap, cap, decay) stand in. Say 'no moderation beyond a word filter'. PROCESS.md's 'Where I part from them' paragraph is the right shape; bring it into the README.

#### `brief-extras-shape-the-record`: Invented people are indistinguishable in the record that is the argument's evidence

*Response to the brief · criterion: brief · partly confirmed (raised as major)*

- **Evidence:** README: 'invented people, the extras, launch about 18 a day. Nothing on the page marks them.' Principle 3: 'The sky remembers. Any object's card shows who launched it.' On the live catalogue, collision headlines include 'GOOSE-24 and NIGHTJAR 12 collided'; 'nightjar' is an extras handle (src/lib/extras-cast.ts). Live satellites include 'MARMALADE 1 / marmalade' and 'ESSAY / deadline_dodger', both extras handles. The Why page (src/pages/why/index.astro:25) says 'Kessler is a place to say one thing to the people who are here' and never mentions extras. PLAN.md's review: 'the extras shape the record a visitor reads.'
- **Why it matters:** The argument is that seeing who took what governs the commons, yet a visitor can't tell real takers from scripted ones, and 'heard by' audiences hear lines written by the developer. Disclosing this only in the README, not on any page a showcase visitor sees, invites a marker to call it dishonest or a fake-activity feature with no reason in the argument.
- **Verifier:** Confirmed that extras handles (nightjar, marmalade, deadline_dodger in src/lib/extras-cast.ts:70,229,282) appear unmarked in the live catalogue, and that the Why page never mentions extras. But the README, which is the marker's starting point, discloses them plainly and gives a reason ('A quiet sky would be empty... they never listen, so heard by is still only people'), and ADR 0021 documents them. The finding isn't dishonest disclosure. It is a defensible design choice that is argued thinly. Minor.
- **Suggested fix:** Either mark extras subtly on their cards ('a regular invented to keep the sky populated') and say so on /why/, or argue in the README why unmarked is necessary. Cite the measured effect (ADR 0021: burn-up 57% with vs 62% without).

#### `brief-readme-sources-render-as-lists`: /readme/ renders two Sources entries broken: '1968.' and '2004.' become ordered-list markers

*Response to the brief · criterion: deployed-app · confirmed*

- **Evidence:** README.md wraps lines so a continuation line starts with '1968.' and '2004.'. The renderer treats each as an ordered list: `grep -o '<li>G\. Hardin.{0,200}' readme.html` gives '...1243–1248,<ol start="1968">'; same for Shirky with '<ol start="2004">'. The same output comes from the live /readme/. Screenshot /Users/advaymenon/.claude/jobs/3ff57576/tmp/brief/readme-desktop.png shows '1968.' and '2004.' outdented on their own lines. The mobile screenshot (readme-mobile.png) shows the same.
- **Why it matters:** Markers start at /readme/ with only the URL. A visibly mangled bibliography on the first page read is a small but avoidable credibility hit.
- **Verifier:** Reproduced. curl of /readme/ on the local server (8093) and the live app (GET only) both contain '<ol start="1968"' and '<ol start="2004"'. The README source lines wrap so a continuation line starts with '1968.' and '2004.' (README.md Sources). It is visible on the first page a marker reads. Trivial to fix.
- **Suggested fix:** Re-wrap the two source lines so no line starts with 'NNNN.' (e.g. keep the year on the previous line, or write '(1968)'), then check /readme/'s HTML has no <ol start=...> inside Sources.

#### `process-crowd-low-claim`: Line 7 asserts 'People typically crowd the low band', which is unmeasured and contradicted by the project's own runs and README

*PROCESS.md · criterion: brief · partly confirmed (raised as major)*

- **Evidence:** PROCESS.md:7: 'People typically crowd the low band to be heard more, and crowding causes collisions'. The word 'typically' was added today in c1e5cd7. README.md lists 'Whether people crowd low. Launch counts per band will show it.' under 'Judged, not tested', and PLAN.md:261 says 'with no count made yet'. The repo's own measurement (notes/log.md, 2026-10-23, `node scripts/balance/index.ts 12 0.6 quiet|crit`) found 'in a quiet sky ... everyone low gives 0.44 collisions an hour, everyone high 0.75'. So in a quiet sky crowding low causes fewer collisions, and the cost only appears at crit density. CLAUDE.md: 'Numbers about the sky's balance come from a run, never an estimate.'
- **Why it matters:** This is the premise of the whole app, stated as observed fact in the first paragraph a marker reads. It disagrees with the README's own enforced/judged split and with the student's measured data, which costs credibility on 'separates enforced from judged'.
- **Verifier:** PROCESS.md:7 does say 'People typically crowd the low band', and c1e5cd7 added 'typically'. README.md:47 lists 'Whether people crowd low' as judged, with no count. So stating it as observed fact is an unmeasured claim and is inconsistent with the README. The reviewer goes further than the evidence supports in two places. First, the README's own opening line (README.md:5) makes the same premise claim ('Crowding the low band to be heard more causes collisions'), so the two documents agree. Second, 'crowding causes collisions' is generally true: the quiet-sky 'everyone low' figure (0.44 vs 0.75/h) is lower because low satellites burn up sooner, which is not evidence against crowding causing collisions. It is a real accuracy and consistency nit in the opening, but it is the design premise rather than a balance number. Minor, not major.
- **Suggested fix:** Say 'The low band is heard more often, and at a crowded crit, crowding it causes more collisions (measured: ...)', or move the claim to what is still judged.

#### `process-workflow-thin-rationale-removed`: The workflow section asserts rather than argues, and today's edit deleted its only rationale sentence

*PROCESS.md · criterion: process · partly confirmed (raised as major)*

- **Evidence:** PROCESS.md:16-28 has two short paragraphs (~80 words). c1e5cd7 removed 'Sessions start fresh, so memory lives in files' and the 'each design change a proposed ADR' clause, and changed line 18 to 'PLAN.md holds discussions between me and the agent', which is inaccurate: discussions live in notes/log.md and PLAN holds decisions and status. There are no trade-offs or costs of ADR-per-decision, overnight PRs, or log-every-hash (60 of 195 non-merge commits are 'Log ... hash' follow-ups, per `git log --oneline | grep -c -i hash`). Line 25 says 'Big changes ran overnight in a worktree', but CLAUDE.md:93 says 'Work directly on main; avoid git worktrees unless an automated session's tooling requires one', and the exception isn't explained. Line 21 says 'the agent laid out options without recommending one', but line 14 says 'the full 3D globe the agent suggested' and line 109 'I accepted three of its proposed ADRs'.
- **Why it matters:** The spec says PROCESS must argue workflow choices and their trade-offs, and marks down 'process asserted rather than shown'. The workflow is the student's most distinctive practice (ADRs, a plan, a log), and it gets the fewest words and no costs.
- **Verifier:** Confirmed: the workflow section (PROCESS.md:16-28) is about 80 words with no costs or trade-offs. c1e5cd7's diff removed 'Sessions start fresh, so memory lives in files' and 'each design change a proposed ADR'. 60 of 195 non-merge commits match 'hash'. 'PLAN.md holds discussions between me and the agent' is loose, since discussions live in notes/log.md. The contradiction claims are weak, though. CLAUDE.md:93 allows worktrees when 'an automated session's tooling requires one', and the overnight runs were automated sessions, so there is no real conflict. ADR 0005 lists the globe as one option, so 'the agent suggested' is compatible with 'options without recommending'. 'Proposed ADRs' are still options for the student to accept. The thinness is real against 'argue workflow choices and their trade-offs', but the harness section does show workflow reasoning at length, so I downgrade to minor.
- **Suggested fix:** Restore the 'sessions start fresh' reason. Add one cost per practice (for example, 60 hash follow-up commits as the price of citable evidence, or ADR churn) and one rejected alternative. Reconcile the worktree line with CLAUDE.md.

#### `process-miscited-hashes`: Several cited hashes don't contain what the sentence claims

*PROCESS.md · criterion: process · partly confirmed*

- **Evidence:** (1) Line 14 cites 5c41ccd for passing on the 3D globe. 5c41ccd is the launchpad rebuild (ADR 0006). The globe option and the 'diagram, not a sky' reasoning are in ADR 0005, commit f8f7003 (`git show f8f7003 | grep globe` hits 'Three.js, full 3D globe and inclined orbits'). (2) Line 140 cites 41f32ef for 'the crit 9 review showed they'd likely see no collision'. That review is logged in 44487ac (`git log -S'A marker will likely see no collision'` returns 44487ac), and it was an agent's Sonnet adversarial review (notes/log.md:950), not the crit. (3) Line 20 cites 10c86a5 for 'each decision is an ADR, superseded rather than edited'. 10c86a5 only adds PLAN.md; doc/adr and the 'never edited' rule arrive in 183d624. (4) Line 23 cites 9247b01 for 'without recommending one'; that phrase is in 183d624's log entry (notes/log.md:25). (5) Line 134 cites 3469642 for the Why page fix, but merge 2d8f515 dropped it and it only re-landed in 9096558 (notes/log.md:4284). The repo's own review caught this and the citation was never updated.
- **Why it matters:** Process is read 'against the commits'. A marker who opens a cited hash and finds something else counts it against legibility. check:evidence only checks that hashes resolve, not that they match.
- **Verifier:** (1) Confirmed. 5c41ccd is the launchpad rebuild and ADR 0006, with no globe mention in its docs. The globe option and the 'diagram' reasoning are in ADR 0005 (0005:8 'read as a diagram', 0005:31 'full 3D globe'), from f8f7003. (2) Confirmed. 41f32ef's log has no such review. `git log -S'A marker will likely see no collision'` returns 44487ac, and notes/log.md:950-958 shows a Sonnet agent review during C9, not the crit itself. (3) Partly right. 10c86a5's PLAN says decisions 'go into doc/adr/', but the 'never edited / supersedes' rule arrives in 183d624. (4) Refuted. 9247b01's log entry says 'the agent gave options with trade-offs and I picked', which supports the sentence. (5) Partly right. 3469642 did make the Why-page fix; a merge (2d8f515) dropped it and 9096558 re-landed it. The citation is incomplete rather than wrong. Several citations are real misses, so a marker who clicks through finds the wrong commit. That is minor, not more.
- **Suggested fix:** Re-point: globe to f8f7003 (ADR 0005); the no-collision review to 44487ac, called 'an agent review in crit 9'; ADRs and supersede to 183d624; add 9096558 beside 3469642.

#### `process-screenshot-caption-wrong`: Second screenshot's caption says 'one line per band', but the image shows two lines per band, and it is a recreation not logged anywhere

*PROCESS.md · criterion: process · confirmed*

- **Evidence:** PROCESS.md:61 caption: 'The same screen after the bands went back to rows: one line per band, and it still fits'. In notes/screenshots/2026-11-07-launchpad-bands-as-rows-59480dd.png each band has the name plus 'round the planet every 3 minutes' on one line and 'Heard most often. Burns up in 1 to 8 hours.' on a second. One-line bands only arrived on 2026-10-31 (15495a2). The file was added 2026-11-07 in c1e5cd7, a recreation of 59480dd's state rather than evidence from the time, and `grep -n 'c1e5cd7\|bands-as-rows' notes/log.md` finds no log entry, against CLAUDE.md's 'Every log entry gets its commit hash' and screenshot rules.
- **Why it matters:** A visible factual mismatch between caption and image in the evidence document, and the student's own logging rule is broken in the last commit.
- **Verifier:** I viewed notes/screenshots/2026-11-07-launchpad-bands-as-rows-59480dd.png. Each band has two lines: name plus period, then 'Heard most often. Burns up in 1 to 8 hours.' The caption at PROCESS.md:61 says 'one line per band'. The file was added in c1e5cd7 on 11-07, a re-shoot of an old state. `grep 'c1e5cd7|bands-as-rows|2026-11-07' notes/log.md` finds nothing, and the log ends at the 21de098 entry, so the commit breaks the repo's own log-every-change rule. The caption mismatch is visible but small.
- **Suggested fix:** Change the caption to 'two lines per band, each note whole', mention it was re-shot at 59480dd, and log the c1e5cd7 change with its hash.

#### `process-moderation-contradiction`: 'Kessler does no moderation' contradicts the app's word filter and its own Why page

*PROCESS.md · criterion: brief · confirmed*

- **Evidence:** PROCESS.md:161 'so Kessler does no moderation, only a record of what each launch cost'. src/lib/launch.ts:41 has a BLOCKED word list with a link filter. src/pages/why/index.astro:105 says 'Nobody moderates (beyond a small filter on words)'. PLAN.md:259 lists the README's same line as 'Won't fix'.
- **Why it matters:** A marker who tries a rude beacon sees it refused, which contradicts the 'What good means here' argument in two documents. The app's own page is more accurate than PROCESS.
- **Verifier:** PROCESS.md:161 says 'Kessler does no moderation'. src/lib/launch.ts defines a BLOCKED word list and a link filter, and src/pages/why/index.astro:105 says 'Nobody moderates (beyond a small filter on words)'. README.md:16 makes the same claim, and PLAN.md:258-259 lists it as a conscious 'Won't fix'. The inconsistency is real and checkable by a marker who types a rude beacon, but it is small.
- **Suggested fix:** Say 'no moderation beyond a small word filter', and say why that line was drawn there (a line shown to every stranger).

#### `process-stack-no-costs`: The stack section names rejected alternatives but no costs of the chosen stack

*PROCESS.md · criterion: process · confirmed*

- **Evidence:** PROCESS.md:14 gives reasons for Astro/SSE/clock-derived positions/Three.js, but no consequences. ADR 0001/0004 list them: one in-memory fan-out that only works on one machine, events missed while disconnected are covered by a snapshot rather than replayed, proxy buffering, Three.js '~185 kB gzipped chunk' (ADR 0005). Also, 'Both frameworks were new to me' follows a sentence naming Astro, SvelteKit and Phoenix, so 'both' is ambiguous. The whole section is one ~150-word line.
- **Why it matters:** The spec says 'argue stack ... choices and their trade-offs'. Reasons alone read as justification, not trade-off.
- **Verifier:** PROCESS.md:14 gives reasons for Astro/SQLite/SSE, clock-derived positions and Three.js, plus the rejected alternatives, but states no cost of any choice: single-process fan-out, no replay, chunk size and so on. The spec asks for 'choices and their trade-offs'. 'Both frameworks were new to me' follows 'over SvelteKit or Phoenix LiveView and WebSockets', and LiveView is the framework there, not Phoenix, so 'both' reads ambiguously. Real, but the section does name alternatives and reasons, so minor.
- **Suggested fix:** Add one clause per choice on what it cost (for example, 'SSE ties the app to one process, which the one-machine constraint allows'). Say 'SvelteKit and LiveView were both new to me'.

#### `process-showcase-room`: The balance argument is framed around a lone ten-minute marker, not the co-present showcase room the spec asks for

*PROCESS.md · criterion: brief · partly confirmed*

- **Evidence:** PROCESS.md:138 'whoever marks it visits for ten minutes', and lines 152-154 quote only quiet-sky figures (57%, 99.5%). The crit-density figures exist (ADR 0021 table: 29% burn up at a crit; notes/log.md 2026-10-23: everyone low 6.1 collisions/h at a crit; 'A watcher's collisions are nine in ten staged', PLAN.md:280) but aren't discussed.
- **Why it matters:** The spec says to design for co-presence (a room full of simultaneous users). PROCESS's balance story reads as tuning for the marker, and it doesn't disclose that nearly all of what a watcher sees is staged.
- **Verifier:** PROCESS.md:138 frames balance around 'whoever marks it visits for ten minutes', and :152-154 quote only quiet-sky figures. Crit-density numbers exist in the log (notes/log.md:4303-4310: at a crit, everyone low 6.1/h; watched, 5.56 of 6.25 collisions/h staged) but are not discussed. The README does admit 'most are still staged' (README.md:49), so the staging isn't hidden overall. The co-presence gap in PROCESS's argument is real but secondary.
- **Suggested fix:** One sentence on what a full room does (crit-density numbers) and one admitting most of what a watcher sees is staged.

#### `evidence-authorship-provenance`: Agent authorship of the student documents is visible in history, and the log entries recording it were deleted

*Other process evidence · criterion: process · partly confirmed (raised as major)*

- **Evidence:** (1) PROCESS.md: commit 3ba6956 (Co-Authored-By Claude Opus) is logged as 'PROCESS.md redrafted to about 1,200 words ... A draft for Advay to rewrite in their own words' (notes/log.md ~4082-4085). A difflib comparison of current PROCESS.md against that draft and against Advay's earlier 6200f2f, counting only matching runs of 6+ words (README.md as a control matched 40 words), found 466 of 1394 words traceable only to the agent draft, 510 to Advay's earlier text and 418 to neither. (2) README.md's enforced list was extended by commits authored by 'Claude' (6a34288, 9096558) after Advay's rewrite. (3) reflections/crit-8.md (5ad94df) and crit-9.md (a996c1b) carry 'Co-Authored-By: Claude'. (4) Commit 95ba88f 'Drop the write-up entries from the log' deleted 59 lines, including 'The section's dot points are now prose' (PROCESS.md, 099b47b) and 'Drafted `reflections/crit-9.md` with Advay, then cut to 169 words and reworded'.
- **Why it matters:** The spec says the documents are written by the student, and markers read PROCESS.md against the commits. Deleting log entries that describe agent drafting goes against CLAUDE.md's 'Log generously', and it looks like hiding to anyone who runs `git log -p notes/log.md`. This is a risk to marker trust, not a proven breach: the remaining log still openly says 'a draft for Advay to rewrite'.
- **Verifier:** Confirmed facts: 3ba6956 (the PROCESS.md redraft), 5ad94df (crit-8) and a996c1b (crit-9) carry 'Co-Authored-By: Claude Opus'. 6a34288 and 9096558 have Claude as author and touch README.md. 95ba88f deleted 59 log lines, including 'PROCESS.md cleared and redrafted as dot points' and 'Drafted `reflections/crit-9.md` with Advay'. Overstated: 95ba88f was committed by Advay himself on 10-10 with an honest subject ('Drop the write-up entries from the log'), and the surviving log still says openly at :3854 and :4085 'A draft for Advay to ... rewrite in their own words'. So 'looks like hiding' is weak. I did not re-run the difflib attribution (466/510/418), so that number is unverified. The real risk is the co-author tags on the reflections and the README edits by the Claude identity. That warrants a disclosure, but it is not proven to breach 'written by the student'.
- **Suggested fix:** Say plainly in PROCESS.md how the documents were produced (agent drafts from the log, rewritten by Advay, with which parts his). Rewrite the surviving agent-draft passages in his own words. Don't delete further log history.

#### `evidence-main-vs-worktree-contradiction`: CLAUDE.md says 'Work directly on main; avoid git worktrees', but the history and PROCESS.md show the opposite

*Other process evidence · criterion: process · partly confirmed (raised as major)*

- **Evidence:** CLAUDE.md: '- Work directly on `main`; avoid git worktrees unless an automated session's tooling requires one.' (added f9497fe, 09-29, never revised). `gh pr list --state all` lists 13 PRs from `claude/*` or `C9`/`C10` branches (#1-#16), and 24 merge commits. PROCESS.md: 'Big changes ran overnight in a worktree and came back as a pull request (PR #7).'
- **Why it matters:** Markers read PROCESS.md against CLAUDE.md. A rule the history openly contradicts suggests CLAUDE.md isn't the live harness, and nothing explains the change from main-only to PR branches. That is 'process asserted rather than shown'.
- **Verifier:** CLAUDE.md:93 says 'Work directly on `main`; avoid git worktrees unless an automated session's tooling requires one', and PROCESS.md:25 says 'Big changes ran overnight in a worktree and came back as a pull request'. The PR list has 13+ claude/* branches and the history has 24 merge commits. But the rule carries an explicit exception for automated sessions, and the claude/* overnight and cloud PRs are exactly that, so most of the history fits the rule. The real gap is small: the C9 and C10 human branches (PR #1, #15), and the fact that neither document reconciles the 'avoid worktrees' default with worktrees being the main route for big changes. Not a major contradiction.
- **Suggested fix:** Update CLAUDE.md to the actual practice (direct on main for small interactive work; overnight or cloud agents in a branch or worktree, returned as a PR for review), with a one-line reason. Mention the change in PROCESS.md.

#### `evidence-plan-stale`: PLAN.md status is stale and contradicts itself

*Other process evidence · criterion: process · confirmed*

- **Evidence:** Last updated '2026-10-31'. Missing: the 11-03 live-suite incident and production cleanup (21de098), the lockfile repair (37df5a2), the wordmark drop (3b33f93) and today's PROCESS.md change. Stale lines still in 'Status and next steps': 'Overnight round, 2026-10-07 (... a PR for Advay; not on `main`)' and 'All of it is in PR #7 ... for Advay to review' (merged 10-07, d8fb66a); 'For Advay: accept (or change) ADRs 0015–0018' (accepted 072c40d); 'the README is now further out of date (it says 60 characters...)'; 'Not committed yet.' (staged collisions, committed a286df9/4e34a4a); 'pnpm test:layout passes 12 of 12' while later log entries say 16 of 16. CLAUDE.md:69 says 'Known failures are in PLAN.md's status', but there is no known-failures entry.
- **Why it matters:** CLAUDE.md tells every agent to read PLAN.md first and to 'Update its status section when a step is done'. At 9,394 words with stale instructions, it misleads a fresh agent and shows a marker that the rule isn't followed.
- **Verifier:** PLAN.md:9 says 'Last updated 2026-10-31'. I verified the stale lines: :69 'Overnight round, 2026-10-07', :111 'accept (or change) ADRs 0015–0018', :113 'README is now further out of date', :130 and :249 'test:layout passes 12 of 12' (the log says 16 of 16 at :4445/:4489), and :151 'Not committed yet.' CLAUDE.md:69 points to known failures in PLAN.md's status, and no such list exists. PLAN.md is not a required deliverable, so this is minor, but it shows the 'update status' rule isn't kept.
- **Suggested fix:** Collapse the done C8-C10 history into a few lines with hashes, delete the superseded to-dos, add the 11-03 incident, and add an explicit 'Known failures / open bugs' list (turnAt flicker, README won't-fixes).

#### `evidence-recurring-correction-not-ruled`: Date-dependent and shared-sky test failures recurred, but never became a CLAUDE.md rule or a structural fix

*Other process evidence · criterion: process · partly confirmed*

- **Evidence:** Two date-dependent extras test failures in a week: fb18419 ('Find the extras log test a day with a manoeuvre in it') and 9096558 (notes/log.md ~4270: 'pnpm check went red with no code change ... The second date-dependent extras test in a week'). PLAN.md: 'Two date-dependent extras tests in a week (`fb18419`, and this one): maybe a CLAUDE.md rule.' `grep -n -iE 'clock|date' CLAUDE.md` finds nothing. The 10-17 CI flake (another test's satellite collided with this one mid-test) was 'fixed' by having the test accept `gone` (PLAN.md 'CI on main (2026-10-17)').
- **Why it matters:** The spec says corrections should land in CLAUDE.md or spec/, not just as retries. Here the project itself spotted a pattern and left it as 'maybe'.
- **Verifier:** Confirmed: `grep -iE 'clock|date' CLAUDE.md` finds only line 161 (a screenshot filename) and no testing rule. PLAN.md:288-289 leaves it as 'maybe a CLAUDE.md rule'. The 10-17 flake was fixed by having the test accept `gone` (PLAN.md:290-294). Partly offset: 9096558 did make the specific extras test clock-proof, so there was a structural fix in spec/, just not a general rule. Real, but a modest process gap.
- **Suggested fix:** Add a CLAUDE.md test rule: tests pass the clock in or sweep it, never depend on the wall-clock hour, and tests that share the running sky isolate their objects (e.g. an empty band or tagged owners) rather than loosening assertions.

#### `evidence-log-hash-gaps`: 17 log entries have no commit hash, and several commits (including the README write-up) have no log entry

*Other process evidence · criterion: process · confirmed*

- **Evidence:** An awk scan of `## ` entries for any 7-hex token finds 17 without one, e.g. '2026-10-04 — C8 slice: launch, the sky, live updates', '2026-10-04 — Adversarial review of the C8 slice, and fixes', '2026-10-06 — A page explaining Kessler syndrome' (356e469 exists), '2026-10-06 — C9: operators you can claim (login)', '2026-10-07 — C9: the handle nudge becomes a pop-up'. All predate the hash rule (a52b08b, 10-07) and were never backfilled. Commits never mentioned in the log: c1e5cd7 (today's PROCESS.md edit and screenshot), 2148e48 ('Write up the readme', the argument itself), 4f6771c (crit-10 reflection), 6200f2f, 4d246bc.
- **Why it matters:** CLAUDE.md: 'Every log entry gets its commit hash, every time ... an entry without one is evidence lost.' The README write-up, central to 'response to brief', has no process trail at all.
- **Verifier:** My awk scan of `## ` entries without a 7-hex token also returns 17. A `grep -c` for c1e5cd7, 2148e48 ('Write up the readme'), 4f6771c, 6200f2f and 4d246bc in notes/log.md gives 0 for each. Most gaps predate the hash rule, but the README write-up and the final PROCESS.md revision having no log entry is a real hole in the trail.
- **Suggested fix:** Backfill hashes for the 17 entries where a commit exists, and add short entries for the README write-up and the final PROCESS.md revision, with hashes.

#### `evidence-process-missing-c10-and-radio`: PROCESS.md never mentions the crit 10 logging work (ADRs 0022-0025) or the radio that was built and scrapped (ADR 0026)

*Other process evidence · criterion: process · confirmed*

- **Evidence:** `grep -n -iE 'log|instrument|0023|0026|radio' PROCESS.md` matches nothing relevant. The history shows substantial work in both: PR #14 and #15, ADRs 0022-0025, the live-log findings 1-8 (PLAN.md 10-19), and ADR 0026 'rejected; built, heard, removed' after three Opus reviews (notes/log.md 2026-10-31). Neither marking viewport, nor mobile, is mentioned in PROCESS.md or README.md.
- **Why it matters:** The scrapped radio is a ready-made 'built, judged, rejected against the argument' story, the kind of evidence the brief rewards, and the live-log findings show 'flying by instruments'. Leaving both out makes a third of the commit history unexplained.
- **Verifier:** `grep -n -iE 'radio|0026|instrument|logs' PROCESS.md` returns nothing, and `grep -iE 'mobile|phone|viewport' PROCESS.md README.md` returns nothing either. ADR 0026 (radio built, reviewed by three Opus agents, rejected) and the C10 logging work (PRs #14/#15, ADRs 0022-0025) are absent. It is a missed opportunity rather than a requirement breach, since there is a word limit and it is already over.
- **Suggested fix:** Replace some current wording with two or three sentences: the radio built, reviewed and rejected (ADR 0026), and one live-log finding that changed the app (e.g. the double sky render or the replayed conjunctions). Cite hashes.

#### `evidence-claude-md-stale-lines`: CLAUDE.md opens with stale, contradictory setup text and is long for a fresh agent

*Other process evidence · criterion: process · confirmed*

- **Evidence:** CLAUDE.md line 7-8: 'Stack ... Not installed yet; `/comp4020:stack` sets up the Astro default.' The stack was installed in 618d80a (10-04). It also still says 'Kessler (working title)'. 187 lines / 1591 words, and it points agents at PLAN.md (9,394 words) and notes/log.md (43,633 words) as required reading 'before planning or building'.
- **Why it matters:** A fresh agent may run /comp4020:stack on an installed repo. Required pre-reading of about 55k words is costly, and the harness doesn't look maintained.
- **Verifier:** CLAUDE.md:8 still says 'Not installed yet; `/comp4020:stack` sets up the Astro default.' while the stack is clearly installed (dist/, src/, pnpm check). PLAN.md's title still says 'Kessler (working title)', and so does CLAUDE.md. Word counts confirmed: CLAUDE.md 1591, PLAN.md 9394, notes/log.md 43633. A marker reading CLAUDE.md as the live harness sees an unmaintained opening line. Minor.
- **Suggested fix:** Delete the 'Not installed yet' sentence and '(working title)'. Point agents at PLAN.md's status section only, and at the log only when they need history.

#### `evidence-extras-honesty-regressed-untested`: The extras honesty fix regressed twice and still has no test

*Other process evidence · criterion: spec-contract · partly confirmed*

- **Evidence:** 3469642 fixed the Why page's 'real people's words' and added a README line saying the sky is seeded. Merge 2d8f515 ('dropping the PR's README and Why copy') reverted both. 9096558 fixed the Why page again (10-23). `grep -rn -iE 'seeded|invented|real people|extras' spec/kessler.test.ts spec/question.test.ts` finds no assertion, and 9096558 touched only spec/extras-server.test.ts and spec/log.test.ts.
- **Why it matters:** PROCESS.md cites this fix as proof of honesty ('Both were fixed; the README says the sky is seeded'). A claim that has regressed twice without a check is exactly what CLAUDE.md's 'add regression coverage for a distinct, plausible failure that could recur' covers.
- **Verifier:** No test exists: a grep of spec/ for 'real people|invented|seeded' finds nothing about the Why page or the README's extras line. The history is 3469642 fixing it, merge 2d8f515 dropping the fix, then 9096558 restoring it (diff confirmed: 'noise made of real people's words' became 'one line torn up and mixed with a stranger's'). That is one regression, not two. The current /why/ has no 'real people' claim (only an HTML comment at :136). PROCESS.md:133 cites the fix as evidence. A cheap regression test is missing for a failure that has already recurred once.
- **Suggested fix:** Add a spec assertion that /why/ doesn't claim every voice is a real person, and that /readme/ mentions the invented launchers.

#### `spec-launch-gap-not-pinned`: 'A minute between launches' is claimed as tested, but halving the gap leaves the whole suite green

*Spec suite · criterion: spec-contract · confirmed (raised as major)*

- **Evidence:** In a scratch copy I set src/lib/sky.ts:34 `LAUNCH_GAP = 30_000`, built it into the scratch dist and served it on 8096 with a fresh DB. Full vitest run: 'Test Files 31 passed, Tests 431 passed'. The in-process test compares against the constant it checks: spec/decay-server.test.ts:87-91 uses `start + sky.LAUNCH_GAP - 1_000` and `start + sky.LAUNCH_GAP`. The HTTP tests (launch.test.ts:79-90, operator.test.ts:104) only check that an immediate second launch is refused with 'launch again in'. FirstLaunch.astro:16 rounds `LAUNCH_GAP/60_000`, so a 30 s gap still prints '1 minute': the copy would be wrong and nothing would notice. Only a gap of 11 s (rounds to 0) was caught, by the sky.test.ts copy regex. README.md lists 'a minute between launches' under 'Enforced, and tested'.
- **Why it matters:** CLAUDE.md says: 'A test that compares against the constant it checks can't fail; compare against a fixed value.' Here the README's enforced claim breaks that rule, and the 'Response to brief' criterion marks down README promises the checks don't keep.
- **Verifier:** In a scratch copy I set LAUNCH_GAP = 30_000 and ran decay-server, log.test and sky.test: 'Test Files 3 passed, Tests 64 passed'. decay-server.test.ts:87-95 uses start + sky.LAUNCH_GAP, comparing against the constant it checks, which is exactly what CLAUDE.md forbids. log.test.ts:195 refuses a launch at T+10_000, which holds for any gap over 10 s. The HTTP tests (launch.test.ts:87, operator.test.ts:104) only match /launch again in (\d+ min )?\d+ s/. The copy check (sky.test.ts:41, /1 minute|a minute/) passes because FirstLaunch.astro:16 computes Math.round(30_000/60_000) = 1, which renders 'a minute'. I didn't rebuild dist to rerun the HTTP suite (the rules forbid it), but by inspection none of those assertions pins 60 s. README.md:35 lists 'a minute between launches' as 'Enforced, and tested'. The finding is real. I rate it minor rather than major because the behaviour is correct as shipped and a marker would need to mutation-test to see it. Its weight is as process evidence: it breaks the project's own rule.
- **Suggested fix:** In decay-server.test.ts use fixed values: a launch at start+59_000 is refused with /launch again in 1 s/ and one at start+60_000 succeeds. In launch.test.ts, assert that the wait shown right after a launch is between 50 and 60 s.

#### `spec-suite-not-rerunnable`: The suite fills the sky: the 4th run against the same running app fails 52 tests

*Spec suite · criterion: spec-contract · confirmed*

- **Evidence:** Against my own server on 8096 with one scratch DB: runs 1-3 passed 431/431. Run 4 gave 'Test Files 7 failed | 24 passed; Tests 52 failed | 379 passed', almost all 'expected 422 to be 303' from launches refused as sky-full. Live satellites in the scratch DB after each run: 109 after run 2, 184 after run 3, 193 after run 4 (cap 200). The server log has 56 `reason=sky-full` refusals. This isn't documented in spec/README.md, CLAUDE.md or PLAN.md; CLAUDE.md even says to keep the app running locally while working.
- **Why it matters:** CI uses a fresh tmpfs /data, so the contract holds there. But a local run is order- and state-dependent: after a few runs, a developer or marker running `pnpm check` against a long-lived local server sees a wall of red that has nothing to do with the code.
- **Verifier:** I ran the full suite four times against my own server on one fresh scratch DB. Runs 1 and 2: 431 passed. Run 3: 59 failed | 372 passed. Run 4: 61 failed | 370 passed. Failures are dominated by 'expected 422 to be 303' (34 occurrences in run 3), and the server log has 128 reason=sky-full refusals. So it degraded even faster than the reviewer saw (run 3, not run 4). spec/README.md and CLAUDE.md say nothing about needing a fresh DB, while CLAUDE.md says to keep the app running locally. CI uses --tmpfs /data (checks.yml:38), so the contract still holds there. Minor is right.
- **Suggested fix:** Have global-setup fail fast with a clear message when the target sky is near SKY_CAP ('start from a scratch DATABASE_PATH'), or document the fresh-DB requirement in spec/README.md and CLAUDE.md. Better: run the server under test with a large SKY_CAP from the test harness.

#### `spec-evidence-gate-thin`: check:evidence passes but doesn't check PROCESS.md length; PROCESS.md is 1394 words against a 900-1100 spec

*Spec suite · criterion: spec-contract · partly confirmed (raised as nit)*

#### advay: wont fix

- **Evidence:** `pnpm check:evidence` printed '✓ reflections/crit-8.md, reflections/crit-9.md, reflections/crit-10.md' and '✓ PROCESS.md: 29 cited commit(s), all resolve'. `wc -w PROCESS.md` = 1394, which includes link markup, so the prose count is lower. Unverified how far over it is. scripts/check-evidence.ts is the course-supplied script and was never edited.
- **Why it matters:** The gate is green, but it doesn't check a deliverable constraint the marker reads against. That belongs to the PROCESS dimension; noted here because green evidence isn't proof the evidence meets the spec.
- **Verifier:** wc -w PROCESS.md gives 1394. Stripping link URLs and backticks gives 1313. Also removing image captions, bare commit/PR link labels, headings and table rows gives about 1206. Every way of counting puts it over the 900-1100 spec. The most generous count (1206) sits just under the '1,210 cap' that PLAN.md:286 uses (apparently +10%). check-evidence.ts is course-supplied and unedited (git log shows only 14ca2c9 Initial commit), so the gate not counting words isn't a student failing. The real issue is that PROCESS.md runs over length, which counts against the process criterion (50%). That's worth more than a nit, but how much it's over depends on how it's counted, so minor.
- **Suggested fix:** Count PROCESS.md's prose words (stripping links and code) and trim to 900-1100 if it's over. Optionally add a word-count check to a project-owned script, not the supplied one.

#### `ux-handoff-lands-on-empty-horizon`: After launching, the payoff view is a station horizon where your satellite isn't visible for about 2.5 minutes

*First-visitor UX · criterion: deployed-app · partly confirmed (raised as major)*

- **Evidence:** Launched UXTEST (Low) from a fresh visitor at 1920x1080. After the rocket animation (~10 s) and the 6-section 'Your first launch' dialog, 'Watch it fly' leaves the view switched to Canberra, not Whole sky (sky-after-launch.png). The horizon shows a few unrelated streaks, and the only sign of your satellite is a small chip 'UXTEST rises in 2 min 17 s ›' bottom right. Your satellite appears only after opening the card or switching to Whole sky (sky-mobile-launched.png shows it ringed there).
- **Why it matters:** In a showcase or marking session, the moment after 'Launch' is when the visitor decides whether this is worth their attention. A mostly empty horizon with a countdown says nothing happened, and the marker with two sessions side by side has to know to press Whole sky to see the other session's launch.
- **Verifier:** Reproduced: after launching VERIFYUX (Low) locally at 1920x1080, 'Watch it fly' leaves the view on Canberra (aria-pressed shows 'Canberra'), not Whole sky, and the satellite is not on the horizon. Only an edge chip '‹ VERIFYUX rises in 19 s' shows it (after-launch.png). But the claim that the chip is the only sign is false. The same screen shows a notice 'VERIFYUX is in orbit…', 'VERIFYUX (yours) to Low just now' at the top of Sky now, and 'VERIFYUX is next over Madrid in 23 s' in Beacons. The wait depends on orbital phase (19 s for me, 2 min 17 s for the reviewer). This is a real weak moment, but overstated as major.
- **Suggested fix:** Land on Whole sky with your satellite ringed and labelled, and offer the station view as a follow-up ('Follow it over Canberra'). Alternatively, switch to whichever station it will pass over first.

#### `ux-extras-backdated-and-unmarked`: Invented people look real: backdated launches, handles and answers on a sky seconds old

*First-visitor UX · criterion: brief · confirmed*

- **Evidence:** On a fresh scratch DB created seconds earlier, /sky/ listed 'ALBATROSS to Low 4 h ago', 'ESSAY to Mid 10 h ago', 'Sky Pigeon to Mid 12 h ago'. /object/27/ reads 'Launched by marmalade 4 h ago.' ESSAY (handle deadline_dodger) 'answers' today's question with '"I heard you."' The catalogue Operator column shows 'marmalade', 'deadline_dodger' and 'pipsqueak'. A grep of the HTML of /, /why/, /sky/, /kessler/ and /catalogue/ finds no 'invented' or 'extras'. README: 'Nothing on the page marks them.'
- **Why it matters:** The README discloses this, so it is a judged choice rather than a lie. But a marker reading the sky would believe a dozen other people are present and active. 'Heard by' is enforced as people only, and a visitor who sees busy handles and then gets 'Heard by nobody else yet' on their own beacon may conclude the count is broken. It also sits awkwardly with the app's Ostrom framing that users 'can see the state of the resource'.
- **Verifier:** My scratch DB was created seconds before. Its /sky/ Sky now listed 'ALBATROSS-2 to High 4 h ago', 'MARMALADE 1 to Mid 5 h ago' and 'ESSAY to Mid 10 h ago'. Heard showed 'ESSAY deadline_dodger "I heard you." Answering …'. Nothing on / or /why/ mentions extras or invented launches (grep on live / found none). The README discloses it ('Nothing on the page marks them'), so this is a judged choice and stays minor. Backdating beyond the database's age is a fair criticism.
- **Suggested fix:** Add one honest line on /why/ (and perhaps the Sky now card) saying some satellites are launched by the sky itself so it's never empty, or give extras a subtle mark in the catalogue. At minimum, don't backdate launches beyond the database's age.

#### `ux-handle-modal-friction`: The first Launch of every visit is intercepted by a 'Launch under a handle?' modal that focuses 'Claim a handle'

*First-visitor UX · criterion: deployed-app · confirmed*

- **Evidence:** Pressing Launch (keyboard Enter) on a filled form opened a dialog: 'Launch under a handle?' with a primary 'Claim a handle' (auto-focused, orange), 'I have one: sign in', and 'Launch without a handle' as a weaker underlined link below (after-launch-1.png, mobile-handle-dialog.png). The draft did survive the claim detour: after claiming, #callsign and #beacon still held 'DRAFTKEEP' / 'will this survive claiming'.
- **Why it matters:** README says 'Launching takes seconds; a handle is optional', but the default path adds a modal whose focused action is the optional one. In a showcase room, and for markers testing simultaneous actions, this is friction on the one action that matters, and pressing Enter twice takes you to the operator page instead of launching.
- **Verifier:** Pressing Launch on a filled form locally opened 'Launch under a handle?'. document.activeElement was 'Claim a handle', and 'Launch without a handle' is the last, weaker option (handle-dialog.png). That cuts against the README's 'Launching takes seconds; a handle is optional'. I did not re-verify that the draft survives the detour.
- **Suggested fix:** Focus 'Launch without a handle' (the action the user asked for), or move the handle nudge to the post-launch dialog, which already has 'Claim a handle'.

#### `ux-first-launch-dialog-wall`: The post-launch dialog is a 200-word, six-part wall of text; on iPhone 14 its button sits below the dialog's fold

*First-visitor UX · criterion: deployed-app · partly confirmed*

- **Evidence:** 'Your first launch' dialog has six titled sections (It's heard / It falls / It can collide / Launch again in a minute / Boost it, once / Or bring it down) plus a footer paragraph (handoff-15.png). On iPhone 14: dialog scrollHeight 1050 vs clientHeight 808 (eval), and 'Watch it fly' is not visible without scrolling inside the dialog (mobile-first-launch.png).
- **Why it matters:** It stands between the visitor and seeing their satellite, and most people will dismiss rather than read it. The two sentences that carry the argument (it's heard by whoever's listening; collisions turn words into static for everyone) are diluted by boost and deorbit mechanics a first-timer doesn't need yet.
- **Verifier:** Confirmed at 1920x1080: the 'Your first launch' dialog is 254 words in six titled sections plus a footer, covering boost and deorbit before the visitor has seen their satellite. At desktop it fit (scrollHeight 551 = clientHeight 551). I did not re-check the iPhone 14 overflow (1050 vs 808), so that part is unverified by me. It is a weakness, not a break.
- **Suggested fix:** Cut it to the two or three lines about being heard and collisions, with the button visible. Move boost and bring-down onto the card, where those controls already live.

#### `ux-mobile-sky-order`: On mobile, the nav takes over a third of the first screen and 'Sky now' (counts, collision warnings) is pushed below three mostly empty station boxes

*First-visitor UX · criterion: deployed-app · partly confirmed*

- **Evidence:** iPhone 14 (390x844 asserted). The nav wraps to two rows and with the logo occupies ~0-310 px of 844 (sky-mobile.png). The page is 2645-3469 px tall. The order is canvas, Beacons, station rows (each ~100 px tall, mostly 'Listening' with blank space below), and only then 'Sky now' with the collision-coming notice at ~y 830 of the full page (sky-mobile-full.png).
- **Why it matters:** The marking setup puts one session on mobile. The real-time cue a marker watches for (a launch in 'latest launches', 'Collision coming') is two screens down, so the other session's launch isn't visible on the mobile screen without scrolling. It does appear in the canvas, but only as an unlabelled dot unless it is near the top.
- **Verifier:** iPhone 14 (innerWidth 390, innerHeight 844 asserted). The header ends at 132 CSS px, about 16% of the screen, not 'over a third'. The reviewer read 310 device/screenshot px as CSS px. The order claim is true: Beacons h2 sits at y=741, 'Sky now' at y=1352 and Heard at 1803, so the latest launches and collision warning are about 1.6 screens down, below the station rows. scrollHeight was 2905. The other session's launch shows only as a canvas label.
- **Suggested fix:** Collapse the nav to a menu on narrow screens. Put a one-line Sky now summary (counts plus latest launch plus collision notice) directly under the canvas, and shrink empty station rows to one line.

#### `code-restart-not-same-sky`: 'A restarted server catches up to the same sky' (listed as enforced) only holds with derelicts off, which is how every restart test runs

*Server correctness · criterion: brief · confirmed*

- **Evidence:** README.md:38 lists 'a restarted server catches up to the same sky' as enforced and tested. Every restart or catch-up test sets process.env.DERELICTS = "0" (spec/collision-server.test.ts:24, extras-server.test.ts:19, decay-server.test.ts:16, log.test.ts:80). Production uses DERELICT_BASELINE=20. Derelicts are added as wall-clock settles happen (sky.ts:793-804, one per DERELICT_GAP since the last), with Math.random orbits (placeInBand) and random echoes (sky.ts:636 `orderBy random()`), and collision outcomes are drawn from object ids (collide.ts:205, 238). Reproduction (/Users/advaymenon/.claude/jobs/3ff57576/tmp/code/diverge2.ts) on a copy of data/app.db (last activity 30 Oct), over a 6 h gap, settling once at the end ('stopped') versus every minute ('running'). DERELICTS=20: stopped gives 91 collisions, 9 derelicts added, 0 extras destroyed, 38 live; running gives 93 collisions, 12 derelicts, 1 extra destroyed, 40 live. DERELICTS=0: both give 91 collisions, 29 live, identical.
- **Why it matters:** The marking rubric penalises README promises that the rules and checks don't support. This claim sits in the 'enforced' list, yet the test environment turns off the very mechanism that breaks it. Persistence itself is fine (see strengths); it is the 'same sky' wording that overstates.
- **Verifier:** README.md lists 'a restarted server catches up to the same sky' under 'Enforced, and tested'. Every restart or catch-up test sets DERELICTS=0: collision-server.test.ts:24 (the 'same sky' test at :161), extras-server.test.ts:19-20, decay-server.test.ts:16, log.test.ts:80. Production uses DERELICT_BASELINE=20 (sky.ts:52). keepDerelicts (sky.ts:793-804) runs once per settle at `now`, with Math.random bands, and derelictRow picks its echo with `orderBy random()` (sky.ts:631-637). So when derelicts are topped up depends on how often settle runs. I re-ran diverge2 on fresh copies of data/app.db over a 6 h gap. DERELICTS=20: stopped gave 91 collisions, 9 derelicts added, 38 live; running gave 98 collisions, 19 derelicts, 1 extra destroyed, 52 live. That is a bigger divergence than the reviewer reported, because the random draws differ between runs. DERELICTS=0: both gave 91 collisions and 29 live. Stored state still persists correctly. The enforced claim holds only with the mechanism turned off, which the rubric marks down ('README promises missing from rules and checks'). Minor fits.
- **Suggested fix:** Either narrow the README line, e.g. 'every collision, burn-up and extras' launch in the gap is replayed in order; derelicts are topped up when it wakes', or make the derelict top-up deterministic: compute due derelict times from DERELICT_GAP slots, seed placeInBand and the echo choice from the slot, and insert them inside settle's time-ordered loop like the extras. Then add a restart test with DERELICTS at its default.

#### `good-dilemma-inverted-quiet-sky`: The core social dilemma runs backwards at the density a marker will see

*Is it good? · criterion: brief · partly confirmed (raised as major)*

- **Evidence:** notes/log.md:4303-4311 (2026-10-23 review, `node scripts/balance/index.ts 12 0.6 quiet|crit`, 12 runs each): in a quiet sky low satellites burn up 78% of the time and high ones 34%; everyone flying low gives 0.44 collisions/h, everyone flying high gives 0.75. The cost of crowding low only appears at crit density (6.1 vs 3.9/h, airtime 82% vs 99.8%). PLAN.md:269-275 lists this under 'For Advay to sort'. README.md has not been touched since 6a34288 (2026-10-23), so the README still makes the claim as item 2, 'Being heard more has a cost' (README.md:24-25).
- **Why it matters:** The argument is 'crowding low is individually rational and collectively costly'. The repo's own measurements show that in a quiet sky (what a marker visiting alone meets), going low is the safer choice for you and for everyone. So the dilemma is narrated rather than produced. A marker who reads PLAN.md or the log will find the author knew this and left it unaddressed.
- **Verifier:** The figures are real. notes/log.md:4303-4311 and PLAN.md give them: in a quiet sky, everyone low makes 0.44 collisions/h and everyone high 0.75; at crit density it's 6.1 against 3.9. The item is still listed under 'For Advay to sort', and README.md:22-23 is unchanged. But the finding overstates it. README item 2 claims a cost from 'flying where it's crowded', and a quiet sky is by definition not crowded. The brief says to design for a showcase room, which is the crit-density case, and there the cost does show (82% vs 99.8% passes with a turn on air). Markers test multi-user with two sessions, and two people can't see a crowding cost in any design. The real weakness is that the README doesn't say the cost only appears in a crowd, and that the author knew. That is a framing gap, not an inverted mechanic.
- **Suggested fix:** Either retune so the cost shows at low density (for example, low-band fragments that linger, or a crowding penalty per pass tied to how many objects share a station window), measure it, and quote the run. Or say it plainly in the README: 'the cost only bites in a crowd; a showcase room is where it shows, and here is the measured figure.' Saying it beats leaving it buried in PLAN.

#### `good-puppet-show-live`: What a marker sees on the live sky is almost entirely invented or staged

*Is it good? · criterion: brief · partly confirmed (raised as major)*

- **Evidence:** Read-only GETs of the live catalogue (/catalogue/?show=all&kind=satellite, 20 pages, 477 satellites). 429 of the 477 match a handle or callsign in src/lib/extras-cast.ts. The other 48 are all 3 or more days old and are mostly test launches (TESTACC, DPT, 'test test', FILTER67, ANOTHERTEST6767). Every one of the 6 launches in the live 'Sky now' list (ALBATROSS-2, ALBATROSS, Dusty, Sky Pigeon, ORBIT-X, MARMALADE 13) is an extra. All 44 fragments in orbit come from collisions among derelicts and extras only (13 of them 'from two derelicts' collision'). Of the 19 static cards in the live Heard feed, 8 are 'from two derelicts' collision', the staged kind. Screenshot: /Users/advaymenon/.claude/jobs/3ff57576/tmp/good/sky-1920.png
- **Why it matters:** The brief is about people acting on shared state. A marker arriving at /sky/ sees a lively sky and a busy radio, and none of it involves a real person. The README does disclose the extras (README.md:56-59), so this isn't a lie. But the experience a marker judges is a scripted scene, and someone who checks the catalogue sees the gap between the sky's activity and what people actually did.
- **Verifier:** Reproduced with read-only GETs of 20 catalogue pages: 477 satellites. 430 match names or handles in src/lib/extras-cast.ts. The other 47 split 20 low, 14 mid, 13 high. All are test-like (TEST1, TESTACC, DPT1-4, FILTER67, ANOTHERTEST6767, LOGFORCE1, MH370 and so on), and the newest is 2026-11-03. The live Heard feed's recent entries are all extras (ALBATROSS-2, ALBATROSS, Dusty, Sky Pigeon, ORBIT-X, MARMALADE 13), and every static source is derelicts or extras. So the facts hold. But this is a deliberate design choice, argued in ADR 0021 and disclosed in README.md:57-60 ('invented people, the extras… Nothing on the page marks them'). The brief marks the argument and whether the app keeps it, and the README says plainly what a visitor will see. It's a real weakness for 'the sky remembers people' when a marker browses the record, but calling it major overstates the risk of an openly argued trade-off.
- **Suggested fix:** Lean into it honestly: mark extras subtly on their cards (for example 'a regular of the sky' or a small glyph), or cut their rate when real people are present. At least quote in the README the measured share of a visitor's sky that is invented, so the claim is checkable.

#### `good-staged-collisions-theatre`: About nine in ten collisions a watcher sees are staged, and the README treats it as an open question

*Is it good? · criterion: brief · partly confirmed (raised as major)*

- **Evidence:** ADR 0021 consequences table: a watcher sees 6.1 collisions/h in a quiet sky, 5.6 of them staged. The 2026-10-23 log (notes/log.md:4310) has 6.25/h with 5.56 staged. README.md:48-49 judges 'Whether collisions feel earned. Only watching tells me; most are still staged.' ADR 0020 names 'staging less still, or only when someone arrives' as the lever left, and it was never pulled.
- **Why it matters:** The payoff the app promises, 'your crowding caused this', is the one thing a marker will rarely see happen for real. The 99.5% newcomer-sees-a-collision figure that PROCESS.md:152-154 presents as a success is a figure about staged derelict collisions. The README admits the staging but gives no judgement and no plan, so it reads as a known hollow left in place.
- **Verifier:** Verified in ADR 0021's table: a watcher in a quiet sky sees 6.1 collisions/h, 5.6 of them staged and 0.5 natural. README.md:48-49 says 'most are still staged'. The 99.5% figure in PROCESS.md:152-154 is mostly about staged collisions. But the README and PROCESS both disclose the staging, and PROCESS.md:136-155 argues why it exists ('seeing the cost matters more than a sky left alone'). So 'gives no judgement and no plan' is overstated: the bet is stated. The finding largely overlaps the puppet-show and static findings. As a separate cost it's minor.
- **Suggested fix:** Say in the README what staging is for (demonstration) and how a visitor can tell a staged collision from an earned one, or label staged collisions on the card ('two derelicts drifted into each other'). Better still, report the earned-collision rate in a crowd from a run, since that's the claim a showcase room tests.

#### `good-process-asserts-crowding`: PROCESS.md says as fact that people crowd low, which the README admits is unmeasured

*Is it good? · criterion: process · confirmed*

- **Evidence:** PROCESS.md:7: 'People typically crowd the low band to be heard more'. README.md:47 lists 'Whether people crowd low' as judged and not yet shown, and the measured live figure for non-extra launches is 19 low, 15 mid, 14 high, mostly test accounts (catalogue read, above).
- **Why it matters:** A marker reads PROCESS against the README and the commits. A behavioural claim stated as fact in one and flagged as untested in the other is 'process asserted rather than shown'.
- **Verifier:** PROCESS.md:7 reads 'People typically crowd the low band to be heard more', stated as fact. README.md:47 lists 'Whether people crowd low' as judged and not yet shown. My read-only count of live non-extra launches is 20 low, 14 mid, 13 high, almost all test accounts, slightly different from the reviewer's 19/15/14. That doesn't show typical crowding. The two documents contradict each other, which is a small 'asserted rather than shown' issue.
- **Suggested fix:** Change it to 'The design bets people will crowd low…', or quote the counted share.

#### `good-visibility-nothing-to-act-on`: Ostrom and Kazemi are cited for a governance the app doesn't have

*Is it good? · criterion: brief · partly confirmed*

- **Evidence:** README.md:13-18: Ostrom says commons survive when users can see what each takes, and Kazemi says small communities hold through limits, while 'Kessler does no moderation'. But src/lib/launch.ts:41,101,108 is a word blocklist (moderation). Nobody can reply, report or sanction (PLAN.md live-log finding 1: 'Dick Cheese' got through). Most launches are 'no handle', so the record names no one. Unresolved since PLAN.md:276-279.
- **Why it matters:** Ostrom's monitoring works because users act on what they see (graduated sanctions, conflict resolution). Kessler gives visibility with no possible response, so 'the group does the rest' (Shirky) has nothing to do. A marker who knows the sources will see the citation does more work than the design. PROCESS.md:160-166 partly addresses Kazemi (screened friends against strangers), which is good, but the README contradiction remains.
- **Verifier:** The concrete contradiction is verified. README.md:16 says 'Kessler does no moderation', while src/lib/launch.ts:41-44 has a BLOCKED word list and a link filter, applied at :101 and :108 ('That callsign has a word we don't broadcast'). PLAN.md marks this 'Won't fix'. The broader claim, that citing Ostrom for visibility alone is overreach, is a judgement call: citing one design principle is defensible, and PROCESS.md:161-166 does take a position against Kazemi. The factual 'no moderation' error is a real, cheap-to-fix inaccuracy. The governance critique is softer.
- **Suggested fix:** Narrow the claim in the README: 'Ostrom's first condition (seeing what each takes) without her others, deliberately; a ten-minute visitor can't sanction.' And replace 'does no moderation' with 'only a word filter'.

#### `good-nothing-to-do-after-launch`: After launching, a visitor's only verbs are wait, watch, boost or deorbit; co-presence is mostly parallel

*Is it good? · criterion: brief · partly confirmed*

- **Evidence:** PLAN.md core loop (lines 364-380) and Why page: 'There's no chat and no replies. The only way your words ever touch a stranger's is a collision.' Conjunction alerts and dodging dropped (PLAN.md:445-449). A launch every minute, a low pass every 3 minutes per station, and natural collisions measured at about 5 per watched hour at crit (ADR 0020). 'Heard by' is a passive counter.
- **Why it matters:** In a room of 30, each person launches, watches their line come round a few times, and maybe sees a random collision involving someone. Nobody can respond to anyone, and no choice depends on what another person just did. Rejecting dodging and replies is argued well, but the result is little for a second minute.
- **Verifier:** The verbs are as described (PLAN.md core loop at lines 364-380: launch, be heard, listen, collide, deorbit or boost), and there is no chat or reply by design. But the app does have co-presence signals: a live 'Heard by N people' on station rows, and a 'Just you, listening' / listening count seen on the live page. Leaving out replies and dodging is argued. 'Little for a second minute' is a design opinion, not a defect a marker would necessarily penalise.
- **Suggested fix:** Show what is already there more clearly: on the sky, a live 'your satellite was heard by N people in this room' moment, and a visible per-band crowding meter that shifts as the room launches, so each person's band choice visibly changes the next person's odds.

#### `good-why-page-people-words`: The Why page still frames collisions and answers as people's when most are invented

*Is it good? · criterion: brief · confirmed*

- **Evidence:** Live /why/ and src/pages/why/index.astro:58 'the record keeps how strangers answered'; :69 'noise made of two people's words'; :124 'A collision: two people's words, broken into each other'. Live: of the 12 attributed static sources in the feed, none involves a non-extra person, and 8 are two derelicts.
- **Why it matters:** The 2026-10-23 review fixed 'real people's words' in one sentence, but the same framing survives in three others. Next to README 'the record keeps who caused what', a sceptical marker could call the hidden extras a misleading record. The record does keep who caused what, but 'who' is often invented, blame lands on invented handles (for example deadline_dodger, three satellites destroyed), and nothing on the page says so.
- **Verifier:** src/pages/why/index.astro has line 58 'the record keeps how strangers answered', line 69 'noise made of two people's words in everyone else's way', and line 124 'A collision: two people's words, broken into each other'. grep for 'extras|invented' in that file finds nothing, so the Why page never says the sky is seeded. On the live feed, every attributed collision is between derelicts or extras. PROCESS.md:131-134 says the 'real people's words' problem was fixed, but the same framing survives in three other lines.
- **Suggested fix:** Change 'two people's' to 'two satellites'' or 'two lines', and add one line on the Why page saying the sky has regular invented launchers, matching the README.

#### `critic-crit10-pod-evidence-missing`: No record of the crit 10 test itself (two classmates from the URL alone, narrated from logs), and logs older than about 100 lines are gone

*Completeness critic · criterion: process · not independently verified*

- **Evidence:** Crit 10 spec lines 4 and 5 (crits/10-fly-by-instruments): 'at the crit two of your pod use the app from its URL alone… while you narrate from the logs'. `grep -n -i -w pod notes/log.md PROCESS.md reflections/*.md` matches only the plan (log.md:3456, 3576; PLAN.md:204). No entry says how the crit went or what the tutor said. reflections/crit-10.md says 'I didn't do much work this week'. The closest evidence is log.md:4145 ('while they and a few others used the app'), on 2026-10-19 and outside the crit. ADR 0023:28 chose stdout over a DB table, knowing it 'lasts longer than Fly's log retention'. `flyctl logs --no-tail` now returns 100 lines, all from 2026-11-07.
- **Why it matters:** Process is 50% of the mark and is read against the commits and logs. The crit's central test, telling two people apart from logs, has no recorded outcome. Its spec line 3, 'the logging outlives the crit', is met only as code, with no retained example a marker can see.
- **Suggested fix:** Add a short log or PROCESS line on what happened at crit 10 (who used it, what the logs showed, any finding). Save one anonymised excerpt of a two-person session (for example the 2026-10-19 one, if any copy exists) under notes/ as evidence.

#### `critic-cold-start-6s-first-impression`: The marker's first request after idle takes about 6.5 s (auto-stop, cold boot, migrate); undocumented and untested

*Completeness critic · criterion: deployed-app · not independently verified*

- **Evidence:** `curl -w %{time_total} https://comp4020-final-am167.fly.dev/` on first hit: '/ 200 6.546478s'. The next requests took 0.05 s. Fly logs: 'machine became reachable in 3.531343373s' and '3.47879892s'. fly.toml has auto_stop_machines='stop', min_machines_running=0 (course-fixed). `grep -i 'cold.?start' README.md PROCESS.md doc/adr` finds nothing. The fixed dimension verdict says it 'couldn't measure cold start because the live machine was already awake'.
- **Why it matters:** Markers start at /readme/ cold, possibly the morning after. A blank page for about 6 s is the first impression. The first SSE connection also comes after the catch-up replay, which code-ear-cost-at-cap measured at 0.8 s for a 2-minute stall on a fast Mac. A long overnight gap on shared-cpu-1x was not measured.
- **Suggested fix:** Measure a cold start after a long idle on the real machine (read-only GET, then time to first SSE hello), and note it in the README as a known cost of the course's auto-stop. Keep boot work (migrate, catch-up) off the first response's critical path if it is significant.

#### `critic-crit-tags-missing`: Only crit-8 is tagged; there are no crit-9 or crit-10 tags, though the final-project page says the /ship cutoff tags are process evidence

*Completeness critic · criterion: process · not independently verified*

- **Evidence:** `git ls-remote --tags origin` lists only refs/tags/crit-8 (tagged 2026-10-05 11:52 at f6bbe13). The final-project page says: 'The /ship cutoff tags keep every earlier version, and the changes between them count as process evidence.' ship SKILL.md step 6: 'in weeks 10 and 11 the repo is already public and shipping is just deploy, verify, tag'. PLAN.md:123 records the C9 cutoff (Mon 12 Oct 12:00). The main state at that time was 33a42ec (2026-10-11).
- **Why it matters:** A marker comparing crit states can't jump to C9 and C10 states, and the diffs between crits are named evidence. The sweep may have captured them anyway, and topics/assessment says the sweep, not tags, is authoritative. So this costs legibility, not compliance.
- **Suggested fix:** Don't move or back-date tags after a cutoff. Instead, note in PROCESS.md (or a log line) which commits were the C9 and C10 cutoff states (33a42ec for C9; the C10 cutoff commit), so a reader can diff them.


### Nit (41)

#### `robust-sky-double-payload`: Each sky load sends the whole sky twice: once in the page and again in the SSE hello

*Robustness and security · criterion: deployed-app · partly confirmed (raised as minor)*

- **Evidence:** With about 270 live objects: GET /sky/ was 128,293 B raw (src/pages/sky/index.astro:230 embeds sky, conjunctions, heard and heardBy), and the SSE `hello` line was 86,794 B (sse/1.txt line 2), sent at once on connect (src/pages/api/events.ts). The hello is built per connection and the stream is marked `no-transform`. The client also closes the stream after 60 s hidden and reconnects (src/scripts/sky.ts:850-862), getting another full hello each time.
- **Why it matters:** On a slow connection, which markers test for the top band, the page waits on two full copies of the sky, then three.js (571 KB, about 140 KB gzipped) and scene.js (192 KB). It works, but it's wasteful at exactly the moment the slow test happens. I couldn't throttle with agent-browser (`set offline` didn't affect an open EventSource), so this is reasoned from byte counts, not timed.
- **Verifier:** Measured on my server with about 239 objects: GET /sky/ was 103,018 B and the SSE hello line 88,751 B, and the hello carries the same objects (the flood satellite's JSON is the same in both). sky.ts:850-862 closes the stream after 60 s hidden and reconnects for a new hello. But the live app's HTML goes out brotli-compressed (content-encoding: br, 65,950 B raw), so the page copy is small on the wire. Neither the reviewer nor I measured any effect on a slow connection. It's real duplication with no shown cost to the user, so a nit.
- **Suggested fix:** Let the page's embedded snapshot serve as the first hello (send `Last-Event-ID` or a `since` timestamp, and have the server send only what changed), or skip the embedded `sky` when JS is going to connect at once.

#### `robust-live-beacons-in-payload`: Every live satellite's beacon, heard or not, is in the page JSON and the SSE hello

*Robustness and security · criterion: brief · confirmed*

- **Evidence:** In the hello on my server, someone else's not-yet-heard satellite came through as `{"id":44,..."callsign":"Many0","beacon":"crowd 0",..."mine":false}`. ADR 0016's consequences admit 'page's data carries every live beacon so the stations can play it'.
- **Why it matters:** 'Heard only overhead' is a UI convention, not a property of the system: anyone with devtools reads every beacon at once. The ADR records this, so it's a nit, but nothing a visitor reads mentions it.
- **Verifier:** Both the SSE hello and the /sky/ HTML contained another person's unheard satellite with "beacon":"flood line 5",..."mine":false. ADR 0016:151 admits 'page's data carries every live beacon so the stations can play it.' A documented trade-off, so a nit.
- **Suggested fix:** Accept and note it, or send a beacon only when it comes on air.

#### `robust-length-units-mismatch`: The server counts 140 code points but the textarea counts UTF-16 units

*Robustness and security · criterion: deployed-app · confirmed*

- **Evidence:** The server accepted 140 '😀' (280 UTF-16 units, 201) and refused 141 (422). The textarea `maxlength={BEACON_MAX}` (src/pages/index.astro:186) stops at 70 emoji, and the counter at index.astro:310 counts `.value.length`. The server also trims and collapses whitespace before counting.
- **Why it matters:** Harmless, but the browser and the server have different limits. An emoji-heavy line gets half the room the server would allow, and the no-JS path has a different limit from the JS path.
- **Verifier:** readLaunch accepted 140 '😀' (counts code points with [...beacon]), while index.astro:186 maxlength={BEACON_MAX} and :310 `beacon.value.length` count UTF-16 units, so the browser stops at 70 emoji. Harmless mismatch, so a nit.
- **Suggested fix:** Count graphemes (Intl.Segmenter) on both sides, or accept the mismatch and document it.

#### `robust-get-pages-accept-any-method`: GET-only pages answer 200 to PUT and POST

*Robustness and security · criterion: deployed-app · confirmed*

- **Evidence:** `curl -X PUT -H 'Origin: ...' /` returned 200; `curl -X POST /sky/` returned 200; a 100 MB text/plain POST to /sky/ returned 200 in 0.11 s (the body wasn't read). POST /api/events returned 404.
- **Why it matters:** Cosmetic. No state changes, but it's loose for a top-band app.
- **Verifier:** On my server, PUT /sky/, POST /sky/ and PUT / (with Origin) all returned 200. No state changes. Cosmetic, so a nit.
- **Suggested fix:** Return 405 for methods a page doesn't handle.

#### `brief-gap-not-enforced-against-fixed-value`: 'A minute between launches' isn't pinned by any test against a fixed value; the tests would pass with the gap changed

*Response to the brief · criterion: spec-contract · partly confirmed (raised as minor)*

- **Evidence:** spec/decay-server.test.ts:87-95 uses `sky.LAUNCH_GAP` (the constant under test). spec/launch.test.ts:80-91 refuses an immediate second launch and matches /launch again in (\d+ min )?\d+ s/, which also holds for a 10-minute gap. spec/log.test.ts:195 refuses at T+10s only. No test asserts that a launch is refused at 59 s and accepted at 60 s. CLAUDE.md:127-131 forbids exactly this: 'A test that compares against the constant it checks can't fail; compare against a fixed value.' (Contrast the 200 cap, which log.test.ts:220 tests against the literal 200.)
- **Why it matters:** README lists this claim as 'Enforced, and tested', and the repo's own rule says a test like this doesn't count. A marker cross-checking README claims against spec/ finds the promise only half enforced.
- **Verifier:** decay-server.test.ts:87-95 does use sky.LAUNCH_GAP, and log.test.ts tests only T+10s. The claim that the tests 'would pass with the gap changed' is overstated, though. spec/sky.test.ts:41 asserts the first-launch dialog matches /1 minute|a minute/, and that copy is derived from LAUNCH_GAP (src/components/FirstLaunch.astro:16-17, Math.round(LAUNCH_GAP/60000)). So changing the gap to 90s, 120s or 10 min turns a spec test red. Only values that round to 1 minute (30s to 89s) slip through. It is partly pinned, indirectly. A literal 59s/60s test would be cleaner.
- **Suggested fix:** In decay-server.test.ts replace `sky.LAUNCH_GAP` with literal `60_000` (refused at 59_000, accepted at 60_000). Confirm it goes red with LAUNCH_GAP set to 30_000 or 120_000, and log that you did.

#### `brief-readme-word-count-borderline`: README word count is 606 by wc, over the 600 cap unless the Sources are excluded; nothing checks it

*Response to the brief · criterion: brief · partly confirmed (raised as minor)*

#### advay: wont fix

- **Evidence:** `wc -w README.md` = 606. Prose before '## Sources' = 516, Sources = 90. With markdown symbols stripped the whole file is 582. The rendered /readme/ page text including nav = 593. scripts/check-evidence.ts doesn't count README words at all (it checks CLAUDE.md, reflections, the PROCESS.md template and cited SHAs only).
- **Why it matters:** The spec asks for 400-600 words 'with sources'. A marker running wc gets 606. It is defensible (prose 516) but a needless argument to have.
- **Verifier:** wc -w README.md = 606, confirmed. 'README 400-600 words with sources' plausibly reads as the prose plus a sources list. The prose excluding Sources is about 516, and wc counts markdown symbols. Six words over by wc, including the bibliography, is unlikely to cost marks. Nit.
- **Suggested fix:** Trim six or more words (for example the restated 'So what's worth saying...' already used on the launchpad), or add a spec/ or evidence check that counts prose excluding Sources and say so.

#### `brief-deorbit-unargued`: The one prosocial mechanic (bringing yours down) and boosting go unargued in the README

*Response to the brief · criterion: brief · partly confirmed (raised as minor)*

- **Evidence:** The README's 'What good means here' and its four principles never mention deorbiting. Boosting appears only in the enforced list ('only a satellite's owner can boost it or bring it down'). The Why page maps 'Bringing yours down: making room so others can be heard' and the sky shows a 'Thank you for keeping the sky clear' dialog. ADR 0011 built both, and boost moves a satellite up a band, which per principle 2 means it is heard less, so its purpose is unclear.
- **Why it matters:** Under Ostrom, the only way a user can give back to the commons is the strongest link to the argument, and the README leaves it out. Boost reads as a feature with no stated reason, which the brief criterion marks down.
- **Verifier:** The README's 'What good means here' doesn't mention deorbiting, and boost appears only in the enforced list. But the Why page maps 'Bringing yours down: making room so others can be heard', the first-launch dialog explains both, and ADR 0011 gives the reasons (deorbit is the only giving-back besides not launching; boost lets a satellite stay up longer at the cost of passing less often). Boost isn't 'a feature with no reason to exist'. The reason is just not in the README. Nit.
- **Suggested fix:** Add a sentence: the only repair is self-restraint (deorbit), so the sky can't be cleaned by others. Either justify boost (escape the crowd at the cost of being heard less) or drop it from the README's enforced line.

#### `brief-readme-why-sources-diverge`: The Why page and the README cite different sources; the Why page omits the small-web readings

*Response to the brief · criterion: brief · confirmed*

- **Evidence:** /why/'s Sources section lists Hardin, Kessler & Cour-Palais and Ostrom only. README adds Shirky 2004 and Kazemi 2019. The Why page's argument ('Attention is a commons...') never mentions situated or small software.
- **Why it matters:** The two pages that state the purpose tell slightly different stories. The small-web position is visible only in the README.
- **Verifier:** The Why page's Sources (src/pages/why/index.astro:138-160) list Hardin, Kessler & Cour-Palais and Ostrom only, with a comment saying these are the three the page argues from. Shirky and Kazemi appear only in the README. The finding is accurate but cosmetic; the small-web citations need to be in the README and PROCESS.md, and they are.
- **Suggested fix:** Either align the Why page's sources with the README or link the Why page to /readme/ for the argument.

#### `brief-restart-claim-tested-in-process`: 'A restarted server catches up to the same sky' is tested as an in-process replay, not a restart

*Response to the brief · criterion: spec-contract · partly confirmed*

- **Evidence:** spec/collision-server.test.ts:122-175 compares one sky.settle(end) against stepped settles in the same process and DB. extras-server.test.ts:113 and log.test.ts:432 re-open a server module on the same DB path, which is closer. No test kills and restarts the HTTP app process and compares /api/events snapshots.
- **Why it matters:** The claim is mostly backed (closed-form replay plus the re-opened-server tests), but 'restarted' over-reads what the main test does.
- **Verifier:** collision-server.test.ts:122+ compares one settle against stepped settles in one process. Other tests use vi.resetModules to re-open the server modules on the same DB (heard-server.test.ts:380-381 'after a restart', extras-server.test.ts:113, log.test.ts:432/442). That is a reasonable stand-in for a restart, since state lives in SQLite and closed-form orbits. No test restarts the HTTP process, but the claim is essentially backed. Nit.
- **Suggested fix:** Word it as 'a server that was stopped replays to the same sky as one that ran', or add one test that restarts the server on the same DB and compares the live sky.

#### `brief-extras-holdback-overstated`: 'they hold back while people launch' overstates the tested rule (four launches by people in an hour)

*Response to the brief · criterion: brief · confirmed*

- **Evidence:** src/lib/sky.ts:61-64 and spec/extras-server.test.ts:226 'none launch in an hour people have launched four in', plus a half-full sky or EXTRA_CAP=20. One person launching once or twice doesn't hold extras back.
- **Why it matters:** A precise README claim that is looser than the code is the kind of mismatch a marker cross-checking spec/ will spot.
- **Verifier:** src/lib/sky.ts:74 EXTRA_ROOM = 4. The comment at sky.ts:59-64 and extras-server.test.ts:226 'none launch in an hour people have launched four in' (plus EXTRA_CAP and the half-full rule). The README's 'they hold back while people launch' is looser than the four-an-hour rule. That is accurate as a loose summary but imprecise. Nit.
- **Suggested fix:** Say 'they stop for an hour once people have launched four'.

#### `process-post-1023-work-missing`: Post-10-23 process events are mostly absent: the sky radio built and scrapped (ADR 0026), the declutter and its two reviews

*PROCESS.md · criterion: process · partly confirmed (raised as minor)*

- **Evidence:** notes/log.md:4348-4410: radio built test-first, three Opus reviewers, redesigned, then scrapped ('Tests could show the sound kept its rules; only listening could show whether it was worth hearing'), with an explicit 'Not added to PROCESS.md'. notes/log.md:4411 is the launchpad declutter with two adversarial reviews. Neither appears in PROCESS. Only the 11-03 incident was added. PLAN.md:9 'Last updated 2026-10-31' doesn't record the 11-03 incident or the 11-07 edit.
- **Why it matters:** The radio is the strongest example of the document's own thesis ('green checks, still wrong; only using it tells me'), and of the student refusing a feature with no reason to exist, which the marking explicitly rewards. Leaving it out weakens the 'judged' argument.
- **Verifier:** The radio (ADR 0026, c0fb864) and the declutter are indeed absent from PROCESS, and the radio would illustrate the 'judged' thesis well. But notes/log.md:4399-4401 records a deliberate decision: 'Not added to PROCESS.md: nothing it changed stayed in the app or the harness.' That is defensible editorial judgement, and the document is already over length, so adding material conflicts with the word-count finding. The spec does not require every event to appear. A swap could improve the document, but the omission does not plausibly cost marks.
- **Suggested fix:** Swap a weaker paragraph (the Opus anecdote) for two sentences on ADR 0026 rejected (c0fb864).

#### `process-good-tension-unaddressed`: 'What good means here' cites Kazemi's screened friends but doesn't face the extras (invented, unmarked people) as the biggest departure from small-web authenticity

*PROCESS.md · criterion: brief · partly confirmed (raised as minor)*

- **Evidence:** PROCESS.md:131 'That raises a question of honesty' is never answered. It only lists fixes. README.md: 'Nothing on the page marks them'. PROCESS.md:162-164 Kazemi: 'members are screened friends; Kessler's sky is full of strangers'. The 2026-10-23 review also flagged '"What good means here" names no outcome' (PLAN.md:283) and it remains unaddressed.
- **Why it matters:** The spec asks the student to discuss their position on small-web writing. The position given ('I part from them on time') is genuine, but the obvious objection, that a small-web reader would call invented regulars inauthentic, is left open after the document itself raises honesty.
- **Verifier:** PROCESS.md:131 raises 'a question of honesty' and answers it with fixes and disclosure ('the README says the sky is seeded'). That is an answer, if a thin one, so 'never answered' overstates it. It is true that 'What good means here' names no outcome (flagged at PLAN.md:283 and never acted on), and that the Kazemi 'screened friends' contrast doesn't engage the invented regulars. This is a fair argumentative weakness, but the reviewer's framing is stronger than the text warrants.
- **Suggested fix:** Answer the honesty question in one sentence: why unmarked extras are acceptable or not under Kazemi and Shirky, and what outcome would show good.

#### `process-incident-framing`: The incident paragraph blames the agent where the log says the course skill suggested the live URL, and overstates the guard

*PROCESS.md · criterion: process · partly confirmed*

- **Evidence:** PROCESS.md:70-71 'The agent pointed it at the deployed app instead of a local build' vs notes/log.md:4512 'with APP_URL at the live fly.dev URL, as the course's preflight skill suggests, then twice more'. PROCESS.md:77 'the spec rejects any fly.dev address', but spec/global-setup.ts:20 allows it with SPEC_AGAINST_LIVE=yes. Line 70 uses a curly apostrophe ('course’s') while the rest of the file uses straight ones.
- **Why it matters:** Small accuracy gaps in the best paragraph of the document. A marker cross-reading the log sees the framing shift.
- **Verifier:** notes/log.md:4512-4514 says the live URL was used 'as the course's preflight skill suggests', and PROCESS.md:70-71 says 'The agent pointed it at the deployed app'. That is not false, since the agent did it, but it leaves out the skill's role. spec/global-setup.ts:20 does allow an override with SPEC_AGAINST_LIVE=yes, so 'rejects any fly.dev address' is slightly overstated. `grep '’' PROCESS.md` finds the curly apostrophe only at line 70. All three are cosmetic accuracy points.
- **Suggested fix:** 'The preflight skill suggested the live URL and the agent followed it, three times'. Say 'rejects any fly.dev address unless explicitly overridden'.

#### `process-clarity-context`: Several sentences need project context a marker doesn't have

*PROCESS.md · criterion: process · partly confirmed*

- **Evidence:** L63 heading 'What one session knew and the next didn't' now holds one example, since c1e5cd7 removed c943797 and a52b08b. L103 'This was where...' opens a section with no antecedent. L119 'parts only for show' and 'fake connections inflated "heard" counts' ('fake connections' = streams from just-made cookies). L147 'Measured first: staged debris sat in the low band'. L149 'The harm had moved to late in a satellite's life'. L98 'as with assignment 2's home page'. L65 'I stopped a Sonnet one on the object card' gives no reason for preferring Opus, and the 10-17 review already flagged 'The Opus switch had no reason given' (notes/log.md:4077). L105 the tutor attribution is unverifiable: 3de1cc6's log says the app 'had an incentive ... but no goal' without naming a tutor, and reflections/crit-8.md doesn't mention it.
- **Why it matters:** The project's CLAUDE.md itself makes first-time-visitor clarity a rule. PROCESS is read cold by a marker.
- **Verifier:** Several of these hold. notes/log.md:4077 already noted 'The Opus switch (e3f9cb5) had no reason given', and PROCESS still gives none. 'as with assignment 2's home page' and the table rows ('The harm had moved to late in a satellite's life') need project context. The tutor attribution is not in 3de1cc6's log, which says only 'an incentive (be seen) but no goal and nothing shared to lose', and grep finds nothing about it in reflections/crit-8.md. The heading 'What one session knew and the next didn't' still fits its single example, though, and 'This was where' follows the section heading, so it reads acceptably. These are clarity nits.
- **Suggested fix:** Give the Opus switch its reason (what the Sonnet review missed), retitle the one-example heading, and unpack the table rows into plain words or cut them.

#### `evidence-adr-0021-edited-after-acceptance`: Accepted ADR 0021 was edited twice after acceptance, against the repo's own never-edit rule

*Other process evidence · criterion: process · partly confirmed (raised as minor)*

- **Evidence:** df4014c (10-12) creates 0021 already 'accepted (2026-10-12; Advay: ...)'. 3469642 then changes its body and appends 'revised the same day after its review, before merging' to the status. d7b89f7 replaces the whole results table (e.g. 'People's satellites burned up, quiet sky ... 54%' becomes '57%', and the '* Measured with the first version' caveat is removed) without changing the status line. doc/adr/README.md and CLAUDE.md: 'An accepted record is never edited; to change one, write a new record that supersedes it.' Every other multi-commit ADR (0009-0011, 0015-0020, 0023) was edited only while proposed. I checked this with `git log` on each file.
- **Why it matters:** It's small, but it's the project's own stated rule. The record a marker reads no longer shows the numbers the decision was accepted on.
- **Verifier:** Confirmed: df4014c creates 0021 with status 'accepted', 3469642 appends 'revised the same day after its review, before merging', and d7b89f7 replaces the results table (54% becomes 57% and so on). All three commits are dated 10-12 on the extras branch, before the PR #13 merge on 10-13. The status line openly discloses the revision. So the record changed before it reached main, and the only real slip is d7b89f7 not adding to the status note. Technically against the stated rule, but very unlikely to cost marks.
- **Suggested fix:** Note the post-acceptance re-measurement in 0021's status line ('table re-measured d7b89f7, decision unchanged'), or accept 0021 only after its review. Mention the exception in the ADR README.

#### `evidence-main-went-red`: main was red five times, including commits pushed while CI was red because local pnpm hid a broken lockfile

*Other process evidence · criterion: spec-contract · partly confirmed (raised as minor)*

- **Evidence:** `gh run list -w checks -b main`: failures at 4f6771c and 8bf60a4 (10-15, red ~22 h until 05e9a41), 5a696b3 (10-17), c600acc (10-31 Dependabot vite bump) and c57a583 (10-31). Both 10-31 logs: '[ERR_PNPM_BROKEN_LOCKFILE] ... duplicated mapping key (2100:3) source-map-js@1.2.2'. The wordmark entry in notes/log.md claims 'pnpm check green (431 tests, 0 errors)' locally while CI on the same tree failed at `pnpm install --frozen-lockfile`. Fixed in 37df5a2. The latest run (42319458127, c1e5cd7) is green on check, check:evidence and deploy. Dependabot Updates for esbuild and @vitest/mocker still fail repeatedly.
- **Why it matters:** Main is green now, so the contract holds. But CLAUDE.md says 'a red state is never committed', and local checks didn't reproduce CI's frozen-lockfile install. Merging three Dependabot PRs back to back without re-running checks broke the lockfile.
- **Verifier:** Confirmed with `gh run list`. Failures on main at 4f6771c and 8bf60a4 (10-15), 5a696b3 (10-17), and c600acc and c57a583 (10-31), plus 99407ca cancelled. The log claims '431 tests, 0 errors' locally in that window (:4489/:4505). The latest run on c1e5cd7 succeeds, so the spec contract (pnpm check and check:evidence pass) holds today. Historical red CI that has since been fixed is very unlikely to cost marks.
- **Suggested fix:** Run `pnpm install --frozen-lockfile` before `pnpm check` locally (or add it to `check`). Merge Dependabot PRs one at a time on a green rebase, or group them in dependabot.yml.

#### `evidence-undisclosed-cursor`: Cursor was used on three commits but is never mentioned, and 9 commits come from an unconfigured 'Ubuntu' identity

*Other process evidence · criterion: process · confirmed*

- **Evidence:** `git log --format=%b --grep=Cursor -i` shows 'Co-authored-by: Cursor <cursoragent@cursor.com>' on 2d8f515, 356e469 and a707d1b. `grep -il cursor PROCESS.md notes/log.md CLAUDE.md PLAN.md` finds nothing. Authors: 9 commits by 'Ubuntu <azureuser@agents...cloudapp.net>' (a286df9, df4014c, 3469642, d7b89f7, ...) and 61 by 'Claude <noreply@anthropic.com>'.
- **Why it matters:** The workflow account should name every tool used. An unexplained third agent and a stray machine identity are small gaps in 'process shown'.
- **Verifier:** `git log -i --grep=cursor` shows 2d8f515, 356e469 and a707d1b. A case-insensitive grep for cursor across PROCESS.md, notes/log.md, CLAUDE.md and PLAN.md finds nothing. The author list shows 9 commits from 'Ubuntu' and 61 from 'Claude'. A small disclosure gap.
- **Suggested fix:** One sentence in PROCESS.md or the log on where Cursor and the cloud agent sessions were used, and why.

#### `evidence-weak-commit-messages`: A handful of opaque commit messages, including one PROCESS.md cites as evidence

*Other process evidence · criterion: process · partly confirmed*

- **Evidence:** 'update plan' (d0c90a8, f0dc97e, 8bf60a4), 'Update PROCESS.d' (6200f2f, typo), 'PROCESS wip' (32f6549), 'guiding the harness' (004253e), 'Wording changes' (2be559d), 'update CLAUDE.md' (e3f9cb5). PROCESS.md cites e3f9cb5 as the Sonnet-to-Opus switch, but the commit has no body or reason. Most of the other ~200 messages are descriptive with good bodies.
- **Why it matters:** A marker following a citation finds no explanation behind it.
- **Verifier:** e3f9cb5's full message is 'update CLAUDE.md' with no body, confirmed. But PROCESS.md:63-67 now carries the reason itself ('Rules that live in memory don't carry over, so it went into CLAUDE.md'), so the suggested fix is already done. The other opaque messages are a small fraction of the history.
- **Suggested fix:** Nothing to rewrite in published history. Make sure the PROCESS.md sentence citing e3f9cb5 carries the reason itself.

#### `evidence-omnibus-commits`: Some commits bundle a dozen changes, so citations into them are imprecise

*Other process evidence · criterion: process · partly confirmed*

- **Evidence:** 2dc518c: staged collisions, blame line, hashing off the event loop, cookie rotation, claim refusal, replay at cap, cheaper bisection, capped catalogue, deduped stories, plus ADR acceptances. PROCESS.md cites it only for 'the server sends two derelicts'. df4014c is 2870 lines; 44487ac is 2175.
- **Why it matters:** It makes 'read PROCESS against the commits' harder.
- **Verifier:** 2dc518c touches 22 files with 438 insertions. Its subject ('Act on the adversarial review: a collision to watch, safer sign-in, sturdier sky') is a review-response bundle, which is a reasonable unit. Calling it 'a dozen changes' is a stretch. Real but negligible for marks.
- **Suggested fix:** None retroactively. Smaller commits for any remaining work.

#### `evidence-adr-partial-supersession-hidden`: Partly superseded ADRs don't say so in their own status lines; only the index does

*Other process evidence · criterion: process · confirmed*

- **Evidence:** doc/adr/README.md lists 0008 as 'head-on chance superseded by 0013, staging height by 0019, every close pair colliding and the staging rate by 0020', but 0008's file line 3 says only '**Status:** accepted (2026-10-07; proposed 2026-10-06)'. The same holds for 0007, 0011, 0012 and 0023.
- **Why it matters:** A reader who opens an ADR directly sees an accepted decision that no longer holds. Nygard's format updates the superseded record's status, and the repo's stricter rule prevents even that.
- **Verifier:** 0008's status line (line 3) reads only 'accepted (2026-10-07; proposed 2026-10-06)', while doc/adr/README.md:17 lists three partial supersessions. The same holds for 0007, 0011, 0012 and 0023, all of which have plain 'accepted' status lines while the index records the supersessions. This follows the repo's own never-edit rule, so it is a design consequence, not an error.
- **Suggested fix:** Allow one exception in the rule: a status-line note 'partly superseded by NNNN' may be added to an accepted record.

#### `evidence-crit10-reflection-thin`: The crit-10 reflection is thin and self-deprecating

*Other process evidence · criterion: process · confirmed*

- **Evidence:** reflections/crit-10.md: 'I didn't do much work this week, and I'm fine with that.' The breakthrough given is 'Rereading the crit spec before building anything.' All three reflections exist under the names reflections/README.md requires, within 150-300 words. crit-8 has small typos ('briefs requirements', 'peoples READMEs').
- **Why it matters:** Reflections count toward process legibility, and this one undersells a week that produced ADRs 0022-0025 and a live-log investigation.
- **Verifier:** The quote is confirmed in reflections/crit-10.md: 'I didn't do much work this week, and I'm fine with that.' The typos are confirmed: crit-8.md:8-9 'convey the briefs requirements' and 'other peoples READMEs'. Word counts are 236/198/167, all within range. Reflections are per-crit snapshots, so this is polish only.
- **Suggested fix:** Optional: fix the crit-8 typos. Reflections are per-crit snapshots, so leave crit-10's substance unless the course allows revision.

#### `evidence-ci-output-noise`: The CI spec run prints about 200 server log lines

*Other process evidence · criterion: spec-contract · confirmed*

- **Evidence:** Run 42319458127 'Run the spec' step: 212 lines matching 'launch who=extra' and 88 'stdout |' blocks from spec/heard-server.test.ts, spec/collision-server.test.ts and others.
- **Why it matters:** CLAUDE.md's pristine-output rule treats routine info as acceptable, but the noise buries real failures when a marker or agent reads the CI log.
- **Verifier:** `gh run view 42319458127 --log` gives 212 lines matching 'launch who=extra' and 88 lines containing 'stdout'. The spec step reports '0 warnings'. It is routine informational output, which CLAUDE.md allows, so it doesn't break the pristine-output rule. Nit.
- **Suggested fix:** Silence the logger in the in-process server tests (e.g. an env var or a vi.spyOn on the log sink).

#### `spec-busy-sky-accept-gone`: HTTP tests share a sky where most collisions destroy test satellites mid-test, so assertions were loosened

*Spec suite · criterion: spec-contract · partly confirmed (raised as minor)*

- **Evidence:** Server log for run 1: 47 collisions, 39 of them involving a test satellite (callsign T-/Q-/HIS-). After the later runs: 201 collisions, 93 involving test satellites. manoeuvre-http.test.ts:315-322 accepts either 200 or 422 'gone' for the operator's boost after signing in on a new device, because 'a busy test sky can destroy it meanwhile (it failed on CI so)' (notes/log.md:4089). If it's 'gone', the test never shows that the operator can actually manoeuvre on the second device.
- **Why it matters:** The suite's own load causes this flakiness. Instead of isolating the tests from it, the assertion was weakened, and the same hazard is still there for every other HTTP test that launches low and then expects a state.
- **Verifier:** The loosened assertion exists (manoeuvre-http.test.ts:310-316), and the comment and PLAN.md CI note say it was added after a CI collision. Collisions involving test satellites happen on a shared test sky: my fresh-DB server log shows test satellites such as PIP-1 colliding with extras. But the loosening is reasoned: the server returns 'gone' only to the owner, so the assertion still shows that the second device is recognised as the operator, which is the contract under test. Successful manoeuvres are covered elsewhere in the same file ('sends it climbing to the next band'). This is a small weakening, not a meaningful gap.
- **Suggested fix:** Start the CI and test server with DERELICTS=0 and EXTRAS_PER_HOUR=0, or launch test satellites into the high band where meetings are rare. Then restore the strict 200 assertion.

#### `spec-in-process-majority`: Most 'enforced, and tested' README claims are checked only in-process against src/, not against the running image

*Spec suite · criterion: spec-contract · partly confirmed (raised as minor)*

- **Evidence:** 20 of 31 spec files import ../src/lib/* and drive the server code in-process on temp SQLite files (collision-server, heard-server, log, extras-server, manoeuvre-server, decay-server, retime-server...). Only 11 make HTTP requests. Each of these README 'enforced' claims is checked only in-process: 'heard by counts people' (heard-server.test.ts:362, the only test that caught my mutation adding an index per tab in events.audience()), 'at most 200 satellites up' (log.test.ts:220-238), 'a restarted server catches up to the same sky' (collision-server.test.ts:122, extras-server.test.ts:113, manoeuvre-server.test.ts:166, via vi.resetModules on the same DB file), and 'fragments carry every word' (wreck.test.ts). spec/README.md and global-setup.ts say the spec 'checks a RUNNING app over HTTP ... what passes there is what deploys'.
- **Why it matters:** It's a defensible trade-off (HTTP can't arrange orbits or stop the server), and the tests are meaningful. But it contradicts the harness's stated model, and these claims are checked against the source tree rather than the Docker image CI deploys. A marker reading spec/README.md may assume the opposite.
- **Verifier:** grep shows 23 spec files import src/, and only 8 don't touch src (collapsible, invariants, history, launch, kessler, live, manoeuvre-http, operator). Some src-importing files, such as sky.test, also make HTTP requests, so the reviewer's 20/11 split is roughly right. The 'checks a RUNNING app' wording in spec/README.md and global-setup.ts is course-supplied boilerplate about the invariants. The in-process tests still run in CI on every push, against the same source the image is built from. Arranging orbits and simulating restarts can't be done over HTTP, so this is a defensible choice. It's undisclosed but unlikely to cost marks. I'd suggest a one-line note in spec/README.md.
- **Suggested fix:** Add a short section to spec/README.md that names which files are HTTP-level and which are in-process, and why. Consider one HTTP check per claim where it's cheap, e.g. two streams with one cookie report listening=1, or the full-sky message via SKY_CAP=2 on a test server.

#### `spec-no-real-restart-test`: Persistence across a real process restart or redeploy isn't automated

*Spec suite · criterion: spec-contract · partly confirmed (raised as minor)*

- **Evidence:** No test restarts the server process. Restart is simulated with vi.resetModules() on the same SQLite file (manoeuvre-server.test.ts:166-176, heard-server.test.ts:380-384, extras-server.test.ts:113-134). CI runs the image with `--tmpfs /data` (.github/workflows/checks.yml), so it never exercises the volume. I verified persistence by hand: launched PERSIST-R1 (303 -> /sky/?launched=429), killed my server PID 68837, restarted on the same DB (PID 75091), and `/catalogue/?show=mine` still listed PERSIST-R1 with /object/429/ at 200.
- **Why it matters:** Persistence is a fixed requirement. It does work, but the claim that it's tested is weaker than it reads: what the tests show is that the code rebuilds the same state from the DB, not that the deploy keeps the DB.
- **Verifier:** It's true that no test restarts a process or a container. Restarts are simulated with vi.resetModules, and CI uses tmpfs. But the README claim is 'a restarted server catches up to the same sky', which is about catch-up logic, and the in-process tests do exercise that on the same DB file. Persistence itself works: the reviewer verified it by hand, and fly.toml mounts the 'data' volume at /data. The tests are weaker than a full container restart, but nothing in the README is false. Nit.
- **Suggested fix:** Add a small script (or CI step) that starts the image with a bind-mounted /data, launches over HTTP, restarts the container and asserts the satellite is still there. Or say plainly in README/PROCESS.md that this was judged by a manual restart.

#### `spec-vacuous-feed-branch`: The sky's Heard-feed test checks no items on a fresh database, which is what CI uses

*Spec suite · criterion: spec-contract · partly confirmed*

- **Evidence:** spec/sky.test.ts:138-151: `if (items.length === 0) expect(#feed-empty not hidden)`, then `for (const item of items) {...}`. On CI's fresh tmpfs DB no beacon is heard during the run (a pass is minutes away), so the per-item format assertions never run. notes/log.md:2257 already records 'the sky's feed test checks nothing on a fresh database'.
- **Why it matters:** These assertions look like coverage of the feed card's format but never run where the deploy decision is made.
- **Verifier:** The conditional structure is real (sky.test.ts:138-151), and notes/log.md already records it. But the claim that the per-item assertions 'never run where the deploy decision is made' didn't hold in my run: on a fresh scratch DB during the first full suite run, my server log shows 'snapshot ... heard=3' from line 1079 of about 3534. So beacons are heard during a fresh-DB run, and whether sky.test sees items depends on test order and timing. It's sometimes vacuous, not always. Nit.
- **Suggested fix:** Cover the feed format in-process with a seeded transmission, or drop the per-item branch from the HTTP test.

#### `spec-realtime-measured-loosely`: The 'within a second' test times from the POST's response, covers launches only, and stops at the server's fan-out

*Spec suite · criterion: spec-contract · confirmed*

- **Evidence:** spec/live.test.ts:77 sets `sent = Date.now()` only after `await ...launch()` resolves, then asserts receipt < 1000 ms. The manoeuvre broadcast test (manoeuvre-http.test.ts:220-240) and collisions have no latency bound (default 5 s stream.next). No browser test checks that the page shows a change from another session.
- **Why it matters:** The fixed requirement is that a change shows in every other open session within about a second. The test proves the server pushes a launch quickly, not that a viewer sees it drawn, and not that other kinds of event arrive in time.
- **Verifier:** live.test.ts sets `const sent = Date.now()` after `await ...launch()` resolves and then asserts < 1000 ms. That excludes the POST round trip, so the bound is looser than it reads. The manoeuvre broadcast test (manoeuvre-http.test.ts:210-232) calls stream.next() with no latency bound, and no browser test checks rendering. All accurate. In practice the requirement is met, and markers judge real time by eye, so nit.
- **Suggested fix:** Start the timer before the POST, and add the same < 1 s bound to the manoeuvre broadcast test. Optionally add a two-context Playwright check to the layout suite, which already drives Chrome.

#### `ux-layout-test-flaky`: pnpm test:layout failed once (timeout) then passed 16/16 on rerun

*First-visitor UX · criterion: spec-contract · partly confirmed (raised as minor)*

- **Evidence:** APP_URL=http://127.0.0.1:8097 pnpm test:layout, first run: 15 passed, 1 failed: 'at 1920x1080 (the marking desktop) > the launchpad doesn't scroll vertically for a new visitor: Error: Test timed out in 30000ms' (layout/desktop-fit.test.ts:97). The rerun minutes later passed 16/16 in 46.7 s. Other reviewers were driving Chrome in parallel, so the failure is likely a cold-start timeout rather than a layout regression. My own measurements agree: launchpad and sky scrollHeight both 1080 at 1920x1080. PLAN.md status still quotes '12 of 12'.
- **Why it matters:** This gate exists because agents keep reintroducing scrolling. A guard that times out under load gets ignored or retried until green, which is the habit CLAUDE.md warns against ('Corrections should land in CLAUDE.md or spec/, not just retries').
- **Verifier:** I did not re-run test:layout. The evidence is one 30 s timeout while several reviewers were driving Chrome in parallel, and the rerun passed in full. Neither the reviewer nor I measured a layout regression, so calling the test flaky from one run under contention is overclaiming. PLAN.md does still say '12 of 12' (lines 130 and 249), so that count may be stale, which is a nit.
- **Suggested fix:** Give the first test of each viewport a longer timeout (or a warm-up beforeAll that launches Chrome), and update PLAN.md's count to 16.

#### `ux-label-overlap`: Canvas labels collide with station markers and each other

*First-visitor UX · criterion: deployed-app · confirmed*

- **Evidence:** In every whole-sky screenshot the Goldstone station marker dot sits on its own label ('GO·LDSTONE', sky-fresh2-desktop.png, live-sky-desktop.png). On mobile, 'MARMALADE 1' overlaps the globe under 'CANBERRA', and 'ALBATROSS'/'UXTEST' stack (sky-mobile-launched.png).
- **Why it matters:** It is polish, but the station names are the anchor for 'heard over Canberra' and the first thing on the globe.
- **Verifier:** In mobile-sky.png the Goldstone marker dot sits on the start of its own 'GOLDSTONE' label, and the satellite labels (MARMALADE 1, ESSAY, smol sat, ALBATROSS, CANBERRA) crowd over the sun glare near the globe. Visible polish issue.
- **Suggested fix:** Offset station labels away from the marker, and add simple label collision avoidance (or hide satellite labels within N px of a station label).

#### `ux-why-sources-mismatch`: The in-app Why page cites Hardin, Ostrom and Kessler but not Shirky or Kazemi, the small-web sources the README rests on

*First-visitor UX · criterion: brief · confirmed*

- **Evidence:** /why/ Sources list: Hardin 1968, Kessler and Cour-Palais 1978, Ostrom 1990. README 'What good means here' also leans on Shirky (2004) and Kazemi (2019) for the small-scale argument, and neither appears on /why/.
- **Why it matters:** The spec asks for small-web writing to be cited. The page visitors actually read argues the commons only, so the 'small software, make behaviour visible' position appears only in the README.
- **Verifier:** Live /why/ Sources lists only Hardin 1968, Kessler & Cour-Palais 1978 and Ostrom 1990. The README cites Shirky 2004 and Kazemi 2019 as well. The spec requires small-web citations in the README, which it has, so the in-app page differing costs little. Nit.
- **Suggested fix:** Add one sentence and source to /why/ connecting the design to Shirky's situated software or Kazemi's limits.

#### `ux-sign-in-label`: Nav says 'Sign in' and the page is 'Your operator', though no account is needed

*First-visitor UX · criterion: deployed-app · partly confirmed*

- **Evidence:** The nav on every page ends with 'Sign in'. /operator/ is headed 'Your operator', and 'operator' is never defined for a visitor.
- **Why it matters:** 'Sign in' in the top nav implies a gate. A marker may think they must register before launching, which contradicts the 'no required accounts' choice in the README.
- **Verifier:** The nav does end with 'Sign in' on every page (snapshot ref e9). But the launchpad form has 'Claim one' right under Launch and launches without any account, so a marker is unlikely to think registration is required. A wording nit at most.
- **Suggested fix:** Label it 'Handle' or 'Claim a handle', and head the page 'Your handle'.

#### `code-ear-cost-at-cap`: The server's once-a-second ear costs 25 to 74 ms per tick at the sky cap, and a 2-minute stall replays in 0.8 s, blocking the event loop (measured on an M-series Mac; a shared-cpu-1x will be slower)

*Server correctness · criterion: deployed-app · partly confirmed (raised as minor)*

- **Evidence:** /Users/advaymenon/.claude/jobs/3ff57576/tmp/code/ear.ts calls heard.listen() with 60 listener keys on a scratch DB. 60 satellites: p50 1.5 ms, max 9.4 ms per tick; 2-min catch-up 87 ms. 200 satellites + 400 word-carrying fragments (SKY_CAP and LIVE_CAP region): p50 25.2 ms, max 73.8 ms per tick; 2-min catch-up 808 ms. heard.ts:186 calls liveSky(to) every tick, and heard.ts:202-212 runs stationOver for every speaking object at every sampled second.
- **Why it matters:** In the 'holds up under unplanned use' band, a crowd that fills the sky near the cap would spend a noticeable share of a shared vCPU in the ear. After any stall (GC, slow disk) the 2-minute look-back blocks every request for seconds. At today's live sky size it is negligible.
- **Verifier:** I re-ran the reviewer's ear.ts on a fresh scratch DB (migrated, DERELICTS=0, EXTRAS_PER_HOUR=0), twice at the cap. N=200, D=400: p50 3.7 ms and 3.4 ms, max 12-13 ms, 2-minute catch-up 212-242 ms. N=60: p50 1.4 ms, catch-up 180 ms. The reviewer's cap figures (p50 25 ms, max 74 ms, 808 ms catch-up) are 5-7 times higher than mine, likely inflated by load from the parallel reviewers. The structural point is real: heard.ts:186 calls liveSky(to), which settles every tick, and LONGEST_LOOK is 2 minutes (heard.ts:152). But it only matters near a 200-satellite, 400-fragment sky, far beyond the live sky (6 satellites, 42 fragments). A shared-cpu-1x might be 2-4 times slower, which still means a few hundred ms in a rare stall. Not likely to cost marks.
- **Suggested fix:** Lower LONGEST_LOOK (e.g. 10 s), or skip objects nowhere near a station window (precompute untilStation once per pass), and reuse the settled sky rather than calling liveSky every tick. Re-measure with scripts/performance on a 1x-CPU throttle.

#### `code-stale-collision-cards`: When the stream is the first request after a stop, collisions caught up beyond the newest five arrive as live 'collision' events and flash as fresh cards

*Server correctness · criterion: deployed-app · partly confirmed (raised as minor)*

- **Evidence:** src/pages/api/events.ts:29-69 holds events published during the snapshot's settle and sends them after hello. On the client, src/scripts/sky.ts (collision listener, around line 826) runs `if (remember({...})) tell(story);` with no age check, whereas the hello path checks `time - story.at < CARD_MS` (around line 770). hello only carries recentCollisions(5). Reproduced on my own server (8098) with a copy of the 8-day-stale DB, opening /api/events as the first request: the stream sent 1 hello, 5 collision, 58 decay, 14 launch and 3 conjunction events. The collisions had at= 2026-10-31 to 2026-11-06. Here all 5 were also in hello, so remember() returned false. A gap with more than 5 collisions would tell the older ones as new cards. I did not observe that in a browser.
- **Why it matters:** The trigger is a tab reconnecting to a machine Fly has just started. The visitor sees a stack of 'collision' cards for events days old, which reads as a bug at exactly the moment a marker returns the next day.
- **Verifier:** The code asymmetry is real. The hello path checks `time - story.at < CARD_MS` (src/scripts/sky.ts:770), while the collision listener (sky.ts:832) calls `remember(...) && tell(story)` with no age check. events.ts:29-69 holds events published during the snapshot's settle and sends them after hello, which carries only recentCollisions(5). I reproduced it on my own server (port 8098, PID 324, killed afterwards) with a copy of data/app.db and /api/events as the first request. I got 5 collision events with at 2026-10-31 to 11-06, all ids (89-93) also in hello's collisions, so remember() suppressed them. The reviewer's claim about more than 5 collisions is still unobserved. It is overstated in two ways. First, tell() replaces a single card (card.replaceChildren, sky.ts:628), so there is never a 'stack', just one stale card. Second, the trigger is narrow: an already-open tab's EventSource must be the very first request after a machine restart, and the gap must hold more than 5 collisions. A marker returning the next day loads /sky/ first, and that SSR settle publishes to zero streams. Real but unlikely to be seen: nit.
- **Suggested fix:** Apply the same `serverNow() - story.at < CARD_MS` check in the stream's collision handler. On the server, publish collisions only when `now - at <= EXTRA_NEWS`, as launchExtra already does.

#### `code-clock-offset-latency`: The client's clock offset ignores network latency, so on a slow link two screens disagree on who is on air near turn boundaries (by reasoning, not measured)

*Server correctness · criterion: deployed-app · partly confirmed (raised as minor)*

- **Evidence:** src/scripts/sky.ts:77 and :759 set `offset = hello.serverTime - Date.now()` on receipt, with no RTT correction. serverTime is stamped before settle work finishes and the payload (about 25 KB for about 60 objects) is sent. On a slow connection the client clock runs behind the server's by the one-way delay plus transfer time. With turns changing about 0.15 to 0.22 times a second per station (flicker finding), a 300 ms skew means two side-by-side screens show different speakers about 5 to 7% of the time per station. That is an estimate from the measured change rate, not a browser measurement.
- **Why it matters:** Markers test real time with two sessions side by side, top band on a slow connection. The app's claim is 'every screen shows the same one at the same moment' (airtime.ts:11-13).
- **Verifier:** The code is as described: `offset = hello.serverTime - Date.now()` (sky.ts:759) with no RTT correction, and serverTime is stamped after liveSky() settles (events.ts:47-49), but before the payload is serialised and sent. The resulting skew is one-way latency plus transfer time. The impact is reasoning only, not measured, and the 5-7% figure leans on the flicker rates, which include static swaps. At normal turn lengths (4-10 s), a 100-300 ms skew means two screens briefly disagree at each boundary, which a marker is unlikely to notice. Most of the visible risk goes away once the flicker is fixed. Plausible polish only.
- **Suggested fix:** Estimate RTT with a small /api/time ping (or the stream open time) and add half of it. Fixing the flicker shrinks the impact most.

#### `code-first-request-heap`: The first request after boot allocates about 90 MB of short-lived heap (heapTotal to 239 MB, macOS RSS about 310 MB), even on an empty DB; it survives a 96 MB old-space cap

*Server correctness · criterion: deployed-app · confirmed*

- **Evidence:** Preload /Users/advaymenon/.claude/jobs/3ff57576/tmp/code/memlog.mjs on my own server. Before the first GET /: rss=77 heapUsed=12. Peak: rss=317 heapUsed=102 heapTotal=239. 250 ms later: heapUsed=15, heapTotal=157, rss=277. Same pattern on a fresh DB and on the 8-day-stale DB, so it is the first render or module load, not catch-up. With NODE_OPTIONS=--max-old-space-size=96 the first two requests returned 200 with peak heapUsed=50, rss=198. During the 60-listener hold, peak heapUsed was 77 MB.
- **Why it matters:** The machine has 256 MB. The garbage is collectable and the live app answers in about 60 ms, so this is headroom to watch, not a failure. I did not measure it on Fly itself.
- **Verifier:** I reproduced it on my own server (PID 250, fresh scratch DB, killed afterwards). ps rss was 75808 KB before the first request, 290912 KB after the first GET / (200, 0.22 s), and 263728 KB after /sky/ and 3 s idle. So the first render roughly quadruples RSS on macOS, as claimed. I did not measure on Linux or Fly. The live app answers reliably, so it clearly does not OOM at 256 MB in practice. That makes it headroom to watch, not a failure. Nit stands.
- **Suggested fix:** Optionally set NODE_OPTIONS=--max-old-space-size=160 in the Dockerfile so V8 collects earlier rather than growing towards the container limit. Check `fly machine status` memory after a cold start.

#### `good-no-outcome-defined`: 'What good means here' never says what a good outcome would be

*Is it good? · criterion: brief · partly confirmed (raised as minor)*

- **Evidence:** README.md:11-29 gives four mechanics (needs others, cost, remembers, no reset) but no target. For example, it never says a good sky is one where people choose high or deorbit, or where static stays under X% of airtime. Flagged in PLAN.md:280.
- **Why it matters:** Without a stated outcome, 'good' is a description of the mechanics, which is close to 'works and looks nice'. The marker asks whether good goes beyond that.
- **Verifier:** README.md:10-26 lists four mechanics and no stated target outcome, and PLAN.md lists this as unresolved. But the README frames good as a question the visitor is left with ('what's worth saying, if saying it costs everyone a little?') and grounds it in commons literature. That arguably goes beyond 'works and looks nice'. A missing outcome sentence is a polish point, not a likely mark loss.
- **Suggested fix:** One sentence: what a visitor leaving should have done or noticed, and what sky state counts as the commons holding.

#### `good-concept-overload`: A first visitor has about 17 concepts to learn and three explainer pages

*Is it good? · criterion: brief · partly confirmed (raised as minor)*

- **Evidence:** Concepts on the pages: bands, beacon, callsign, three stations, turns on air, heard-by, listening count, static, derelicts, echoes (derelicts carrying gone satellites' last words, PLAN.md:93-95), extras (hidden), question of the day, handles/operators/passphrase, boost, deorbit, the wreck's words, lineage/blame, encounters in Yours, catalogue. The nav (live /, 1920 screenshot pad-1920.png) has 7 items, including Why, Kessler syndrome and README, all explanatory.
- **Why it matters:** The brief marks down 'features with no reason to exist'. Echoes, boost and the question of the day each add a concept without strengthening the dilemma. Echoes in particular create the staged static that muddies the cost signal (finding good-stations-drown-in-staged-static).
- **Verifier:** The live nav has 7 items (Launchpad, Sky, Catalogue, Why, Kessler syndrome, README, Sign in), and echoes exist (src/lib/chronicle.ts:122-129, the Why page's 'Even the dead satellites the sky keeps carry an echo'). The count of '17 concepts' is the reviewer's own and subjective. Echoes and boost have stated reasons in PLAN and the ADRs, so 'features with no reason to exist' is overstated. The best point is the link to the static finding, which is already scored there.
- **Suggested fix:** Cut or fold: drop echoes on derelicts, merge 'Kessler syndrome' into Why, and consider dropping boost (it trades a cheap band change against the band-choice dilemma). List the cuts under 'What I chose not to build'.

#### `good-live-record-test-pollution`: The live record's real people are mostly test accounts

*Is it good? · criterion: deployed-app · confirmed*

- **Evidence:** Of the 48 non-extra satellites in the live catalogue: TESTACC (about 12), DPT (about 9), 'test test', 'seong test', FILTER0/67, ANOTHERTEST6767, INCOGNITO0, ANON-LOG-0, LOGFORCE1, plus 'MH370'.
- **Why it matters:** A marker browsing the catalogue to see 'who caused what' finds test noise and invented people, and almost no evidence of real use. It weakens the claim that the sky remembers people.
- **Verifier:** Verified from the 20-page catalogue read: the 47 non-extra satellites are TESTACC (about 12), DPT (about 9), FILTER0/67, ANOTHERTEST6767, INCOGNITO0, ANON-LOG-0, LOGFORCE1, MH370, 'aaa', 'dadadadada' and so on. Nothing resets by design, so this is a nit.
- **Suggested fix:** Leave the record (nothing resets), but if any real-use evidence exists from crits, cite it in the README or PROCESS.

#### `good-readme-last-edits-by-agent`: The README's last two edits were made by the agent

*Is it good? · criterion: process · confirmed*

- **Evidence:** git log -- README.md: 6a34288 and 9096558 (2026-10-23), author 'Claude'. The earlier commits are Advay's. The PROCESS.md commits are all Advay's.
- **Why it matters:** The spec says the documents are written by the student. The edits are small (two enforced bullets and one word), but a marker reading the history may notice.
- **Verifier:** git log -- README.md shows 6a34288 and 9096558 (2026-10-23) authored by 'Claude', and all earlier ones by Advay. 6a34288 adds 4 lines (the two enforced bullets). 9096558 changes one word and a trailing space. These are small edits, so it's a nit, but the spec says the documents are written by the student.
- **Suggested fix:** Advay rewords the two enforced bullets himself in the final README pass.

#### `critic-source-comments-shipped`: Developer comments with ADR numbers, file paths and 'the user's review' ship in the live HTML

*Completeness critic · criterion: deployed-app · not independently verified*

- **Evidence:** curl of the live / /sky/ /catalogue/ /why/ shows 21 HTML comments, for example: '<!-- what's yours and a full sky: one quiet box, so the form still fits a laptop's window (pnpm test:layout); the wait is on the button -->', '<!-- each box folds to its heading (the user's review, 2026-10-08): src/scripts/collapsible.ts shows the button and remembers -->'. They come from src/pages/*.astro, written as HTML comments rather than JSX/frontmatter comments.
- **Why it matters:** Harmless functionally, but view-source shows agent-voice notes ('the user's review') to a marker reading the app, and they add bytes to every page.
- **Suggested fix:** Turn template comments into {/* */} expressions or move them to frontmatter so Astro strips them.

#### `critic-perf-reports-predate-threejs`: The only real-Chrome performance reports are from 6 Oct, before the Three.js scene that now makes up about 80% of the client payload

*Completeness critic · criterion: spec-contract · not independently verified*

- **Evidence:** performance-results/latest.md is dated 2026-10-06T04:17. Three.js came in with ADR 0005 and 0006 (f8f7003, 5c41ccd, after 6 Oct). Live brotli transfer: three.DLV41ouf.js 177,894 B and scene.CdWFCkgM.js 91,891 B. My own Slow 4G (1.6 Mbps/150 ms) plus 4x CPU run at 390x844 against the local build (/Users/advaymenon/.claude/jobs/3ff57576/tmp/critic/slow.mjs): '/' FCP 568 ms, load 1.93 s, 734 kB on the wire; /sky/ FCP 524 ms, canvas at 2.13 s. That is acceptable, but it isn't recorded anywhere a marker can see.
- **Why it matters:** The top band names 'slow connection'. The app handles it reasonably (server-rendered text first, a no-JS launch form), but no current evidence in the repo, PROCESS.md or the README says so, so the strength goes uncredited.
- **Suggested fix:** Re-run pnpm test:performance once (the user must ask, per CLAUDE.md) and quote the Slow 4G line in the log or README's 'judged' section.


### Refuted (2)

- **`fixed-asset-cache-max-age-0`: Hashed /_astro/ bundles are served with max-age=0 (Three.js is 179 KB compressed).** The evidence is an artefact of using a HEAD request. `curl -sI` (HEAD) on the live /_astro/three.DLV41ouf.js does return 'cache-control: public, max-age=0'. But a real GET (`curl -s -D - -o /dev/null`) returns 'cache-control: public, max-age=31536000, immutable' with every Accept-Encoding I tried (br+gzip, gzip, br, none). The reason is node_modules/@astrojs/node/dist/serve-static.js:115-116: it sets the immutable header for /_astro/ only on the stream's 'stream' event, which fires on GET (what browsers send) and not on HEAD. Browsers do cache the bundles as immutable. (Minor side note, not this finding: the live GET came back with content-length 571341 uncompressed, but that's a different issue and wasn't what was claimed.)
- **`fixed-cold-start-unmeasured`: I couldn't measure cold start: the live machine was already awake.** This isn't a finding. The reviewer says plainly that nothing was measured and no defect was seen. notes/log.md (2026-10-19 entry, ~line 4153) records the deployed machine cold-starting three times while watched live, with no errors and every request answered. PLAN.md:299 says the same. notes/log.md:649 also documents a hand check of catch-up on the first request after a stop. With no measured slowness and logged cold starts that went fine, nothing here would plausibly cost marks.

## Strengths the reviewers found


**Fixed requirements**

- Real-time latency, measured: an HTTP launch reached another cookie's SSE stream 10 ms after the POST, and a boost reached it in 3 ms. In browsers, a phone (390x844) launch showed on a desktop (1920x1080) sky 34 ms after the click, and a desktop launch showed on the phone sky in 48 ms.
- Under load: 20 cookies, each with its own open stream, launched at the same moment. All 20 got 201, the slowest response took 216 ms, and all 400 deliveries arrived (0 missing) within 219 ms.
- SSE passes through Fly's proxy unbuffered: a read-only stream from the live app delivered 'heard' events every 1 to 6 s (X-Accel-Buffering: no, no-transform).
- Multi-user ownership is enforced on the server: B's deorbit of A's satellite returned 422 {why:'not-yours'}; only the owner's card has the controls and '· yours'; the launch gap counts per operator across two signed-in devices (second device got 'You can launch again in 1 min 00 s'); a wrong passphrase gives 422; a cross-origin POST gives 403.
- Persistence across restarts verified on the same DB: cookie identity and handle sign-in survived on both devices. A deorbit started before the kill finished at exactly start + 150 s after the restart. A predicted collision (16/39) that fell while the server was down was written at its precomputed instant (01:05:24.767) and announced to the reconnected pages. Both open browser pages showed 'Reconnecting' while the server was down and went back to Live on their own, with no reload.
- The redeploy path is sound: Dockerfile sets DATABASE_PATH=/data/app.db and runs `node scripts/migrate.mjs && exec node dist/server/entry.mjs`; fly.toml mounts the 'data' volume at /data; drizzle/ has 11 journalled migrations; SQLite runs in WAL mode.
- Live /readme/ is server-sent HTML with all five README headings (Kessler, What good means here, What is enforced and what is judged, What I chose not to build, Sources). The live app serves the same asset hashes as HEAD's dist, so it matches HEAD's build.
- Launching works without JavaScript (plain POST gives 303 to /sky/?launched=99), as the README claims.
- `pnpm test:layout` against a fresh server: 16 of 16 pass.

**Robustness and security**

- Concurrency invariants hold under real races (my server, scratch DB). 20 simultaneous launches from one cookie gave exactly one 201 and nineteen 422s ('You can launch again in 1 min 00 s'). 30 interleaved boosts and deorbits on one satellite gave exactly one deorbit and every other request refused. 250 concurrent launches from distinct cookies stopped at exactly 200 live satellites (190 accepted, 60 refused), with zero 500s anywhere in the logs. Synchronous better-sqlite3 transactions plus the guarded UPDATE ... WHERE in reorbit do their job.
- Ownership is enforced on the server: a different cookie or no cookie trying to boost or deorbit gets 422 'not-yours'. Malformed ids (abc, -1, 0, 1e3, 23-digit numbers, %00) return 404, and odd catalogue query parameters return 200 with no 500.
- CSRF is covered: Astro 7.3.5's checkOrigin returns 403 for a POST with no Origin or a foreign Origin, on /, /manoeuvre/ and /operator/, as urlencoded and as multipart. Cookies on the live app are `HttpOnly; Secure; SameSite=Lax`. Redirect targets are fixed tokens looked up in a Map, so no open redirect. Passphrases use scrypt with a per-user salt and timingSafeEqual, and an unknown handle still gets hashed so timing doesn't reveal which handles exist.
- No XSS found. Beacons like `<img src=x onerror=alert(1)></textarea><script>...` and `"></script><svg onload=...>` render as text on /object/, the panel, the catalogue and /sky/ (embed() escapes `<`), and the agent-browser DOM had no injected elements. The only innerHTML is server-rendered, Astro-escaped panel HTML.
- SSE is light and cleans up properly: 100 concurrent streams added about 5 MB RSS. When they disconnected, all 100 logged listen-close, no ESTABLISHED sockets remained, and listening fell to 0. The audience count was right (100) and debounced. A broken stream is dropped without hurting the others.
- Reconnect resyncs: when I killed and restarted the server, the open sky page went 'Reconnecting' then back to 'Live' in about 6 s. The client restarts a CLOSED EventSource itself, and the hello carries the sky, conjunctions, recent collisions and the heard feed, so missed events are recovered from the snapshot rather than lost. The live object count was unchanged across the restart (269 before and after).

**Response to the brief**

- Every 'Enforced, and tested' bullet has a real test in spec/: live.test.ts:69 (launch on another stream in under 1000 ms), launch.test.ts:22 (no-JS form), log.test.ts:220 (200 cap against the literal number), heard-server.test.ts:95/362 (people, not owners or tabs), wreck.test.ts:18 plus chronicle.test.ts:209 (every word, traced to operators), collision-server.test.ts:161, manoeuvre-http.test.ts:199/278, and the log.test.ts suite. decay.test.ts:168 pins 'low every 3 minutes, high every 24'.
- Verified on the shared server: a curl-only POST to / returned 303 to /sky/?launched=44, and a separate cookie's /api/events stream received the launch event about 25 ms later. The no-JS claim and the real-time claim hold.
- /readme/ is server-rendered with zero <script> tags, all five headings present in order, and identical local and live. It is readable at 1920x1080 and on iPhone 14 with no horizontal scroll (scrollWidth 390).
- Not a chat room with swapped nouns: no replies, and the only contact between strangers is a collision that mixes both lines into static that costs everyone airtime. The concept (attention as a commons, made literal as orbital debris) is distinctive and far from the median answer.
- 'What I chose not to build' names real costs ('two browsers are two people'), and the README is candid about extras and staging rather than hiding them.
- PROCESS.md takes a position on the readings ('Where I part from them is time: ... a visitor gives Kessler ten minutes'), and the project has real balance measurements with commands and run counts in notes/log.md.
- pnpm check:evidence passes (3 reflections, 29 cited commits all resolve).

**PROCESS.md**

- `pnpm check:evidence` passes: 29 cited commits all resolve, and all three crit reflections are present.
- Most hashes check out on `git show`: 69e92a0/455789e/67b29a9 (layout fixes), 248469e (the 75px-after-62px acceptance is in its log entry), 8aa68f3 ('fails 5 of 12'), ade7d43/59480dd (bands side-by-side, then back), PR #6 closed unmerged, PRs #7, #8 and #10, c89bcbf (the three rules), 262e2b4/4e34a4a (tests that couldn't fail), a286df9 (3%), d7b89f7 (57% and 99.5% match the ADR 0021 table), 21de098.
- Each item in 'Corrections that became the harness' traces to a rule or check that exists: the CLAUDE.md Layout section plus layout/desktop-fit.test.ts, 'Review subagents run on Opus', spec/global-setup.ts refusing *.fly.dev, and the c89bcbf rules on revert-to-red, balance numbers from runs, and first-time-visitor review.
- The live-suite incident (lines 69-79) is a strong, honest process story: a harness gap, real damage, a surgical recovery rehearsed on a copy, and an enforced guard.
- Many visible refusals of agent ideas, with reasons: the 3D globe, reply launches, matching collisions by meaning, staging collisions between people's satellites. That makes the student's judgement legible.
- There is a real position on the readings ('Where I part from them is time'), not just citation.
- 'Runs gave the numbers; only playing told me whether it felt right' is a clear thesis, consistent with the crit-9 reflection.
- The student did make an un-co-authored clarity pass today (c1e5cd7), including real before/after screenshots of a design reversal.

**Other process evidence**

- Spec contract holds: `pnpm check:evidence` passes locally and in CI ('29 cited commit(s), all resolve'), and the latest main run (42319458127, c1e5cd7) is green on check, evidence and deploy. CI runs check, check:evidence, two TruffleHog passes, then a deploy gated on check, as claimed.
- No secrets found: no `sk-` keys anywhere in `git log -p --all`, mise.local.toml and .claude/ are untracked and ignored, and the course-key detector is configured.
- Corrections demonstrably became harness: the layout scrolling became `pnpm test:layout` plus a CLAUDE.md rule; 'tests that can't fail' became a revert-and-watch-red rule, followed with evidence in later log entries (e.g. 10-19 'both reverted again ... all three go red'); the live-suite incident became a guard in spec/global-setup.ts:20 plus a CLAUDE.md rule, with a candid incident write-up.
- 26 ADRs with a consistent index; 0002 was superseded properly while still proposed; ADR 0026 records a rejected, built-and-scrapped feature honestly.
- Most commit messages are specific and descriptive with explanatory bodies. notes/log.md is a rich, candid raw record (reviews, measurements with run counts, what was refused).
- Three reflections in place under the names the cutoff sweep reads, each answering both prompts within the word range.

**Spec suite**

- `pnpm check` is green against a fresh build on my own server (port 8096, scratch DB): astro check gives 0 errors, 0 warnings, 0 hints; tsc is clean; 31 files and 431 tests pass in about 19 s, about 80 s with the typecheck. A second and third run on the same, now dirty, DB were also green. The output is pristine, and the server log for the runs has no stack traces.
- `pnpm check:evidence` is green: three reflections, and all 29 commits cited in PROCESS.md resolve.
- No retries in vitest.config.ts, no .only, .skip or .todo. The one skipIf (operator.test.ts:121, the rate limit behind Fly) is principled. global-setup.ts refuses a *.fly.dev APP_URL, which came from a real incident and turned it into a check.
- spec/invariants.test.ts is unchanged since the initial commit, green, and meaningful: it checks / answers 200 and that the README headings appear in order in the server-sent HTML.
- The mutations I tried were caught. Removing the owner check in the satellite lookup failed 9 tests. Changing SKY_CAP 200 to 250 failed log.test.ts 'a full sky', which checks the fixed number 200 against 199 seeded satellites. Making events.audience() count tabs failed 'counts people, not their tabs'.
- The HTTP tests read as contract tests: plain no-JavaScript form posts, cookie jars as separate people, the 303/422/403 statuses, CSRF origin checks, open-redirect `back=` values, forged-cookie refusal, a simultaneous double boost (exactly one 200 and one 422), and XSS in a beacon carried as data.
- Persistence works across a real process restart (checked by hand on 8096).

**First-visitor UX**

- The launchpad hero gets the argument across in one paragraph within 30 seconds: 'Say one thing to everyone here … when two satellites collide, their words break into static over everyone else's. What's worth saying, if saying it costs everyone a little?' There is a clear 'New here?' link and the form explains the trade-off at the point of choice ('Lower: heard more often, burns up sooner').
- Real time works across viewports. A launch from a separate iPhone 14 session appeared in the desktop sky's text within ~50 ms of my check starting, and the canvas and 'Latest launches' updated without a reload (desktop-sees-B.png).
- No vertical scroll at 1920x1080 on / and /sky/ (scrollHeight 1080, both new and launched visitors), no horizontal scroll on iPhone 14 (scrollWidth 390). The layout suite passed 16/16 on rerun.
- Accessibility is solid. Launch is fully keyboard-reachable (Tab order callsign -> beacon -> checkbox -> Launch) with a visible 2px orange focus outline. The canvas is role=img with a live aria-label summarising the counts. View buttons use aria-pressed. prefers-reduced-motion is honoured in sky.ts and index.astro. No img lacks alt. Muted station text measured 7.5:1 contrast.
- Cards are well written and trace history ('What happened' / 'What it led to'). A fragment's card lists both source lines and who carried them, which delivers the README's 'the sky remembers' claim.
- Graceful details: the draft survives the claim-a-handle detour; the launchpad shows 'Launch again in 46 s' and 'Yours in orbit: DRAFTKEEP …' after a launch; there is a 'Skip to the sky' button during the rocket animation.
- The live app is responsive (/, /sky/, /readme/, /catalogue/ in 0.05-0.10 s). Test debris from the 2026-11-02/03 incident appears cleaned: live catalogue searches for spec callsigns ALPHA, BRAVO and SAT-alice return nothing.
- /readme/ is server-rendered with the README's four H2 headings, readable and well set at desktop.

**Server correctness**

- Long-gap catch-up is fast and correct. On a copy of the real local DB, 8 days stale (551 objects, 88 collisions), the first settle took 48 ms (heap peak 63 MB) and the first /sky/ request 68 ms server-side. It replayed 5 collisions, 22 extras' launches (capped at the 24 h backfill, as designed), 58 burn-ups and a derelict top-up, then answered. Boot to listening: 1.36 s including migrations.
- Crowded cold start is cheap: the first settle with 200 satellites and 400 debris took 110 to 167 ms (O(n²) pairing measured, not guessed).
- Real time holds at showcase scale. On my own server, 60 distinct cookie-holding people each kept an SSE stream open and all launched at once: 60/60 POSTs returned 303, all 60 launches reached all 60 streams with 0 missing, delivery p95 260 ms and max 272 ms after the first POST, 0 stream errors. Holding the 60 streams for 45 s with the ear running, a /readme/ probe ran p50 1 ms, p95 4 ms, max 26 ms; no errors logged.
- Persistence works: after killing and restarting the server on the same DB, all 60 load-test launches were in the DB and the catalogue; migrations re-ran cleanly on an existing DB.
- SSE details are right: the stream subscribes before the snapshot and holds events until after hello; abort and cancel both run cleanup (listen-open/listen-close logged, listener count back to 0); a 25 s comment ping keeps it under Fly's idle timeout; X-Accel-Buffering and no-transform are set; the client reopens the stream after a hard error and closes it on pagehide or a long hide.
- Multi-row writes are transactional (collision plus fragments, manoeuvres plus their row, launch check-and-insert, heard passes with rollback of in-memory state on failure); WAL is on; settle and timer errors are caught so one bad write can't kill the process; wakeForNext caps waits at 60 s, so there's no setTimeout overflow or drift build-up.
- In-memory structures are bounded or pruned: passesNow (pruned past 5000), newcomers (at most 10,000, 10-minute TTL), the extras plan and order caches (cleared at 2000), and the meetings/announced maps (pruned to live pairs).
- Canberra-time logic uses Intl with an explicit Australia/Sydney zone, so it is independent of Fly's UTC machine. The live home page's asked-day (20764) and question matched dayOf/questionOn computed locally, and the extras guard the DST fall-back hour.

**Is it good?**

- The concept maps cleanly: a commons of attention as orbital debris, with a clear question ('what's worth saying, if saying it costs everyone a little?') carried through the README, launchpad, Why page and PROCESS.md.
- It's distinctive, not a chat room with the nouns swapped. There is no chat, and options that would have made it one were explicitly rejected with reasons: aiming a reply, collide-by-meaning, conjunction alerts and dodging, and the sound radio (ADR 0026, built twice and scrapped on listening).
- Measurement culture is real: scripts/balance runs the real server code, ADRs quote run counts, and CLAUDE.md requires a test to go red with its rule reverted. Many design changes (ADRs 0019-0021) were driven by measured problems, not vibes.
- The extras are disclosed in the README, and the design is careful: they never listen, so 'heard by' stays people; they make room for people (EXTRA_ROOM); they can't be signed in as; and their lines can't contradict the sky.
- The visual craft is high. The live launchpad and sky fit 1920x1080 with no scroll (scrollHeight 1080), and the Three.js sky with its station panels is striking.
- PROCESS.md has real substance: corrections that became rules (the layout check, the live-suite guard), a rejected first layout-test attempt, and a position on Kazemi and the time scale of a ten-minute visitor.

## Each reviewer's verdict

**Fixed requirements.** All three fixed requirements hold, and with margin. I tested each one dynamically, not just read the code. Real-time is fast: under 50 ms between a desktop and a phone, and 20 simultaneous launchers each reached all 20 streams within about 220 ms with nothing dropped. Persistence is the strongest part: identity, handles, a deorbit in progress and a collision during downtime all came back after kill-and-restart on the same DB, and the open pages reconnected without a reload. Multi-user ownership is enforced on the server and visible in the UI, though an anonymous launcher, the default, shows to others only as 'without a handle'. The weak spots are around the edges, not the core. Only the sky page is live, so the catalogue, Yours and the object cards go stale. On a phone the news of what just happened is about 1.4 screens below the globe. More than four simultaneous handle claims get 'busy' refusals. I couldn't measure cold start because the live machine was already awake. None of these fails a fixed requirement, but the first three are things a marker or a showcase room could run into.

**Robustness and security.** For the ordinary 'two people at once' case, and for a room of people acting at the same moment, the app holds up. Races on launches and manoeuvres can't break its invariants, there are no 500s, SSE scales cheaply and cleans up, reconnect resyncs from a snapshot, and XSS, CSRF and cookie handling are done properly. Abuse is where it falls short, and in a showcase room it only takes one person. One oversized POST probably OOM-kills the 256 MB machine, since the adapter allows a 1 GB body (verified locally at 128 and 180 MB heap caps). A cookieless curl loop skips the 'minute between launches' that the README lists as enforced and fills the 200-satellite cap in under 2 s, locking everyone out of launching for 31 to 75 hours. The word filter lets through hate phrases and Unicode-disguised swearing, with no takedown and permanent storage. Fixing the body limit and launch rate limiting is a few lines each and would move this dimension from 'fine with friendly users' to top band. The moderation gap is a design position, but at the moment the README claims more for it than the app can deliver. I didn't try any of this on the live app. I killed my server on 8095 and closed the browser session.

**Response to the brief.** The concept is good and well above the median answer, and the mechanical half of the README holds: each enforced claim maps to a test, and the real-time and no-JS claims check out against the running app. The response to the brief is weaker than it looks, though. The 'judged' half is three placeholders with no method and no result, even though the repo holds 12-run balance figures it could cite. The sources are bent: Ostrom's sanctions and boundaries, Kazemi's moderation and Shirky's known group are all things the app explicitly lacks. The core causal claim (crowding costs everyone) is measured false in a quiet sky, and what a marker actually watches is about 89% staged derelict collisions among invented people a visitor can't tell apart. CLAUDE.md carries no rules derived from the argument, so README, CLAUDE.md and spec/ do not visibly agree. PROCESS.md is about 25% over its word limit. These are mostly fixable in the README and CLAUDE.md text before Monday, without code changes.

**PROCESS.md.** PROCESS.md has good bones. Its harness-corrections section is specific and each correction traces to a real CLAUDE.md rule or spec check. Most of its 29 citations hold up, and it shows real student judgement through refusals. It is not 'actually good' yet against the criterion worth 50%. It runs 16 to 27% over the 900 to 1,100 word limit, and the last two commits made it longer. It says nothing about crit 10's logging work, which was drafted, removed and then marked 'done' without being written. About two-thirds of its words were last written in Claude-co-authored commits, and the student's 'rewrite in own words' is a 4-line change. Its opening asserts a crowd-low claim that the student's own balance runs and README contradict. The workflow section asserts rather than argues, and today's edit deleted its one rationale. A handful of citations point at the wrong commit, and one screenshot caption describes the image wrongly. All of these can be fixed in a day, but as it stands a marker reading against the commits will see process partly asserted and partly agent-authored.

**Other process evidence.** The harness the evidence describes is real and above average. Several corrections visibly became tests or rules, the live-suite incident was handled and turned into a guard, CI and check:evidence are green, and nothing secret was committed. But the documents a marker reads have drifted from each other and from the work. PROCESS.md is over the spec's word range, and today's commit is what pushed it over. CLAUDE.md contains only workflow rules, none derived from the README's argument, and it contradicts the PR and worktree practice that PROCESS.md itself describes. PLAN.md is stale and self-contradictory. The project's own reviews found README claims the app doesn't keep ('no moderation' beside a blocklist, a per-band count never made, principle 2 contradicted by its own quiet-sky measurement), and these were parked rather than fixed. Provenance is the biggest legibility risk: about a third of PROCESS.md traces only to an agent redraft, and the log entries describing agent drafting of PROCESS.md and a reflection were deleted. Overall it is strong process material, but presently it is assembled in a way a careful marker can catch out in several places.

**Spec suite.** The suite is large (431 tests), green twice over, runs fast with no retries, and its ownership, 200-cap and people-not-tabs rules fail when reverted. That is better than most student suites. It isn't as solid as its size suggests. Two extras tests fail on certain wall-clock dates, every time, and the first window covers most of Tue 10 Nov AEDT, the start of marking. This is the third time this test family has broken on the date, and the fix still reads Date.now(). The README's 'a minute between launches, enforced and tested' isn't pinned: a 30 s gap passes all 431 tests, against CLAUDE.md's own rule about testing against the constant. The suite also fills the shared sky, so the 4th run against one server fails 52 tests. Most 'enforced' claims, restart catch-up included, are checked in-process on src/ rather than over HTTP against the deployed image. A real restart was verified only by hand. Fixing the clock and the launch-gap assertion before the deadline would remove the two findings that could cost marks.

**First-visitor UX.** For a first-time visitor the front door is strong. The launchpad says what to do and why in one paragraph, launching is quick and accessible, real time is near-instant across viewports, and the two pages hold one desktop window. It falls apart after the launch, exactly where the argument is supposed to land. The hand-off drops you on a horizon where your satellite isn't visible yet. The sky's vocabulary (derelict, overhead, passes, 'echoing', slash-joined 'the wreck says') needs project context. And the live sky a marker will open today has no real people in it, invented satellites with backdated histories, and station rows that are mostly static from derelict-on-derelict collisions, swapping text every few hundred milliseconds (a bug PLAN.md has listed as open since 31 Oct). So a marker spending a few minutes can see that things collide and turn to noise, but not that crowding by people caused it or who paid. That cost seeing is the 'good' the README argues for. Fixing the station dwell time, the derelict staging and the post-launch view would do more for marks than any other polish.

**Server correctness.** The server core is solid. Catch-up after a long stop is fast and correct (an 8-day gap replays in under 70 ms), 60 people launching at once all reach 60 open streams in under 300 ms with nothing lost, and data survives restarts. I found no crash, data-loss or timeout bug that would bite during marking. The one defect a marker or showcase room will see is the known on-air flicker. It is not limited to crowded skies: at today's live sky size (6 satellites, 42 fragments), half the turns that end while the speaker is still overhead last under 4 s, median 1.65 s. Since the server credits 'heard' by the same rule, the app's central 'heard by' figure can count people who saw a beacon for a fraction of a second. The README's enforced claim that a restarted server 'catches up to the same sky' is true only with derelicts off, which is how the tests run, not how production runs. The rest is headroom: ear CPU near the sky cap, a stale-card edge case on reconnect, latency-blind clock sync and a transient first-request heap spike. My server on 8098 was stopped and the repo is unchanged; all measurement scripts are under /Users/advaymenon/.claude/jobs/3ff57576/tmp/code/.

**Is it good?.** For "this is good": Kessler has a real idea with mechanics that carry it. Words take up orbit, collisions make static, and nothing resets. It's visually striking, clearly argued from named sources, and full of documented rejected options and measured tuning, which is far from an agent's median answer. Against it: the repo's own measurements show the dilemma reverses in a quiet sky (going low is safer for you and for everyone). About 9 in 10 collisions a watcher sees are staged. About 90% of all satellites on the live sky are invented. And the stations a visitor hears are about 85% static from collisions no person caused. So a marker visiting alone watches a well-made puppet show of the argument rather than the argument working. The 2026-10-23 'For Advay to sort' items (cost only at crit density, visibility with nothing to act on, no defined good outcome, a judged section with no judgement) are all unresolved: the README is unchanged since that day, and CLAUDE.md carries no rules derived from the argument. My call: good craft and a genuinely considered concept, but not yet 'actually good' by the brief's standard. The honesty is in PLAN.md and the log rather than in the README and the page, and fixing that is mostly writing, plus one or two tuning changes (silent staged wrecks, the station flicker), not a rebuild.

## The judges' verdicts

### Legibility of process (50%): D

The process material is genuinely good, mostly because of what's underneath PROCESS.md: 26 ADRs, a candid log full of measured runs, and corrections you can trace into real harness. I checked the layout rule against test:layout, the Opus rule, the fly.dev guard in global-setup.ts and the c89bcbf rules, and each holds against its cited hashes. The 'Corrections that became the harness' section is top-band writing, and so is the live-suite incident. The document itself falls short of HD on three counts. First, length: I count about 1,340 words of prose and wc gives 1,394, against a 900-1,100 range, and it was already 1,235 at 4d246bc. Second, crit 10's logging work (ADRs 0022-0025) is missing entirely. Third, the stack and workflow sections name choices but give none of their costs, and today's edit deleted the workflow section's only rationale sentence. The details give a careful marker more to catch: two citations point at the wrong commit (5c41ccd for the globe decision, when it is in ADR 0005 / f8f7003; 41f32ef for the crit-9 review, when it is in 44487ac). The 'People typically crowd low' claim contradicts the README's judged list, and 'no moderation' sits beside a word filter. About two-thirds of the current words were last written in Claude-co-authored commits.

Their fixes, in order:

1. Cut PROCESS.md to 1,100 words of prose or fewer. The table rows, the run of three-failure bullets and the second screenshot are the easiest cuts.
2. Spend part of the space you free on a short crit-10 paragraph: rereading the spec moved the logging from totals to one line per action (ADRs 0022-0025, eca1ae7). This matches reflections/crit-10.md.
3. Give each stack choice one cost and say how you lived with it: single-process SSE fan-out works on one machine only, reconnects get a snapshot rather than a replay, and Three.js is about 180 kB. Do the same for the workflow: ADR-per-decision overhead, and 60 'Log hash' commits.
4. Fix the miscited hashes: the globe decision is f8f7003 (ADR 0005), not 5c41ccd, and the crit-9 no-collision review is 44487ac, not 41f32ef. Make sure 10c86a5 actually supports the 'ADR, superseded' claim.
5. Fix the claims that contradict your own evidence: drop 'typically' from 'crowd the low band' or hedge it to match the README, and replace 'does no moderation' with 'no moderation beyond a small word filter'.
6. Fix the second screenshot's caption ('one line per band' is wrong; it shows two lines per band), and say it is a 2026-11-07 re-shoot of 59480dd's state.
7. Rewrite in your own voice the paragraphs that survive verbatim from the agent redraft 3ba6956 ('What good means here', 'Making the purpose clear'), and commit without co-authorship, so authorship is clear.
8. Add a short 'Product rules' section to CLAUDE.md derived from the README: heard-by counts people only, staging uses only derelicts, extras never listen, nothing resets. Also delete the stale line 'Not installed yet', so README, CLAUDE.md and spec/ visibly agree.
9. Add a notes/log.md entry for c1e5cd7 and this round of edits with hashes, and bring PLAN.md's status up to date (the 11-03 incident, lockfile repair, today's edits, stale PR #7 / ADR-acceptance lines).

Findings they thought a marker wouldn't care about: `evidence-adr-0021-edited-after-acceptance`, `evidence-omnibus-commits`, `evidence-weak-commit-messages`, `evidence-ci-output-noise`, `evidence-adr-partial-supersession-hidden`, `evidence-undisclosed-cursor`, `evidence-main-went-red`, `evidence-main-vs-worktree-contradiction`, `evidence-crit10-reflection-thin`, `process-incident-framing`, `process-post-1023-work-missing`, `critic-crit-tags-missing`, `critic-volume-replaced-undocumented`, `critic-crit10-pod-evidence-missing`, `evidence-log-hash-gaps`, `good-readme-last-edits-by-agent`.

### Deployed full-stack app (25%): D

On the deployed-app criterion this is solidly good, but it is not top band yet. I spot-checked the key code. All three fixed requirements hold with room to spare: SSE delivery takes milliseconds across viewports and 60 concurrent streams, server-side ownership checks survive races, and persistence holds across restarts, including catch-up of collisions that fell while the server was down. That puts it well above a pass. It falls short of 'holds up under unplanned use' in ways a marker can see or check against the README. In airtime.ts, turnAt recuts turns whenever `total` changes, so the station rows on the live sky flicker every second or two. nextLaunchAt keys the launch gap on a cookie that middleware mints fresh for every cookieless request, so the README's 'a minute between launches, enforced' can be skipped and the 200-satellite cap filled in seconds. A busy showcase room also hits the cap. Some README claims overreach: 'catches up to the same sky' holds only with derelicts off, a card shows 'who launched it' only when the launcher has a handle, and 'no moderation' sits beside a word filter. These are fixable in a day, but they are what stops this reaching HD.

Their fixes, in order:

1. Stop the station-row flicker: put turns on a fixed global grid, or let the current speaker finish its turn before `total` is recut (src/lib/airtime.ts turnAt/onAir), then recheck the live-sized sky by sampling
2. Close the cookieless launch-gap bypass: also apply LAUNCH_GAP per fly-client-ip in nextLaunchAt (src/lib/sky.ts:1567), and add a test that pins a 59 s refusal and a 60 s acceptance against fixed values
3. Set node({ mode: 'standalone', bodySizeLimit: ~64 KB }) in astro.config.mjs so one large POST can't OOM the 256 MB machine
4. Make the README's enforced and claimed lines match the app: qualify 'a restarted server catches up to the same sky' (derelicts are random), 'any object's card shows who launched it' (anonymous launches show 'without a handle'), and 'Kessler does no moderation' (there is a word filter)
5. Cut how much staged derelict static the stations play (shorter or silent turns for derelict-on-derelict static) so a marker visiting alone hears beacons, not about 85% static
6. After 'Watch it fly', land on Whole sky with the visitor's satellite ringed instead of a station horizon where it isn't visible yet
7. On mobile /sky/, move the Live indicator and 'Sky now' news above the station boxes so real-time changes show on the first screen of the phone session
8. Fix the date-dependent extras tests (spec/log.test.ts 'logs their manoeuvres as an extra's') so pnpm check stays green during the marking window

Findings they thought a marker wouldn't care about: `robust-length-units-mismatch`, `robust-get-pages-accept-any-method`, `robust-sky-double-payload`, `robust-live-beacons-in-payload`, `robust-bidi-format-chars-accepted`, `code-ear-cost-at-cap`, `code-first-request-heap`, `code-clock-offset-latency`, `code-stale-collision-cards`, `ux-label-overlap`, `ux-sign-in-label`, `ux-layout-test-flaky`, `critic-source-comments-shipped`, `critic-perf-reports-predate-threejs`, `critic-cold-start-6s-first-impression`, `brief-readme-word-count-borderline`, `brief-readme-why-sources-diverge`, `ux-why-sources-mismatch`, `evidence-adr-0021-edited-after-acceptance`, `evidence-undisclosed-cursor`, `evidence-omnibus-commits`, `evidence-adr-partial-supersession-hidden`, `evidence-ci-output-noise`, `evidence-weak-commit-messages`, `spec-in-process-majority`, `spec-vacuous-feed-branch`, `spec-busy-sky-accept-gone`, `good-live-record-test-pollution`, `good-concept-overload`.

### Response to the brief (25%): D

The concept is good, and it is not the median answer. Attention is treated as a commons and drawn as orbital debris. There is no chat. The only contact between strangers is a collision that costs everyone airtime. Rejected options are documented with reasons: reply launches, collide-by-meaning, the radio built and then scrapped. Every "Enforced, and tested" bullet has a real test, and mutations of the cap, ownership and people-not-tabs rules turn those tests red. The response to the brief is still weaker than the craft. CLAUDE.md has no rules taken from the README's argument, so the spec's three places (README, CLAUDE.md, spec/) don't agree. "Judged, not tested" names how each item would be judged but reports no result, even though 12-run balance figures exist. "Kessler does no moderation" sits beside a word filter; the project's own review flagged it and it was marked Won't fix. Principle 2 ("being heard more has a cost") is false by the project's own quiet-sky runs. I confirmed one enforced claim fails in the code: middleware.ts mints a new person for every cookieless request and nextLaunchAt keys the gap on that person, so "a minute between launches" doesn't stop a script. The live sky a marker opens is mostly invented extras and staged derelict collisions. It is honestly disclosed, but it is a show of the argument rather than the argument working. The gap to HD is mostly writing, plus one rate-limit fix.

Their fixes, in order:

1. Add a 'Product rules (from README)' section to CLAUDE.md: heard-by counts people only, extras never listen and are never sign-in-able, staging uses derelicts only, nothing resets, no chat or replies, the gap and the cap. Point each rule at its spec test so README, CLAUDE.md and spec/ visibly agree.
2. Rewrite 'Judged, not tested' to report results: how each item was judged and what was found. Run the per-band launch count on the live catalogue (read-only), quote the balance numbers with their command and run count (staged share 5.56 of 6.25 an hour), and give one sentence each of crit or playtest observation.
3. Fix the README claims the app doesn't keep. Replace 'Kessler does no moderation' with 'beyond a small word filter, no moderation'. Qualify principle 2 so it holds at crowd density, citing the measured quiet-sky reversal. Remove or soften PROCESS.md:7's 'People typically crowd the low band'.
4. Close the cookieless bypass of the launch gap: refuse a POST launch without an existing person cookie, or add a per-IP (fly-client-ip) gap. Then add an HTTP test that two cookieless launches can't both succeed. The README lists the gap as enforced.
5. Pin the launch gap against fixed values: refused at 59 s, accepted at 60 s, using the literal 60_000 and not sky.LAUNCH_GAP. CLAUDE.md requires this.
6. Make the Why page honest about extras (it still says 'two people's words' and 'how strangers answered'), and add a spec assertion so the fix can't regress a third time.
7. Tighten the source use in 'What good means here': say plainly that Kessler takes Ostrom's visibility principle and deliberately not her sanctions or boundaries, and why. Fix the '1968.' and '2004.' line wraps that render as ordered lists on /readme/.
8. If there's time, fix the station-row flicker (airtime.ts turnAt recuts turns whenever the overhead set changes). It undermines what 'heard by' credits, and it is what a marker watches.

Findings they thought a marker wouldn't care about: `robust-oversized-body-oom`, `robust-bidi-format-chars-accepted`, `robust-sky-double-payload`, `robust-live-beacons-in-payload`, `robust-length-units-mismatch`, `robust-get-pages-accept-any-method`, `brief-readme-word-count-borderline`, `brief-extras-holdback-overstated`, `brief-restart-claim-tested-in-process`, `brief-readme-why-sources-diverge`, `ux-why-sources-mismatch`, `ux-layout-test-flaky`, `ux-label-overlap`, `ux-sign-in-label`, `evidence-adr-0021-edited-after-acceptance`, `evidence-ci-output-noise`, `evidence-omnibus-commits`, `evidence-adr-partial-supersession-hidden`, `evidence-undisclosed-cursor`, `evidence-weak-commit-messages`, `evidence-crit10-reflection-thin`, `code-ear-cost-at-cap`, `code-first-request-heap`, `code-clock-offset-latency`, `code-stale-collision-cards`, `spec-vacuous-feed-branch`, `spec-in-process-majority`, `spec-no-real-restart-test`, `spec-busy-sky-accept-gone`, `good-live-record-test-pollution`, `good-concept-overload`, `critic-source-comments-shipped`, `critic-perf-reports-predate-threejs`, `brief-deorbit-unargued`.

