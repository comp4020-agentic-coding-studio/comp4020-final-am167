# Process overview

<!-- Target 900–1100 words total (not a hard limit - just a target);
     rough budget per section in each heading's comment. Items marked
     "Me:" need my own judgement or memory. Every hash is a link a marker can
     follow; keep the link when rewriting the sentence around it. -->

## What I built

Kessler is a shared space anyone can launch into. You send up a satellite
carrying a message of up to 140 characters, and whoever has the sky open hears
it as it passes over one of three ground stations. The low band passes the
stations most often, so that's where people crowd, and crowding is what
causes collisions. A collision breaks both people's words into static that
takes airtime from everyone, and its debris can set off more: Kessler
syndrome. Nothing resets, the sky only heals as debris burns up, and the
record keeps who caused what. It leaves you with one question: what's worth
saying, if saying it costs everyone a little?
([`248469e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/248469e))

## The stack, and the one constraint that shaped it

I kept the stack from crit 7: Astro rendered on the server, SQLite through
Drizzle, and server-sent events for live updates. SvelteKit and Phoenix
LiveView were both new to me with three days until crit 8, and WebSockets
bought nothing when updates only flow out from the server
([`183d624`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/183d624), ADRs 0001 and 0004).

The agent found a serious constraint: Fly shuts the server down when nobody
is visiting, so the app can't run a simulation that ticks forward every
second; while it's asleep, nothing would happen. To work around this, each
satellite keeps its orbit, and where it is at any moment is worked out from
the clock. When the server wakes, it catches up on the burn-ups and
collisions it slept through, replaying them exactly
([`183d624`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/183d624), [`41f32ef`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/41f32ef)).

Three.js came in the crit 9 work. My main motivation for choosing it was so
the sky would look like a sky rather than just a diagram
([`f8f7003`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/f8f7003), [`5c41ccd`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/5c41ccd)). Only the visuals changed: the orbits stay
flat, and I turned down a full 3D globe the agent suggested, since that would
have meant rewriting the orbit logic.

Now having two complex 3D scenes in Three.js, I started to become worried
about performance. I remembered I had a performance testing suite from
assignment 1, so I had the agent bring it over. However, this wasn't a clean
drop-in fix, because it was built for a different kind of site
([`d06ee96`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/d06ee96)). Assignment 1 was a static page served from a folder;
Kessler needs a server and a database, so the harness now starts the built
app itself on a throwaway database. The sky's cost grows with what's in
orbit, so it fills the sky with 150 satellites first. And it measures this
app's own moments: the launchpad idling, a real launch frame by frame, then
the sky zoomed in and out. 

## The workflow

Each session starts fresh, so I decided to keep the whole project's memory in files rather than in
a chat: `PLAN.md` holds what's agreed and what's next, and each decision gets
a record in `doc/adr/` ([`10c86a5`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/10c86a5), [`183d624`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/183d624)). An accepted record is
never edited; a new one supersedes it, so the old reasoning stays visible.
For each decision the agent laid out options and their trade-offs without
recommending one, and I picked, as the week 8 lecture suggested
([`9247b01`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/9247b01)).

Bigger rounds or very large feature changes/implementations ran unattended in its own worktree during the night and came back as a pull request
for me to review in the morning. The overnight round turned seven of my asks
into five commits, with each design change written as a proposed ADR for me
to accept or change ([PR #7](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/pull/7)). 
Running sessions side by side had a cost too: one agent found port 8080 held
by another's server, so now an agent is told to only kill dev servers it started
([`c943797`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/c943797)).

Subagents only do adversarial review, a lesson from assignment 2, where
parallel drafting agents stalled and contradicted each other. For the work I
saw as critical, the object card and the staged collisions, I switched the
reviewer from Sonnet to Opus, now a rule in CLAUDE.md.
<!-- Me: cite the CLAUDE.md commit once it's committed. -->
For the hardest change this week I also had a second agent, with none of the
first one's context, test the pull request against a scratch server. It found
what the first agent's own tests had missed
([PR #10](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/pull/10); more under the staged collisions below).

## Guiding the harness

I started CLAUDE.md from the rules assignments 1 and 2 left me with
([`f9497fe`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/f9497fe)); most of what I added since came from a
correction I'd had to make more than once. The clearest was the layout. The
launchpad and the sky are meant to fit one desktop window, and agents kept
bringing scrolling back. Each fix tuned the
page to that day's content, and the next feature undid it ([`69e92a0`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/69e92a0),
[`455789e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/455789e), [`67b29a9`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/67b29a9)). One change even accepted a 75px scroll
because the page had already scrolled 62px before it ([`248469e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/248469e)). Telling
the agent again wasn't holding, so the rule had to become a check.

The first attempt I threw away. One agent made the pages hide optional parts
at runtime until they fit, put a Chrome test into `pnpm check` even though CI
has no Chrome, and loosened my commit rule in the same pull request. It had
gone off course and made the problem more complicated than it was, so I
abandoned it ([PR #6](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/pull/6)) and had it rebuilt more simply in a new one
([PR #8](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/pull/8)). There, `pnpm test:layout` drives Chrome against the
running app at the marking desktop and two desktop sizes, for a new visitor
and for someone who has just launched, and fails if either page scrolls or
pushes a control off screen, so hiding the overflow can't pass. It stays out
of `pnpm check`, and CLAUDE.md now says to run it after any change to either
page, and to fix the layout rather than hiding the overflow. I left it
failing, 5 of 12, until I was ready to ask for the fix ([`8aa68f3`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/8aa68f3)). The
same commit deleted `AGENTS.md`, which had drifted from CLAUDE.md, so there's
one set of instructions.

The fix passed partly by putting the altitude bands side by side
([`ade7d43`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/ade7d43)). I thought it looked worse, so they went back to rows and the
room came from tighter spacing instead, with the test still green
([`59480dd`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/59480dd)). The test holds the constraint; whether the page looks right
is still my call.

The other lesson was about the tests themselves. A review found tests that
would still pass with their feature broken ([`262e2b4`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/262e2b4)), and later a test
for the never-collide rule passed with the rule reverted, because it compared
the result against the constant rather than a fixed expectation. It now
checks a fixed band ([`4e34a4a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/4e34a4a)).

