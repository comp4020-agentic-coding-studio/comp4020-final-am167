# Process log


## 2026-09-29 — Stack set up (Astro + SQLite/Drizzle + SSE)

`/comp4020:stack` refused (repo deploys to Fly, skill only targets Pages), so the crit 7 stack was wired by hand: Astro 7 server output with the Node standalone adapter, better-sqlite3 + Drizzle (DB at `/data/app.db` in the container, `./data/app.db` locally), an in-process pub/sub and `/api/events` SSE endpoint, `/readme/` rendering README.md with marked, and a multi-stage `node:24-slim` Dockerfile replacing the busybox placeholder. `pnpm check` green against a local build. Docker image build not yet tried (daemon was off). Not committed.

Docker smoke test: first build failed because better-sqlite3 had no prebuilt binary and `node:24-slim` has no Python or compiler, and corepack was pulling pnpm 12. Fixed by installing `python3 make g++` in the build stage and pinning `pnpm@11.9.0`. The image now builds, runs in a 256 MB container with a volume at `/data`, serves `/`, `/readme/` and `/api/events`, opens SQLite on the volume, and `pnpm check` is green against it. Not committed.
