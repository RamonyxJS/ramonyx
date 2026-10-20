---
adr: 0066
title: "Revalidation: cache loader data, not HTML"
visibility: public
---

# ADR-0066: Revalidation (ISR-lite) — Loader Data, Not HTML

- Status: Public summary (the full decision record lives in the internal log)
- Date: 2026-10-19

## Context

Caching rendered HTML is tempting (CDN-friendly), but Ramonyx injects per-request CSP nonces into
the document. Caching HTML would serve stale nonces or force per-request cache keys. Data caching
avoids the problem and keeps rendering fresh.

## Decision

1. `revalidate` caches **loader data**, not the HTML document.
2. Cache TTL is `revalidate` seconds; the following equal window serves stale data while refreshing
   in the background (`stale-while-revalidate`), deduplicated per key.
3. Requests with **cookies** or **query strings** bypass the cache (session safety by default).
4. Cache entries carry tags (`cacheTags`, path, route) for on-demand invalidation from loaders or
   actions.
5. The store is pluggable (`KeyValueStore`); the default is in-memory per process.

## Consequences

- Fresh HTML (with a fresh nonce) every request; the expensive part (data) is cached.
- Multi-instance deployments need a shared store to benefit from the cache.
- There is no HTML/CDN purge integration yet.
