# Process overview

## Building the plan

After a long back and forth with the agent over ideas, I settled on visualising Kessler syndrome.
From there I instructed the agent to develop a plan in `PLAN.md` to decide on the specific design decisions
([`10c86a5`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/10c86a5)):
why people launch (a short beacon line shown when their satellite passes
overhead), how it ends (it doesn't; the sky slowly heals through decay), and
what owners can do (deorbit their own satellite). I went
through the open questions with the agent one at a time, with the agent giving options and
me picking what I felt was best
([`9247b01`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/9247b01)).
Some ideas were mine, like making the landing page a launchpad that pans up
into orbit. I decided not to plan everything out fully. The further refinements and new features
I decided to push to crit 9 to come back to later.

## Picking the stack

For each big question (what counts as a person, what persists, how changes
reach everyone, the stack), the agent gave me options with trade offs.
I decided to continue with the crit 7 stack (Astro, SQLite via Drizzle, SSE) since it
seemed to work fine with the current plan. Each choice is written up in `doc/adr/`
([`183d624`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/183d624)).

## The first slice

Once I was happy with the core idea, I instructed the agent to develop it: launching a satellite,
the shared sky, and launches showing up live for everyone else
([`4be85b1`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-am167/commit/4be85b1)).
I currently have just the barebones idea, with lots of refinements and new features planned.
The sky is a plain 2D chart for now, and I noted to the agent that I would like to use Three.js
down the track as the way to make it visually striking later.
