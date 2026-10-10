# Process overview

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

This was the hardest part of the project, and the part where I could direct
the agent least. A test can tell me a page scrolls; nothing can tell me
whether the app means anything. The agent could propose and review, but
whether Kessler said what I wanted it to say came down to my own judgement,
from playing it.

At crit 8 the mechanic was the argument: launching to be seen fills the sky.
But people didn't know what Kessler syndrome was, so neither the name nor the
argument landed. I had the agent build a `/kessler/` page which explained what it was to a new user
([`356e469`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/356e469)).
The app also had an incentive, being seen, but no goal and nothing shared to
lose, and I wanted colliding messages to mean something, which the crit 8
marker raised too. I parked both in the plan rather than building straight
away
([`3de1cc6`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/3de1cc6),
[`028d2f5`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/028d2f5)).
Every object in the sky was going to get a history, and before building it I
asked what that was *for*. The answer: so people can see what each launch
cost everyone else. That's why an object's history shows what it went on to
cause, not just where it came from
([`93f8735`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/93f8735), ADR 0012).

When I actually played with it, I noted that it felt less like a thought provoking social thing and more
like a web app visualising Kessler syndrome. The agent's diagnosis was that
the why has two halves, one for a visitor and one for the project, and the
app only ever said the second. It proposed three answers, each an ADR for me
to accept: beacons counted as heard by people
([`e0db217`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/e0db217)),
a wreck that keeps both people's words and broadcasts them as static
([`fd0a0df`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/fd0a0df)),
and a daily question from the stations with a Why page
([`248469e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/248469e)).
I rejected aiming a "reply" launch at someone, which makes collisions chosen
and breaks the argument, and matching collisions by meaning, which has the
server judging text.

An adversarial review agent then found that parts of the purpose were only
for show. Anyone could inflate how many people had "heard" a satellite by
opening a few fake connections. The box marking a launch as an answer to the
day's question was ticked by default, so ordinary things counted as answers, and the app linked people as "both answering"
when neither meant to. And the Why page promised things the app didn't do.
All three were fixed
([`f262b7e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/f262b7e) →
[`1472389`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/1472389),
[`262e2b4`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/262e2b4)).

The adversarial review also found that most collisions hit derelicts, dead satellites with no
message, so a wreck rarely kept anyone's words. Derelicts now carry the last
words of a satellite that has gone. The reviewer suggested staging collisions
between two people's satellites instead; I refused, since that would mean the
server destroying someone's satellite on purpose
([`72a17dd`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/72a17dd)).


The object card, the panel that opens when you click something in the sky,
shows the limit of what I could hand off. It passed its tests, but when I read
it, it was hard to understand what was going on, and that undermined the whole
purpose. No test or reviewer picked this up; I only noticed by using it
myself. I had it rewritten to tell an object's story simply, then reviewed by
Opus
([`d409ccf`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/d409ccf)).

It was the same lesson as assignment 2, where a reviewer checked every number
on my home page and approved it, and I still had to call it slop because it
was hard to follow. Tests and reviewers can check that something is correct;
only I could tell whether it made sense.

<!-- TODO: the README is next, in my own words: say where the purpose stands
     now. -->

## Balancing the staged collisions

This was the second hardest part, and the one I went round the most times.
Two things pulled against each other. In a quiet sky collisions should be
rare, and most satellites should live long enough to burn up. But a marker
visits for about ten minutes, and the crit 9 review said they would likely
see no collision at all
([`41f32ef`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/41f32ef)).
So when someone is watching, the server sends two derelicts at each other
over a station
([`2dc518c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/2dc518c)).
Every fix after that pushed one side too far. The tests stayed green the
whole time, because nothing was broken; it just felt wrong.

During my own observation/testing of the website, I noticed that collisions felt too frequent and forced, and
satellites never burned up. I asked for a measurement before any change. A
simulation found the staged collision's debris sat in the middle of the low
band, so only 3% of low satellites burned up, against 54% with no staging. I
chose to stage collisions below the bands instead, and the agent's
simulation said 56% would now burn up
([`a286df9`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/a286df9)).

That didn't hold up. A second agent, with none of the first one's context,
tested the pull request against a real server
([PR #10](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/pull/10)).
The fix had only moved the harm from the start of a satellite's life to its
end, and a watcher now saw about 20 collisions an hour. The first agent
reproduced this before fixing it: a staged collision now keeps to itself.

An Opus review then said my complaint was still only partly fixed: natural
collisions killed about 77% of satellites in a quiet sky, and staged events ran
repeatedly every five minutes. It left the choice to me. Over two
rounds I chose to let half of all close pairs never collide, to stage at
random every 10–15 minutes (5 for someone who has just arrived), and to show
burn-ups in the sky's news (ADR 0020). The second review also caught the
agent's own numbers being wrong again, and a test that passed with the rule
removed
([`4e34a4a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/4e34a4a)).
In a quiet sky, burn-ups went from 17% to 58%, and 99% of newcomers still see
a collision in their first ten minutes. Someone coming back is now told when
theirs burned up
([`d85c1db`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/d85c1db)).

Every round's numbers looked right until someone else checked them, and only
playing it told me whether it felt right. It still isn't finished: the sky's
news is mostly staged collisions.

## What good means at this scale

<!-- ~80 words. The brief asks for my position on the "good" readings here,
     not just a citation in the README. notes/reading.md has summaries. -->

<!-- TODO -->

## Closing

The multi-user, real-time part of the spec was the easy part to meet. The
server, the live updates and the replay each had a clear answer, and a test
could say whether they worked. The "good" part had no such test. No check,
reviewer or rule in the harness could tell me whether Kessler made people
think, whether the object card made sense, or whether the sky felt fair. Each
time, the tests were green and something was still wrong, and the only way I
found it was by using the app myself. The agents did most of the building,
but whether it was good came down to my own judgement.