## Making the purpose clear

<!-- ~200 words. Main thing this week #1. Not something a test can
     check, so: what I noticed, what the agent proposed, what I chose. -->

- At crit 8 the mechanic was the argument (launching to be seen fills the sky),
  but people didn't know what Kessler syndrome meant, so the name and the
  argument didn't land. Built `/kessler/`; its reviewer caught overclaims and
  stretched sources ("it has already started", Kessler 1978 misquoted)
  ([`356e469`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/356e469)).
- The app had an incentive (be seen) but no goal and nothing shared to lose.
  I also wanted colliding messages to mean something (the crit 8 marker
  raised it too). Parked both in the plan rather than building straight away
  ([`3de1cc6`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/3de1cc6),
  [`028d2f5`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/028d2f5)).
- Asked what an object's history is *for* before building it: "the sky
  remembers" (Ostrom: a commons survives when users can see what each takes),
  so it tells what followed as well as where it came from
  ([`93f8735`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/93f8735), ADR 0012).
- After playing it, my worry: it felt less like a thought-provoking social
  thing and more like a web app visualising Kessler syndrome. The agent's
  diagnosis: the why has two halves, for a visitor and for the project, and
  the app only ever said the second. Three answers, each an ADR for me to
  accept:
  - beacons heard by people, counted
    ([`e0db217`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/e0db217))
  - the wreck keeps both people's words and broadcasts them as static
    ([`fd0a0df`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/fd0a0df))
  - a question from the stations each day, and a Why page
    ([`248469e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/248469e))
  - Rejected: aiming a "reply" launch at someone (makes collisions chosen,
    which breaks the argument) and matching collisions by meaning (the server
    judging text).
- The review found the purpose was partly faked. "Heard by" could be inflated
  with five curl streams; a default-ticked box tagged "Second launch, mid
  band." as an answer and manufactured "both were answering" connections; the
  Why page promised things the code didn't do
  ([`f262b7e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/f262b7e) →
  [`1472389`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/1472389),
  [`262e2b4`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/262e2b4)).
  Most collisions involved silent derelicts, so the wreck rarely kept anyone's
  words; derelicts now carry a gone satellite's last words. Refused: staging
  collisions between two people's satellites on purpose
  ([`72a17dd`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/72a17dd)).
- Two pages arguing the same thing: chose to trim `/kessler/` to the physics
  and leave the argument to Why, with a test that it stays that way
  ([`a3a6af2`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/a3a6af2)).
