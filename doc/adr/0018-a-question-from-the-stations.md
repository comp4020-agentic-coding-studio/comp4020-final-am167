# 0018. The stations ask a question each day, and the app says what it's for

**Status:** proposed (2026-10-07). Settles `PLAN.md`'s "A purpose" (2026-10-06),
with ADRs 0016 and 0017.

## Context

`PLAN.md`'s "A purpose" (2026-10-06): launching "to be seen" was the
incentive, but there was no goal to chase and nothing shared to lose. Three
ideas were noted, meant to work together, and Advay liked all three:

1. **Be heard, and count it**: a "heard by" count. Built as ADR 0016.
2. **Airtime is the scarce thing, and debris eats it.** Built as ADR 0017:
   fragments carry words and play as static, taking turns at the stations.
3. **The station asks a question.** One a day; beacons may answer it.

On 2026-10-07 Advay asked for the purpose, the "why", to be fleshed out a
lot more: the app had come to feel like a visualisation of Kessler
syndrome rather than a thought-provoking social thing.

The why has two halves, and the app only said the second. **For a
visitor:** why launch, why stay, why come back. **For the project:** the
argument the mechanics make. The launchpad's intro and the Kessler page
explain the physics and the commons, but nothing tells a stranger what
they're there to do, besides "launch".

## Options

**A reason to launch.**

- **Nothing more**: "say something". A blank box asks a stranger to be
  interesting on the spot; most write a test or a slogan.
- **A question a day from the stations**, which beacons can answer or
  ignore. A prompt to write to, a topic shared by everyone launching that
  day, and two answers that collide already have a connection (ADR 0017
  gives the causal one; this gives a thematic one, without the server
  judging any text).
- **A question each person chooses or proposes**: voting on prompts is the
  governance the design direction rules out (`PLAN.md`, "Design
  direction").

**Who writes the questions.** A fixed list in the code, rotating daily, to
start; Advay edits it. Not visitors (moderation), not generated.

**Where the why is said.** On the launchpad, in a few lines, where a
stranger decides whether to launch; at length on a page of its own; and
in the explainer after a first launch.

## Decision

**The stations ask one question a day; a beacon can answer it; the app
says what it's for on the launchpad, on a page of its own, and after a
first launch.**

- **The question.** A fixed list (`src/lib/questions.ts`), one a day, the
  day turning at midnight UTC (10 or 11 in the morning in Canberra). The
  launchpad shows today's above the beacon, with "My beacon answers it"
  ticked; untick it to say anything else. The form carries which day's
  question it showed, so a launch just after midnight still answers the
  one it was written to (today's or yesterday's; anything older is taken
  as answering nothing). A satellite keeps the question it answered
  (`objects.question`, the text, so editing the list never rewrites the
  record).
- **Shown with the answer.** The feed, a history and Yours say what a
  beacon was answering. The sky's beacons column shows today's question,
  with a way to answer it.
- **Two answers that collide** are told as such: "Both were answering:
  …", before what the wreck says.
- **What it's for, said plainly** (the full text is the Why page, `/why/`;
  the launchpad says it in four lines):
  - *For a visitor:* say one thing to the people who are here, and be
    heard by them, counted; listen, since your being here is someone
    else's audience; answer the day's question, and hear how strangers
    answered it; and decide what your words cost, since every launch
    crowds a sky everyone shares, and a crash breaks your words into a
    stranger's and leaves them as noise everyone hears around.
  - *For the project:* attention is a commons. Every post is free to make
    and costs everyone a little of a shared, finite thing; nobody pays for
    that directly, so it's overused (Hardin). Kessler makes the cost
    physical: words take up orbit, crowding makes collisions, collisions
    turn words into noise. There are no rules to vote on and nobody
    moderates; what keeps the sky usable is what each person can see (who
    launched what, what it cost) and what they choose to do with their own
    satellites (Ostrom).
  - The question it leaves each visitor with: what's worth saying, if
    saying it costs everyone a little?

## Consequences

- A stranger has something to write to, and a reason to come back
  tomorrow (a new question). The catalogue becomes, over time, an archive
  of strangers' answers.
- Some will ignore the question; that's allowed, and nothing ranks
  answers over other lines.
- A question in the code is a deploy to change; fine for a fixed list
  Advay curates. If the list is edited, the record keeps what was asked.
- The why is said in three places, which can drift; the Why page is the
  long version, and the other two point to it.
- Testable over HTTP: the launchpad shows today's question with the box
  ticked; a launch answering it keeps the question (its history says so),
  one with the box unticked doesn't, and one carrying a week-old day
  answers nothing; the Why page is linked from the launchpad. On the
  server: a collision of two answers to the same question says so.
