# Devtools Panel

Every `ramonyx dev` session exposes a dev-only panel with routes, request/loader/render timings,
hydration status, and bundle sizes. It is never enabled in production builds.

```bash
ramonyx dev
# dev: http://localhost:3000 (Vite + HMR + SSR)
# devtools: http://localhost:3000/__ramonyx/devtools
```

## What it shows

| Section | Data source | Notes |
| --- | --- | --- |
| **Routes** | Page + API manifest | Shows `page`/`api` kind and API methods; updated when route files change |
| **Bundles & assets** | `dist/client/ramonyx.assets.json` + file sizes | Empty until the app has been built — the panel does not build for you |
| **Recent requests** | Collector middleware + `AppHooks` | Last 50 requests; method, path, status, total, loader, render, cache, hydration |

**Hydration** is detected from the response HTML: `payload` when
`<script id="ramonyx-payload">` is present, `none` for HTML without it (e.g. error pages).

## How it works

- The dev server creates a collector backed by the app's `AppHooks` (`onLoaderEnd`, `onRenderEnd`)
  and a middleware placed outermost in the chain.
- `GET /__ramonyx/devtools` serves the panel (a self-contained HTML page polling every 2s);
  `GET /__ramonyx/data` returns `{ routes, assets, requests }` as JSON.
- Both endpoints are served by the dev server, not proxied to the SSR app, and are absent from
  production.

## Limitations (honest)

- Loader/render correlation uses Node `AsyncLocalStorage`, so concurrent requests with the same
  path do not overwrite each other's timings.
- Requests short-circuited by plugin middleware are still recorded (the collector is outermost), but
  Vite asset requests and `/__ramonyx/*` calls are not.
- Not a production observability tool — use [Observability](observability.md) for that.
