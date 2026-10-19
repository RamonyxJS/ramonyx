# API Reference

The public API surface, grouped by package. Everything is ESM, TypeScript-first, and edge-safe
unless noted.

## `ramonyx` (meta package)

Re-exports the common primitives:

```ts
import {
  route, createHandler, HttpError, defineConfig, resolveConfig,
  createCache, createMemoryStore, mergeHooks, formDataToObject,
  createTranslator, negotiateLocale, localePath, parseAcceptLanguage,
} from "ramonyx";
```

## Server — `@ramonyx/server`

```ts
createHandler(options): FetchHandler
```

| Option | Type | Default |
| --- | --- | --- |
| `routes` | `RouteEntry[]` | required |
| `middleware` | `Middleware[]` | `[]` |
| `env` | `EnvReader` | `process.env` |
| `logger` | `Logger` | console |
| `strictValidation` | `boolean` | `true` |
| `hooks` | `AppHooks` | — |
| `maxBodyBytes` | `number` | `1_048_576` |
| `timeoutMs` | `number` | `10_000` |
| `maxConcurrent` | `number` | `100` |
| `envFromRequest` | `(request) => EnvReader?` | — |

Also: `traceId()`, `requestLogging()`, `createMetrics()`, `createMetricsRoute(metrics)`.

## Core — `@ramonyx/core`

```ts
route<Params, Query, Body, Output>({ handler, params?, query?, body?, output? }): RouteDefinition
```

`handler(context)` receives `{ request, params, query, body, env, log, json(), text(), redirect() }`.
Invalid schema input → `400` with `issues`; invalid output → `500`.

Other exports: `HttpError`, `defineConfig`, `resolveConfig`, `mergeHooks`, `formDataToObject`,
`createCache`, `createMemoryStore`, `createTranslator`, `negotiateLocale`, `localePath`,
`parseAcceptLanguage`.

## SSR — `@ramonyx/ssr`

```ts
createPageRoutes({
  pages, renderer, document?, client?, streaming?, hooks?, cache?,
  assets?, i18n?, errorDetails?, maxDocumentBytes?,
}): RouteEntry[]
```

- `client: { script, extraModules? }` enables hydration.
- `i18n: { locales, defaultLocale, prefixDefaultLocale?, directions? }` enables locale routing.
- `document` overrides the HTML shell (`DocumentOptions` includes `title, body, head, scripts,
  status, lang, dir`).

Also: `defaultDocument`, `RAMONYX_MOUNT_ID`, and SEO helpers `sitemapXml`, `robotsTxt`,
`createSeoRoutes`.

## React — `@ramonyx/react`

- `createReactRenderer()` — SSR + streaming renderer.
- `Image` (`@ramonyx/react/assets`) — safe defaults + `<picture>` when variants exist.
- `Link` (`@ramonyx/react/link`) — client navigation + prefetch.
- Types: `PageProps<Data, Params>`, `LayoutProps`, `ErrorPageProps`.

## Compiler — `@ramonyx/compiler`

- `createRouteManifest({ dir, importer? })` — API routes.
- `loadPageRoutes({ dir, apiDir?, importer? })` — page manifest.
- `generateClientEntry(pages, { from })`, `generateServerEntry(options)`,
  `generateRouteTypes(pages)`.
- Loader: `import "@ramonyx/compiler/register"` (TypeScript + JSX for app code).

## Bundler — `@ramonyx/bundler`

- `buildClient(options)`, `buildEdge(options)`, `prerenderRoutes(options)`.
- `readClientScript(clientDir)`, `createAssetResolver(clientDir, { fallbackToPath? })`,
  `assetUrl(manifest, path)`, `readAssetManifest`, `fontPreloadTag`.
- `definePlugin`, `loadPlugins`, `createDevServer`.

## Security — `@ramonyx/security`

`securityHeaders()`, `cspNonce()`, `csrfProtection()`, `rateLimit()`, `parseCookies()`,
`serializeCookie()`, `signValue()`, `verifyValue()`, `createSession()`. The SSRF-guarded fetch is a
Node-only subpath: `import { guardedFetch } from "@ramonyx/security/ssrf"`.

## Adapter runtime — `@ramonyx/adapter-runtime`

`createNodeHost()` (`serve`, `env`), `serveStatic({ dir, prefix, immutable?, headers? })`, and the
in-memory host used by tests. `cacheControl({ maxAge, sMaxAge?, staleWhileRevalidate?, immutable?,
private? })` lives in `@ramonyx/core` (re-exported by `ramonyx`).

## Testing — `@ramonyx/testing`

`createTestServer(options)` / `createTestServerFromHandler(handler)` — in-process requests without
binding a port.

## CLI — `@ramonyx/devtools`

`ramonyx dev | build | start | doctor | version | help`. Build flags: `--static`, `--target edge`,
`--watch`. Dev prints a devtools panel URL (`/__ramonyx/devtools`).

## Diagnostics

Framework errors carry stable `RMX-*` codes. In development, error pages include the stack and
source file; production pages never do.
