# 0004. Server-sent events, and the server's clock as the only clock

**Status:** accepted (2026-10-03)

## Context

The brief requires a change to reach every other open session within about a
second, with no reload, and the choice of transport to be justified.

What travels in Kessler:

- **The sky is predictable.** A satellite's position is a pure function of its
  orbit and the time, so positions never need to be sent; only events do:
  launch, deorbit, collision, decay, and later conjunction alerts.
- **Actions are rare.** A person launches, maybe dodges, maybe deorbits. Almost
  all traffic is the server telling clients what happened.
- **Everyone must see the same sky.** Two side-by-side sessions should show a
  satellite in the same place at the same moment.

## Options

- **Server-sent events.** One-way push from server to clients, which matches
  the traffic. Plain HTTP, and the browser reconnects by itself. Reconnects,
  catching up and proxy buffering are ours to handle.
- **WebSockets.** Two-way and low latency, which would matter if we streamed
  live input like steering. More to build and run on a 256 MB machine, for
  traffic that's almost all one-way.
- **Polling about once a second.** The simplest, with no long-lived
  connections. Wasted requests, and up to a second of delay sits on the edge
  of the brief's "about a second".

## Decision

- **Actions go up as ordinary `POST`s** from forms that also work without
  JavaScript.
- **Events come down one SSE stream** per open page. The server fans each event
  out to every connected client from memory.
- **Positions are never sent.** Each client draws the sky from the stored
  orbits.
- **The server's clock is the only clock.** When the stream connects, the
  server sends its current time; the client measures its offset and uses
  server time for every position it draws.
- **On connect or reconnect, the client gets a snapshot** of the live sky, then
  applies events from there.

## Consequences

- Real-time traffic is tiny: one small message per event, not per frame.
- The fan-out lives in one process's memory, which only works on one machine
  (the course setup guarantees that).
- An open stream counts as traffic, so the Fly machine stays up while anyone is
  watching.
- A client with a wrong clock offset would draw the sky out of step with
  others, so the offset is measured on every (re)connect, not assumed.
- Events missed while disconnected are covered by the snapshot on reconnect,
  not replayed one by one.
- Proxies can buffer SSE; the stream must disable buffering and send periodic
  keep-alive comments.
- If a later feature needs live input from clients (e.g. steering), this is
  revisited in a new record.
