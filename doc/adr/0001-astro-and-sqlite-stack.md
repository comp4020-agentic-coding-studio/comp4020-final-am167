# 0001. Astro and SQLite as the stack

**Status:** accepted (2026-10-03)

## Context

Kessler (see `PLAN.md`) is one shared sky that people launch satellites into.
The brief fixes three things: several people change shared state, a change
reaches every open session within about a second, and the data survives
restarts and redeploys. The course fixes the hosting: one `shared-cpu-1x`
Fly machine with 256 MB, one volume at `/data`, and the machine stops when
idle and starts on the next request.

What the app needs from a stack:

- **The server runs the physics.** Collision checks and decay happen in one
  place, in one long-running process.
- **Every action needs a non-canvas path** (forms, a catalogue table) for the
  keyboard pass, so server-rendered HTML is worth having.
- **A way to push events to every open page.** How is decided in ADR 0004;
  the stack has to allow a long-lived HTTP response.
- **C8 is three days away.** I used Astro, Drizzle, SQLite and SSE in crit 7,
  so I can read and debug what the agent writes.

## Options

**Framework**

- **Astro on Node (server-rendered).** The course default, and what I used in
  crit 7. Pages and forms work without JavaScript; the chart is one client
  script. No real-time built in, so the event stream is ours to write.
- **SvelteKit.** Better client reactivity for a live chart. New to me, off the
  course default, and CLAUDE.md would need rewriting.
- **Phoenix LiveView.** Real-time and server-held state built in, which suits a
  server-run simulation. A new language, weaker agent output, and the canvas
  still needs JavaScript hooks.

**Storage**

- **SQLite on the volume, through Drizzle.** One file on `/data`, no separate
  server, schema and migrations in the repo.
- **A managed Postgres** or another database app: outside the course setup.

## Decision

- **Astro**, server-rendered with the `@astrojs/node` standalone adapter.
- **SQLite** (`better-sqlite3`) at `/data`, with **Drizzle** for the schema and
  migrations.
- Migrations run when the server boots, not as a Fly `release_command`, which
  runs on a temporary machine without the volume.
- Real-time over server-sent events, decided in ADR 0004.

## Consequences

- One Node process holds everything (pages, the event stream, the simulation),
  which is fine because the course allows exactly one machine.
- Astro gives no real-time help: the event stream, reconnects and catching up
  are ours to write (ADR 0004).
- The simulation runs only while the machine is up, and Fly stops idle
  machines. What that means for persistence is in ADR 0003.
- The server keeps every live object in memory to check collisions, so 256 MB
  caps the sky's size; object count needs a ceiling (open question in
  `PLAN.md`).
- If the app outgrows this, the change is a new record superseding this one.
