---
adr: 0083
title: "Single-port dev server: Vite middleware + HMR + SSR in one HTTP server"
visibility: public
---

# ADR-0083: Single-port dev server — Vite middleware + HMR + SSR

- Status: Public summary (the full decision record lives in the internal log)
- Date: 2026-10-23

## Context

The original dev server used two HTTP listeners: Vite on 5173 and the SSR app on 3000, with a
manual proxy between them. That produced two URLs, made direct SSR requests fail for the client
entry, and diverged from the single-port development model developers expect from frameworks such
as Next.js. Opening the wrong port caused confusing 404s for `/.ramonyx/client-entry.ts` and
`/@vite/client`.

## Decision

1. Run Vite in **middleware mode** inside a Node HTTP server owned by Ramonyx.
2. Attach Vite's HMR WebSocket to that same HTTP server.
3. Mount the SSR handler as the final middleware: Vite/plugin requests are handled first, then
   application HTML, loaders, actions, and API routes.
4. Use `server.port` (default `3000`) as the single public dev port; remove the separate SSR proxy
   and the `--dev-port` CLI alias.
5. `createDevServer` now requires a handler factory and no longer accepts a proxy `target`.
6. Keep the production path unchanged: `ramonyx start` already serves SSR and assets on one port.

## Consequences

- `ramonyx dev` prints one URL and one port; HMR, client modules, assets, SSR, and APIs share it.
- Direct requests for `client-entry.ts`/`@vite/client` no longer hit an SSR-only port.
- The dev server owns the Node request/response bridge; streaming and client aborts are handled by
  the same listener used by the Node runtime host.
- Removing the proxy API and `--dev-port` is a breaking change, released as 2.0.0.
- Vite stays behind a stable framework boundary; applications still use standard `Request`/
  `Response` handlers.
