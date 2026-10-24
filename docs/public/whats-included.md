# What's Included

A map of implemented capabilities to their documentation. Status: ✅ implemented, ◐ partial,
⚗️ experimental (runtime). Everything below is exercised by the test suite.

## Core & routing

| Capability | Docs |
| --- | --- |
| File routing (pages, nested layouts, route groups) | [Routing](routing.md) |
| Dynamic params `[id]` and catch-all `[...slug]` | [Routing](routing.md) |
| API routes with method exports + 404/405 | [Routing](routing.md) |
| Global + per-folder middleware; `matchMiddleware` per path | [Routing](routing.md) |
| Error boundaries (`error.tsx`) + dev overlay + stable `RMX-*` codes | [SSR & Hydration](ssr-hydration.md) · [Troubleshooting](troubleshooting.md) |
| Request limits (body 1 MiB, 10 s timeout, 100 concurrent) + streaming action limit | [Routing](routing.md) |
| Config pass-through (`ramonyx.config.ts`) | [CLI](cli.md) |

## Rendering & data

| Capability | Docs |
| --- | --- |
| SSR React (sync + streaming opt-in) | [SSR & Hydration](ssr-hydration.md) |
| Hydration payload + soft navigation + prefetch | [SSR & Hydration](ssr-hydration.md) |
| Loaders (`params`, `query`, `env`, `assets`, `locale`, `load`) | [SSR & Hydration](ssr-hydration.md) |
| Request-scoped loader dependency graph + dedupe | [Data & Caching](data-and-caching.md) |
| Server actions + schema validation + 303 PRG | [SSR & Hydration](ssr-hydration.md) |
| Pending/optimistic action UI + declarative `actionRevalidate` | [SSR & Hydration](ssr-hydration.md) |
| Loader cache with TTL + stale-while-revalidate + tags | [Data & Caching](data-and-caching.md) |
| On-demand invalidation (`revalidate`) | [Data & Caching](data-and-caching.md) |
| Metadata/SEO (sitemap, robots, canonical) | [SSR & Hydration](ssr-hydration.md) |
| ICU messages, locale detection/redirect, hreflang | [Internationalization](i18n.md) |
| Typed routes (`routeHref`, typed `Link`, `#routes`) | [Typed Routes](typed-routes.md) |
| Streaming SSR + deferred no-JS fallback | [SSR & Hydration](ssr-hydration.md) |
| State contracts + in-memory/Redis adapters | [State & Adapters](state-and-adapters.md) |

## Security

| Capability | Docs |
| --- | --- |
| Security headers + CSP nonce | [Security overview](security/overview.md) |
| CSRF double-submit | [Sessions & Auth](sessions-and-auth.md) |
| Rate limiting per client | [Security overview](security/overview.md) |
| SSRF guard with DNS pinning + FormData URL checks | [Security overview](security/overview.md) |
| Safe cookies + HMAC-signed sessions + shared stores | [Sessions & Auth](sessions-and-auth.md) |
| User store, reset/verification, OAuth/OIDC, authorization | [Sessions & Auth](sessions-and-auth.md) |
| Static boundary lint + client/server enforcement | [Architecture](architecture.md) |
| Body/timeout/concurrency/output limits | [Routing](routing.md) |

## Assets & media

| Capability | Docs |
| --- | --- |
| `src/assets/**` hashing + manifest + resolver | [Assets & Images](assets-and-images.md) |
| `Image` (anti-CLS, lazy, `<picture>`) | [Assets & Images](assets-and-images.md) |
| Build-time image variants (WebP; AVIF opt-in) + blur placeholder | [Assets & Images](assets-and-images.md) |
| Range requests + precompressed `.br`/`.gz` serving | [Deployment](deployment.md) |
| Font preload helper | [Assets & Images](assets-and-images.md) |

## Tooling & deployment

| Capability | Docs |
| --- | --- |
| CLI (`dev`, `build`, `start --watch`, `add/remove`, `doctor`) | [CLI](cli.md) |
| Dev server + HMR | [CLI](cli.md) |
| Devtools panel (dev-only) | [Devtools Panel](devtools.md) |
| Scaffolder (`create-ramonyx-app`) + templates | [Templates](templates.md) |
| Typed routes codegen | [Typed Routes](typed-routes.md) |
| Observability (trace id, logs, metrics) | [Observability](observability.md) |
| Static export / SSG | [Deployment](deployment.md) |
| Edge/serverless target + Vercel/Deno presets | [Deployment](deployment.md) |
| Compression + ETag + immutable/range/precompressed assets | [Deployment](deployment.md) |
| Source maps (client + packages) | [Troubleshooting](troubleshooting.md) |
| Strict self-hosted benchmark gate + report-only fallback | [Benchmarks](benchmarks.md) |
| Test utilities | [Testing](testing.md) |

## Extensibility

| Capability | Docs |
| --- | --- |
| Plugins (Vite, middleware, hooks, assets) | [Plugins](plugins.md) |
| Verified registry + `ramonyx add/remove` + publishing | [Plugins](plugins.md) |
| Image plugin (`sharp` optional peer) | [Assets & Images](assets-and-images.md) |
| MCP docs server (stdio + HTTP) + `llms.txt` | [For Agents](for-agents.md) |

## Experimental runtime (Rust + V8)

Permission deny-all model, HTTP server with streaming/cancellation, worker and process isolation,
CPU/RSS quotas, plugin sandbox (Landlock), TLS `fetch`, CommonJS interop. Shipped as a separate
binary; **not part of the production promise** yet — see the repository for its assessments.
