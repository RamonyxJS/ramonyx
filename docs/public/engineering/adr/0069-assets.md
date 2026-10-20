---
adr: 0069
title: "Asset pipeline: manifest + resolver instead of a custom loader"
visibility: public
---

# ADR-0069: Asset Pipeline — Manifest + Resolver

- Status: Public summary (the full decision record lives in the internal log)
- Date: 2026-10-19

## Context

Node cannot `import photo.png`; only the client bundler can. A custom loader would create two asset
systems and break SSR/edge. Instead, assets need a single source of truth usable by server, client,
and edge output.

## Decision

1. `src/assets/**` is scanned at build time, content-hashed, and copied to the client output.
2. Every asset is recorded in `ramonyx.assets.json` (path → hashed file, bytes, dimensions,
   variants).
3. The server resolves URLs through an `AssetResolver` passed to loaders as `assets`:
   `assets.url(path)` and `assets.image(path)`.
4. `Image` renders the resolved data with anti-CLS dimensions; responsive variants become
   `srcSet` + `<picture>`.
5. Edge builds inline the asset map (no filesystem at runtime).
6. URLs map 1:1 to files under the client output root, so `serveStatic({ prefix: "/assets" })`
   works without special cases. (An earlier layout put files in an `assets/` subdirectory; URLs
   then 404'd for scanned assets. The regression is covered by an HTTP test.)

## Consequences

- One manifest drives SSR, client, edge, and the image plugin.
- Dev serves raw files (no hashes/variants); build output is authoritative.
- Fonts and images share the pipeline; `fontPreloadTag` generates preload links from hashed URLs.
