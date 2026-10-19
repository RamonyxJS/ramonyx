---
adr: 0047
title: "SSR streaming: opt-in, edge renderer, synchronous error pages"
visibility: public
---

# ADR-0047: SSR Streaming — Opt-in, Edge Renderer

- Status: Public summary (the full decision record lives in the internal log)
- Date: 2026-10-18

## Context

Large React trees benefit from streaming the shell before the whole page is ready. Streaming also
changes error semantics: once the first byte is sent, the HTTP status cannot change.

## Decision

1. Streaming is **opt-in** (`streaming: true` on page routes or `app.streaming` in config). The
   default remains synchronous rendering.
2. The React renderer uses `react-dom/server.edge` (`renderToReadableStream`) for both streaming and
   synchronous rendering, so Node and edge targets share one code path.
3. The document renderer is split around a body marker so custom HTML shells keep working; if the
   shell omits the marker, the synchronous path is used.
4. Error pages always render synchronously. Errors after the first streamed byte terminate the
   connection instead of changing the status.

## Consequences

- Apps choose the trade-off: faster TTFB and progressive paint vs. simpler error handling.
- `onRenderEnd` fires when the stream **starts** (not when it finishes) and reports
  `streaming: true`.
- Output limits still apply; exceeding them aborts the stream.