- The object card: "very hard to read … detracts from the whole purpose". It
  told a collision that never happened (a cascade's roots flattened into one),
  the same lineage three ways, jargon left bare. Retold as one line, chips and
  a timeline, with an Opus reviewer
  ([`d409ccf`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/d409ccf)).
  Me: this came from my own reading, not a test or a reviewer. Same lesson as
  assignment 2's "slop" home page?
- Me: the README is next, in my own words. Say where the purpose stands now.

## Balancing the staged collisions

<!-- ~200 words. Main thing this week #2. Tests green throughout (328 → 345);
     the evidence was measurement, and each round's measurement got checked. -->

- The tension: in a quiet sky collisions are rare (I chose the gentler tuning,
  1–5 an hour), but a marker visits for ten minutes. The C9 review said a
  marker would likely see none
  ([`41f32ef`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/41f32ef)).
  Fix: when someone is watching, the server sends two derelicts at each other
  over a station
  ([`2dc518c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/2dc518c)).
- Playing it on 9 Oct: collisions felt too frequent and forced, and satellites
  never burned up. Asked for a measurement before any change. A Monte Carlo
  over the real orbit code found the staged collision's debris sat in the low
  band's middle: 3% of low satellites burned up, against 54% without staging.
  Of four levers I chose staging under the bands: 56%
  ([`a286df9`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/a286df9), ADR 0019).

That fix ([`a286df9`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/a286df9)) passed all 328 tests, and its own
simulation said low satellites now burned up 56% of the time. I had a second
agent, with none of the first one's context, test
[PR #10](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/pull/10) against a scratch server. It went well past re-running
the checks. It undid each part of the change in turn, to make sure the new
tests failed without it. It drove the real server code through eight hours of
sky at a time on throwaway databases, shuffling the ids so each run drew
different collisions. And it watched a fresh sky in Chrome for forty minutes,
where it caught a collision the sky had announced never happening: one of the
pair was hit six seconds early by debris from the collision before.

Its report showed the fix had only moved the harm. The first agent's
simulation only put staged collisions before a satellite's launch, but
staging carries on as long as anyone is watching, and the debris now sat
exactly where every low satellite falls on its way to burning up. A satellite
watched through its last 40 minutes burned up 4 times in 60, against 19 in 60
with no staging: the fix had moved the kill from the start of a satellite's
life to its end. A watcher also saw about 20 collisions an hour, most of them
knock-ons between pieces of staged debris, the opposite of the less forced sky
I'd asked for. The report ended with a judgement as well as numbers: which
lever to pull next, and which one would backfire.

The report wasn't taken on faith either. Before changing anything, the first
agent rebuilt the tester's harness and reproduced its numbers, then fixed it
with one rule: a staged collision keeps to itself. Watched satellites went
from 0 of 80 burning up to 34, and none were lost to staged debris
([`4e34a4a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/4e34a4a)). The lever the tester pointed to next, letting a close pair
never collide, is the one I chose later (ADR 0020).

- An Opus review said my complaint was only partly fixed: natural collisions
  still killed about 77% of satellites in a quiet sky, staging ran like a
  metronome every 5:00, and burn-ups barely made the sky's news line. It left
  the levers to me. I picked two: a close pair may never collide, and a
  burn-up told before a collision that took nobody's satellite (ADR 0020).
- A second Opus review found the agent's own baseline was wrong (it claimed
  69 of 70 burn-ups went untold; really 27%), edge cases in the news line,
  and a new test that passed with the rule reverted. My second round: a close
  pair collides at all half the time, and staging every random 10–15
  minutes, or 5 for someone who has just arrived, so a marker still sees one
  ([`4e34a4a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/4e34a4a)).
- Result: burn-ups in a quiet sky 17% → 58%, at a crit 7% → 33%; 99% of
  newcomers still see a collision in their first ten minutes. Then someone
  coming back is told theirs burned up
  ([`d85c1db`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/d85c1db)).
- Me: the lesson (A1's scroll resistance again? green tests, wrong feel), and
  what's still open: the news line is mostly staged collisions.

## What good means at this scale

<!-- ~80 words. The brief asks for my position on the "good" readings here,
     not just a citation in the README. notes/reading.md has summaries. -->

- Shirky, "Situated Software": visibility doing the work enforcement would,
  like the blame and history that name who caused what (ADRs 0010, 0012),
  with no moderation or voting.
- Kazemi, *Run Your Own Social*: limits make small spaces work (the 200
  satellite cap). Tension: his are screened friends; Kessler's sky is
  strangers, so the rules are the boundary, not the people.
- Sloan and Appleton (home-cooked software): more contrast than support.
- Me: which of these I've actually read, and my position.
