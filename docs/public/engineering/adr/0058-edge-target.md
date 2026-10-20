---
adr: 0058
title: "Edge/serverless target: one fetch handler, node:* rejected"
visibility: public
---

# ADR-0058: Target Edge/Serverless

- Status: Public summary (the full decision record lives in the internal log)
- Date: 2026-10-18

## Context

Platforms like Cloudflare Workers, Deno Deploy, and serverless functions expose a `fetch(request,
env)` contract. Node APIs (`node:fs`, `node:http`) do not exist there. A separate build with static
imports is required — dynamic file reads cannot work.

## Decision

1. `ramonyx build --target edge` generates a single `dist/edge/index.js` exporting `{ fetch }`.
2. The entry imports pages, API routes, and middleware **statically** (codegen), so no filesystem
   reads happen at runtime.
3. The asset map is inlined; `guardedFetch` moves to a Node-only subpath so the main security entry
   stays edge-safe.
4. The build rejects `node:*` in the edge artifact; the React adapter uses the edge server build.
5. CI runs a **workerd** smoke test of the artifact (SSR, API, actions, env, middleware, 404).

## Consequences

- Same app code, three targets (Node, static, edge).
- Platform bindings arrive per request (`envFromRequest`) and are readable via `env.get/getRaw`.
- Features that need the filesystem at request time are Node-only by design.
