# What's Included

A map of implemented capabilities to their documentation. Status: ✅ implemented, ◐ partial,
⚗️ experimental (runtime). Everything below is exercised by the test suite.

## Core & routing

| Capability | Docs |
| --- | --- |
| File routing (pages, nested layouts, route groups) | [Routing](routing.md) |
| Dynamic params `[id]` and catch-all `[...slug]` | [Routing](routing.md) |
| API routes with method exports + 404/405 | [Routing](routing.md) |
| Global + per-folder middleware | [Routing](routing.md) |
| Error boundaries (`error.tsx`) + stable `RMX-*` codes | [Troubleshooting](troubleshooting.md) |
| Request limits (body 1 MiB, 10 s timeout, 100 concurrent) | [Routing](routing.md) |
| Config pass-through (`ramonyx.config.ts`) | [CLI](cli.md) |

## Rendering & data

| Capability | Docs |
| --- | --- |
| SSR React (sync + streaming opt-in) | [SSR & Hydration](ssr-hydration.md) |
| Hydration payload + soft navigation + prefetch | [SSR & Hydration](ssr-hydration.md) |
| Loaders (`params`, `query`, `env`, `assets`, `locale`) | [SSR & Hydration](ssr-hydration.md) |
| Server actions + schema validation + 303 PRG | [SSR & Hydration](ssr-hydration.md) |
| Loader cache with TTL + stale-while-revalidate + tags | [Data & Caching](data-and-caching.md) |
| On-demand invalidation (`revalidate`) | [Data & Caching](data-and-caching.md) |
| Metadata/SEO (sitemap, robots, canonical) | [SSR & Hydration](ssr-hydration.md) |
| i18n routing + translation helpers | [Internationalization](i18n.md) |
| Typed routes (`routeHref`) | [Typed Routes](typed-routes.md) |
| Streaming SSR | [SSR & Hydration](ssr-hydration.md) |

## Security

| Capability | Docs |
| --- | --- |
| Security headers + CSP nonce | [Security overview](security/overview.md) |
| CSRF double-submit | [Sessions & Auth](sessions-and-auth.md) |
| Rate limiting per client | [Security overview](security/overview.md) |
| SSRF guard with DNS pinning (`guardedFetch`) | [Security overview](security/overview.md) |
| Safe cookies + HMAC-signed sessions | [Sessions & Auth](sessions-and-auth.md) |
| Server/client boundary enforcement | [Architecture](architecture.md) |
| Body/timeout/concurrency/output limits | [Routing](routing.md) |

## Assets & media

| Capability | Docs |
| --- | --- |
| `src/assets/**` hashing + manifest + resolver | [Assets & Images](assets-and-images.md) |
| `Image` (anti-CLS, lazy, `<picture>`) | [Assets & Images](assets-and-images.md) |
| Build-time image variants (WebP; AVIF opt-in) | [Assets & Images](assets-and-images.md) |
| Font preload helper | [Assets & Images](assets-and-images.md) |

## Tooling & deployment

| Capability | Docs |
| --- | --- |
| CLI (`dev`, `build`, `start`, `doctor`, `watch`) | [CLI](cli.md) |
| Dev server + HMR | [CLI](cli.md) |
| Devtools panel (dev-only) | [Devtools Panel](devtools.md) |
| Scaffolder (`create-ramonyx-app`) | [Getting Started](getting-started.md) |
| Typed routes codegen | [Typed Routes](typed-routes.md) |
| Observability (trace id, logs, metrics) | [Observability](observability.md) |
| Static export / SSG | [Deployment](deployment.md) |
| Edge/serverless target | [Deployment](deployment.md) |
| Compression + ETag + immutable assets | [Deployment](deployment.md) |
| Source maps (client + packages) | [Troubleshooting](troubleshooting.md) |
| Benchmark protocol | [Benchmarks](benchmarks.md) |
| Test utilities | [Testing](testing.md) |

## Extensibility

| Capability | Docs |
| --- | --- |
| Plugins (Vite, middleware, hooks, assets) | [Plugins](plugins.md) |
| Plugin publishing conventions | [Plugins](plugins.md) |
| Image plugin (`sharp` optional peer) | [Assets & Images](assets-and-images.md) |
| MCP docs server + `llms.txt` | [For Agents](for-agents.md) |

## Experimental runtime (Rust + V8)

Permission deny-all model, HTTP server with streaming/cancellation, worker and process isolation,
CPU/RSS quotas, plugin sandbox (Landlock), TLS `fetch`, CommonJS interop. Shipped as a separate
binary; **not part of the production promise** yet — see the repository for its assessments.
