# COMP4020 final project

Your repo for the COMP4020 final project: a multi-user, real-time website that
persists, deploying to Fly.io. The deployed app is what gets marked, not this
repo.

Stack (same as crit 7): a server-rendered Astro app, SQLite via Drizzle, SSE for
live updates. Not installed yet; `/comp4020:stack` sets up the Astro default.

Read the
[final project spec](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/assessments/final-project/)
before you plan or build. The
[course website](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/)
has the rest.

## The plan

The app is **Kessler** (working title): a shared orbit where people launch
satellites to be seen and collisions cascade into debris. `PLAN.md` holds the
agreed decisions, status, next steps and open questions; read it, then
`notes/log.md`, before planning or building. Update its status section when a
step is done or a decision changes.

Decisions live in `doc/adr/`, one numbered file each (Nygard format: status,
context, options, decision, consequences). Read them before changing the
stack, storage or data model. An accepted record is never edited; to change
one, write a new record that supersedes it.

## The checks

`pnpm check` (typecheck + the spec suite) is what CI runs before it deploys.
`pnpm check:evidence` is the extra gate before you ship; CI only runs it once
the repo is public, so run it yourself first.

The spec suite checks a **running** app over HTTP at `APP_URL` (default
`http://localhost:8080`) and starts nothing itself. One file,
`spec/fit.test.ts`, also drives Chrome against it (installed stable Chrome,
or `CHROME_PATH`). Rebuild and restart the app
after a change before running it, or you're testing stale output. CI builds the
Dockerfile image and points the suite at that.

`spec/README.md`, `PROCESS.md` and `reflections/README.md` say what they are
for.

## How to work in here

- Keep the app running locally while working, and kill any dev or preview
  servers you started when you're done. Read the port from the server's own
  output and confirm with `lsof -nP -iTCP:<port> -sTCP:LISTEN`, since a
  "stopped" server can still hold its port.
- Keep `spec/invariants.test.ts` green; don't delete it.
- **Never commit without my approval.** Get the checks green, then show me what
  changed and wait for me to say commit. Green checks aren't the go-ahead, a red
  state is never committed, and approval is per-commit.
- **Never suggest, ask about, or perform publishing/deploying** (flipping the
  repo public, `flyctl deploy`, pushing to `main` once public) unless I
  explicitly say so.
- Work directly on `main`; avoid git worktrees unless an automated session's
  tooling requires one.
- Don't spawn subagents except for adversarial review; they stall. Do
  independent pieces one after another, then `pnpm check` once at the end. For
  review subagents use only Sonnet (or Luna in Codex, `gpt-5.6-luna`), in its
  largest-context variant.

### Visual verification

- Use the `agent-browser` CLI (`agent-browser skills get core`), not a browser
  MCP plugin. The rendered page is the truth, not your mental model of it.
- After a major change (new page, content rewrite, layout or CSS change), check
  it once in Chrome at the two marked viewports (desktop 1920x1080 and a mobile
  screen, e.g. `set device "iPhone 14"`) when the whole task is done, against a
  fresh build served over HTTP, not `file://`. Skip this for minor fixes.
- Set viewports with `agent-browser set viewport <w> <h>` (or `set device`),
  not by resizing the window, and assert `window.innerWidth`/`innerHeight`
  match before trusting a measurement.
- Keyboard-only, mid-interaction resize and slow-connection testing: only when
  I ask.

## Tests

- **TDD for significant, testable changes** (a feature, behavioural change,
  non-trivial state mapping, algorithm, risky refactor): add or adjust the
  smallest focused test for the intended contract, confirm it fails for the
  expected reason, then implement. Prefer extending the nearest existing test
  file.
- No test for every minor fix. Copy edits, style tweaks and mechanical cleanup
  use the existing checks; add regression coverage only for a distinct,
  plausible failure that could recur.
- **The launchpad and the sky are one screen on a laptop or desktop: no
  page scroll, in any state, and what matters wholly on it.**
  `spec/fit.test.ts` enforces it in `pnpm check`: real Chrome, ten browser
  windows from 1920×1080 down to 1280×640 and 900×700 (including 1512×757
  and 1366×657), with a satellite of your own just launched and the longest
  lines either page writes, checking the Launch button, the beacons, your
  line and buttons, the news and the links are on screen. Each page sheds
  optional parts in a fixed order while it would scroll (`data-fit` steps in
  its CSS, taken by `src/scripts/fit.ts`). Anything you add to either page
  (a line, a notice, a button) gets a place in that order or in a step,
  never a `max-height` media query tuned to today's content (that's how it
  regressed three times); anything that can grow gets a bounded longest
  form, which goes into the test's `fill`; anything essential goes into
  its `essentials`. Phones may scroll; they aren't checked.
- Turning the published spec into tests is your work: add your own
  `spec/*.test.ts` alongside the supplied one, and test the contract (what the
  page must do), not the implementation.

## Process logging

**`notes/log.md` is the raw material `PROCESS.md` is built from later**, so
what isn't logged as we go is lost to the write-up. After each meaningful chunk
of work (a feature, a fix, a design decision, a review and what it found),
append a short entry saying what was done and why, with the commit hash once
there is one. Do it as we go, not reconstructed at the end. Log generously;
`PROCESS.md` is the write-up.

**Screenshots in the log are the exception, not the default.** Add one only
when it is necessary evidence you'd want to cite in `PROCESS.md`: a bug found
or fixed, a before/after of a real design change, or a UX decision the text
can't convey. Routine verification passes, unchanged pages and "it looks fine"
checks get a line of text, not an image. Aim for a handful across the whole
project, not one per entry. When you do keep one, save it under
`notes/screenshots/` with a descriptive, dated name (e.g.
`2026-09-29-board-mobile-overflow.png`), embed it in the entry with a caption
saying what it shows and why it matters (`![caption](screenshots/<file>.png)`),
and commit it with that entry. If unsure, don't add it.

## Adversarial review

`pnpm check` only catches what's mechanical. For significant work the checks
can't judge (a new feature, a UX decision, the app's account of itself in
`README.md`), spawn a fresh reviewer agent that doesn't share the drafting
agent's context, and tell it to be adversarial, not encouraging. Have it attack
the work against the published spec: missed requirements, thin or confusing UX,
`README.md` claims the app doesn't keep, untried edge cases. Act on its
findings; re-review only if the revision was substantial. Skip this for small
fixes. Keep a trail (what was reviewed, what it found, what changed) so
`PROCESS.md` can cite commit hashes.

## Pristine output

Output from any command (`pnpm check`, `pnpm build`, `pnpm dev`, tests,
typecheck) must have zero failures, errors, warnings and stack traces. Fix a
warning or find out why it's there before moving on. Routine informational
output isn't a warning.
