# Process overview

## What I built

Kessler is a shared sky anyone can launch into. Your satellite carries up to
140 characters, heard by whoever has the sky open as it passes one of three
ground stations. The low band passes most often, so people crowd there, and
crowding causes collisions: both people's words break into static that takes
airtime from everyone, and the debris can set off more (Kessler syndrome).
Nothing resets, and the record keeps who caused what. It asks: what's worth
saying, if saying it costs everyone a little?
([`248469e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/248469e))

## The stack

| Choice | Over | Because |
| --- | --- | --- |
| Astro on the server, SQLite via Drizzle, server-sent events (kept from crit 7) | SvelteKit, Phoenix LiveView, WebSockets | Both frameworks were new to me with three days until crit 8, and updates only flow out from the server ([`183d624`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/183d624), ADRs 0001, 0004) |
| Each satellite keeps its orbit; where it is gets worked out from the clock | A simulation ticking every second | The agent found that Fly shuts the server down when nobody is visiting, so a ticking sky would stop. On waking, the server replays the burn-ups and collisions it slept through, exactly ([`183d624`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/183d624), [`41f32ef`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/41f32ef)) |
| Three.js visuals over flat orbits (crit 9) | The full 3D globe the agent suggested | I wanted a sky, not a diagram; a globe meant rewriting the orbit logic ([`f8f7003`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/f8f7003), [`5c41ccd`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/5c41ccd)) |
| Assignment 1's performance harness, adapted | Hoping two 3D scenes stay fast | Built for a static folder; it now starts the built app on a throwaway database, fills the sky with 150 satellites, and measures idling, a launch and zooming ([`d06ee96`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/d06ee96)) |

## The workflow

Each session starts fresh, so the project's memory lives in files: `PLAN.md`
holds what's agreed and next, and each decision is an ADR that is never
edited, only superseded ([`10c86a5`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/10c86a5), [`183d624`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/183d624)).
For each decision the agent laid out options and trade-offs without
recommending one, and I picked, as the week 8 lecture suggested
([`9247b01`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/9247b01)).

Big changes ran unattended overnight in a worktree and came back as a pull
request for the morning: one turned seven asks into five commits, each design
change a proposed ADR for me to accept
([PR #7](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/pull/7)).
When one agent found port 8080 held by another's server, agents were told to
only kill servers they started
([`c943797`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/c943797)).

Subagents only do adversarial review, since assignment 2's parallel drafting
agents stalled and contradicted each other. After the object
card and the staged collisions, reviewers run on Opus rather than Sonnet
([`e3f9cb5`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/e3f9cb5)).
For the hardest change, a second agent with none of the first's context
tested the pull request against a scratch server and found what the first's
tests had missed
([PR #10](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/pull/10)).

## Corrections that became the harness

CLAUDE.md started from assignments 1 and 2
([`f9497fe`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/f9497fe));
most additions since came from a correction I'd made more than once.

**The layout.** The launchpad and the sky must fit one desktop window, and
agents kept bringing scrolling back: each fix tuned the page to that day's
content, and the next feature undid it
([`69e92a0`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/69e92a0), [`455789e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/455789e), [`67b29a9`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/67b29a9)).
One change even accepted a 75px scroll because the page already scrolled 62px
([`248469e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/248469e)).
Repeating myself wasn't holding, so the rule became a check. I threw the
first attempt away: it hid parts at runtime until the page fit, put a Chrome
test into `pnpm check` though CI has no Chrome, and loosened my commit rule
([PR #6](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/pull/6)).
The simpler rebuild
([PR #8](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/pull/8))
is `pnpm test:layout`: Chrome at three desktop sizes, for a new visitor and
someone who has just launched, failing on any scroll or off-screen control, so
hiding the overflow can't pass. CLAUDE.md says to run it after any change to
either page. I left it failing, 5 of 12, until I was ready for the fix, and
deleted the drifted `AGENTS.md`
([`8aa68f3`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/8aa68f3)).
The fix put the altitude bands side by side
([`ade7d43`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/ade7d43));
I thought it looked worse, so they went back to rows with tighter spacing
([`59480dd`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/59480dd)).
The test holds the constraint; whether it looks right is still my call.

**Tests that couldn't fail.** A review found tests passing with their feature
broken
([`262e2b4`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/262e2b4)),
and later the never-collide test passed with the rule reverted, because it
compared against the constant rather than a fixed band. It now checks a fixed
band
([`4e34a4a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/4e34a4a)).

## Making the purpose clear

The hardest part, and where I could direct the agent least: a test can say a
page scrolls, not whether the app means anything.

