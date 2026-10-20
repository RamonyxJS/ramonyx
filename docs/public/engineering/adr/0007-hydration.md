---
adr: 0007
title: "Hydration: inline payload + one client bundle"
visibility: public
---

# ADR-0007: Hydration — Inline Payload + One Client Bundle

- Status: Public summary (the full decision record lives in the internal log)
- Date: 2026-10-18

## Context

After server rendering, the client needs the same data the server used. A second data request after
load costs a round trip and can render a different result. Multiple per-page bundles multiply
requests and cache misses.

## Decision

1. Server rendering embeds a JSON payload in the document:
   `window.__RAMONYX__ = { path, params, data, action, locale }`.
2. The client is **one bundle** (hashed, immutable) that hydrates the current page from that payload
   and wires soft navigation.
3. The payload is JSON-serializable by contract; non-serializable data is a bug in the loader.
4. Error pages are **not** hydrated — they are server-only output.

## Consequences

- Hydration performs no extra data request.
- Loader data shapes the public contract: anything non-JSON must be transformed in the loader.
- The single bundle grows with the app; code splitting per route is a future optimization (not
  implemented).
- Soft navigation reuses the same payload shape, so server and client stay symmetric.
