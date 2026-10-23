# Process overview

## What I built

Kessler is a shared sky anyone can launch into. Your satellite carries up to
140 characters, heard by whoever has the sky open as it passes one of three
ground stations. People crowd the low band to be heard more, and crowding
causes collisions: both people's words break into static that takes airtime
from everyone. Nothing resets, and the record keeps who caused what. What's
worth saying, if saying it costs everyone a little?

## The stack

| Choice | Over | Because |
| --- | --- | --- |
| Astro on the server, SQLite via Drizzle, server-sent events (kept from crit 7) | SvelteKit, Phoenix LiveView, WebSockets | Both frameworks were new to me with three days until crit 8, and updates only flow out from the server ([`183d624`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/183d624), ADRs 0001, 0004) |
| Positions worked out from the clock | A simulation ticking every second | Fly stops an idle server; on waking it replays what it slept through, exactly ([`41f32ef`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/41f32ef)) |
| Three.js visuals over flat orbits | The full 3D globe the agent suggested | I wanted a sky, not a diagram; a globe meant rewriting the orbit logic ([`5c41ccd`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/5c41ccd)) |

## The workflow

Sessions start fresh, so memory lives in files: `PLAN.md` holds what's agreed
and next, and each decision is an ADR, superseded rather than edited
([`10c86a5`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/10c86a5)).
For each decision the agent laid out options without recommending one, and I
picked
([`9247b01`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/9247b01)).

Big changes ran overnight in a worktree and came back as a pull request, each
design change a proposed ADR for me to accept
([PR #7](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/pull/7)).
Subagents only review, since assignment 2's parallel drafters contradicted
each other and stalled.

## Corrections that became the harness

CLAUDE.md started from assignments 1 and 2
([`f9497fe`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/f9497fe));
most rules since came from a correction I'd made more than once.

**The layout.** The launchpad and the sky must fit one desktop window, and
agents kept bringing scrolling back: each fix tuned the page to that day's
content, and the next feature undid it
([`69e92a0`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/69e92a0), [`455789e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/455789e), [`67b29a9`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/67b29a9)).
One change even accepted a 75px scroll because the page already scrolled 62px
([`248469e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/248469e)).
Repeating myself wasn't holding, so the rule became a check. I threw the
first attempt away: it hid parts at runtime until the page fit, and put a
Chrome test into `pnpm check` though CI has no Chrome
([PR #6](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/pull/6)).
The rebuild
([PR #8](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/pull/8))
is `pnpm test:layout`: Chrome at three desktop sizes, before and after a
launch, failing on any scroll or off-screen control, so hiding the overflow
can't pass. It failed first, 5 of 12, and CLAUDE.md says to run it after any
change to either page
([`8aa68f3`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/8aa68f3)).
The fix put the altitude bands side by side
([`ade7d43`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/ade7d43));
I thought it looked worse, so they went back to rows with tighter spacing
([`59480dd`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/59480dd)).
The test holds the constraint; whether it looks right is still my call.

**What one session knew and the next didn't.** After an agent killed
another's server, agents only kill servers they started
([`c943797`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/c943797));
after log entries kept missing the hashes this document cites, every entry
gets one
([`a52b08b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/a52b08b)).
I'd moved critical reviews from Sonnet to Opus after stopping a Sonnet review
of the object card, but only one agent's memory held that, so a fresh session
still picked Sonnet
([`e3f9cb5`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/e3f9cb5)).

**Three failures I'd fixed one at a time** until each became a rule
([`c89bcbf`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/c89bcbf)):

- *Tests that couldn't fail.* A review found tests passing with their feature
  broken
  ([`262e2b4`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/262e2b4)),
  then the never-collide test passed with the rule reverted, because it
  compared against the constant
  ([`4e34a4a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/4e34a4a)).
  Now a rule's test must go red with the rule reverted.
- *Numbers that looked right.* Two reviews running, the agent's reasoned
  collision rates were wrong. Balance numbers now come from
  `scripts/balance/`, which runs the real server code over scratch databases
  ([`3469642`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/3469642)).
- *Correct but unreadable.* The object card passed tests and review, but I
  couldn't follow it
  ([`d409ccf`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/d409ccf)),
  as with assignment 2's home page. Reviewers now also read as a first-time
  visitor and flag any sentence that needs the project's context.

## Making the purpose clear

This was where I could direct the agent least: a test can say a page scrolls, not
whether the app means anything. The tutor in crit 8 noted to me that I had incentivised
being seen, but left nothing shared to lose
([`3de1cc6`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/3de1cc6)),
and others playing it noted that it felt like a Kessler syndrome visualiser. The agent's
diagnosis: it gave the project's why but not a visitor's. I accepted three of its proposed ADRs: beacons heard by people
([`e0db217`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/e0db217)),
a wreck that broadcasts both people's words as static
([`fd0a0df`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/fd0a0df)),
and a daily question from the stations
([`248469e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/248469e)).
I rejected aiming a "reply" launch at someone, which makes collisions chosen,
and matching collisions by meaning, which has the server judging text.

A review found parts only for show: an "answering today's question" box
ticked by default linked strangers who never meant to answer, and fake
connections inflated "heard" counts. Both were fixed
([`1472389`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/1472389),
[`262e2b4`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/262e2b4)).
I refused its idea of staging collisions between two people's satellites,
which means the server destroying someone's on purpose
([`72a17dd`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/72a17dd)).

A quiet sky was empty, so invented regulars and passing visitors now launch
like anyone
([`df4014c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/df4014c),
ADR 0021). That is a question of honesty: the review found the Why page still
promised "real people's words", and a first deploy rewrote real people's
history. Both were fixed, and the README says the sky is seeded
([`3469642`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/3469642)).

## Balancing the staged collisions

Most satellites should burn up, but a marker visits for ten minutes, and the
crit 9 review showed that they'd likely see no collision
([`41f32ef`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/41f32ef)).
So when someone watches, the server sends two derelicts at each other
([`2dc518c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/2dc518c)).
Every fix after that pushed one side too far, with tests green throughout:
nothing was broken, it just felt wrong.

| Round | Found | Changed |
| --- | --- | --- |
| My playing | Nothing burned up. Measured first: staged debris sat in the low band, so 3% burned up | Stage below the bands ([`a286df9`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/a286df9)) |
| A context-free agent on a real server | The harm had moved to late in a satellite's life; ~20 collisions an hour ([PR #10](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/pull/10)) | A staged collision keeps to itself |
| Two Opus reviews | Natural collisions killed ~77%; staging every five minutes; wrong numbers; a test that couldn't fail | Half of close pairs never collide; stage every 10–15 minutes ([`4e34a4a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/4e34a4a), ADR 0020) |

Now 57% of a quiet sky's satellites burn up, and 99.5% of newcomers see a
collision within ten minutes
([`d7b89f7`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/d7b89f7)).
Every round's numbers looked right until someone else checked them, and only
playing told me whether it felt right.

## What good means here

Multi-user and real-time had answers a test could check; "good" didn't. Shirky's situated software lets the
group do work the code doesn't, and Ostrom found commons survive when users
can see what each takes, so Kessler does no moderation, only a record of what
each launch cost. Kazemi's small communities hold because their members are
screened friends; Kessler's sky is strangers, so the limits sit in the rules:
a minute between launches, 200 up, nothing reset. Where I part from them is
time: their good is something a group reaches over months, and a visitor
gives Kessler ten minutes. Staging collisions bets that seeing the cost
matters more than a sky left alone. No check could tell me if that bet was
right; only using the app could. The agents did most of the building, but
whether it was good was my judgement.