At crit 8 people didn't know what Kessler syndrome was, so the argument
didn't land; a `/kessler/` page now explains it
([`356e469`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/356e469)).
The app had an incentive, being seen, but nothing shared to lose, and
collisions meant nothing, as the crit 8 marker noted; I parked both in the
plan rather than building straight away
([`3de1cc6`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/3de1cc6), [`028d2f5`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/028d2f5)).
Before giving objects a history, I asked what it was *for*. The answer,
showing what each launch cost everyone else, is why a history shows what an
object went on to cause
([`93f8735`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/93f8735), ADR 0012).

Playing it, it felt less like a thought-provoking social thing and more like a Kessler
syndrome visualiser. The agent's diagnosis: the app gave the project's why but
not a visitor's. I accepted three of its proposed ADRs: beacons counted as heard by people
([`e0db217`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/e0db217)),
a wreck that broadcasts both people's words as static
([`fd0a0df`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/fd0a0df)),
and a daily question from the stations with a Why page
([`248469e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/248469e)).
I rejected aiming a "reply" launch at someone, which makes collisions chosen,
and matching collisions by meaning, which has the server judging text.

An adversarial review found parts were only for show: fake connections could
inflate "heard" counts, an "answering today's question" box ticked by default
linked people as "both answering" when neither meant to, and the Why page
promised things the app didn't do. All three were fixed
([`f262b7e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/f262b7e) →
[`1472389`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/1472389),
[`262e2b4`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/262e2b4)).
Most collisions hit silent derelicts, so wrecks rarely kept anyone's words;
derelicts now carry the last words of a satellite that has gone. I refused the
reviewer's idea of staging collisions between two people's satellites, which
means the server destroying someone's on purpose
([`72a17dd`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/72a17dd)).

The object card, the panel for anything clicked in the sky, showed the limit
of what I could hand off. It passed tests and review, but reading it I
couldn't follow it. I had it rewritten to tell an object's story simply, then
reviewed by Opus
([`d409ccf`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/d409ccf)).
Assignment 2 again: a reviewer approved every number on my home page, and I
still had to call it slop.

## Balancing the staged collisions

The part I went round most. A quiet sky should rarely collide and most
satellites should burn up, but a marker visits for about ten minutes, and the
crit 9 review said they'd likely see no collision
([`41f32ef`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/41f32ef)).
So when someone watches, the server sends two derelicts at each other
([`2dc518c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/2dc518c)).
Every fix after that pushed one side too far, with tests green throughout:
nothing was broken, it just felt wrong.

| Round | Found | Changed |
| --- | --- | --- |
| My playing | Collisions felt forced and nothing burned up. I asked for a measurement first: staged debris sat mid low band, so 3% of low satellites burned up (54% unstaged) | Stage below the bands; simulated: 56% ([`a286df9`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/a286df9)) |
| Context-free agent on a real server | The harm had only moved to the end of a satellite's life; a watcher saw ~20 collisions an hour ([PR #10](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/pull/10)) | Reproduced first, then a staged collision keeps to itself |
| Opus review | Natural collisions killed ~77% in a quiet sky; staging fired every five minutes. It left the choice to me | Half of close pairs never collide; stage randomly every 10–15 minutes (5 for newcomers); burn-ups in the news (ADR 0020) |
| Second Opus review | The agent's numbers were wrong again, and a test passed with the rule removed | Fixed both ([`4e34a4a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/4e34a4a)) |

Quiet-sky burn-ups went from 17% to 58%, 99% of newcomers still see a
collision in their first ten minutes, and someone coming back is told when
theirs burned up
([`d85c1db`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/d85c1db)).
Every round's numbers looked right until someone else checked them, and only
playing told me whether it felt right. It isn't finished: the news is still
mostly staged collisions.

## Logging who did what

At crit 10 I narrate two people using the app from its server logs alone. My
plan had the logging as counts to settle design questions, but the spec asks
who did what, so it changed before anything was built
([`f0dc97e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/f0dc97e)).
The tests passed, yet a review found anyone could claim the handle `anon`
and pass as an anonymous visitor, and a passphrase typed into the handle box
was logged; both were fixed
([`eca1ae7`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/eca1ae7)).

## Closing

Multi-user and real-time were the easy part: each had a clear answer a test
could check. "Good" had no such test. No check, reviewer or rule could tell me
whether Kessler made people think, the object card made sense, or the sky felt
fair; each time the tests were green and something was still wrong, and I only
found it by using the app. The agents did most of the building, but whether it
was good came down to my own judgement.
