# Deployment

One app, three targets. The same `src/app.ts` runs on Node, as static files, or as an edge
`fetch` handler.

## Node (default)

```bash
ramonyx build        # client bundle → dist/client (hashed assets + manifest)
ramonyx start        # SSR on the configured port; NODE_ENV=production
```

Set the port/host in `ramonyx.config.ts`:

```ts
import { defineConfig } from "ramonyx";
export default defineConfig({ server: { port: 3000, host: "0.0.0.0" } });
```

Production notes:

- `public/**` is copied to the root of `dist/client` by the Vite build. Favicons, fonts,
  robots.txt, and images with stable paths belong there.
- Hashed client files are available at both `dist/client/client-*.js` (Node's `/assets`
  prefix strips to root) and `dist/client/assets/client-*.js` (static hosts that serve the
  output directory at root). `buildClient()` mirrors the entry and chunks automatically.
- Serve `dist/client/assets/**` with `immutable` cache headers (the CLI's `start` does this for you).
- The Node adapter compresses responses with brotli/gzip and appends per-chunk for streaming.
- Keep the process behind a reverse proxy for TLS; the runtime verifies TLS for outbound `fetch`.
- Defaults: body 1 MiB, timeout 10 s, concurrency 100. Tune via `createHandler` options.

## Static

```bash
ramonyx build --static     # → dist/static
```

- Static routes are prerendered; dynamic routes need `getStaticPaths`.
- A page with `metadata.status = 404` becomes `404.html`.
- Assets are copied alongside the HTML.
- Deploy the directory to any static host (GitHub Pages, S3, Netlify, …).

## Edge / serverless

```bash
ramonyx build --target edge   # → dist/edge/index.js
ramonyx build --target vercel # → dist/vercel (api/index.js + vercel.json)
ramonyx build --target deno   # → dist/deno (main.ts + index.js)
```

The artifact exports `{ fetch }` — the standard edge contract:

```js
export const fetch = (request, env) => handler(request);
export default { fetch };
```

- Pages, API routes, actions, middleware, and the asset map are inlined into one bundle.
- Platform bindings (KV, secrets) are forwarded per request: the entry receives `env` and exposes
  it to loaders/actions as `env.get(name)` / `env.getRaw(name)`.
- The build rejects `node:*` imports in the edge artifact (except where shimmed by the platform).
- CI runs a **workerd** smoke test against the edge artifact (Cloudflare's runtime), so SSR, API,
  actions, env bindings, middleware, and 404s are exercised in a real edge runtime.

## Preview and staging

- Local preview: `pnpm docs` (and `pnpm dev` for the playground).
- Worker preview: run `pnpm build:worker` then `pnpm dlx wrangler deploy`, or trigger
  `deploy-worker.yml` manually. The canonical domain is `https://ramonyx.devmoon.net/`; the
  GitHub Pages mirror is published at `/ramonyx`.
- **Automatic PR previews are intentionally not enabled.** Cloudflare credentials are limited to
  trusted `main`/manual workflows so pull requests (especially forks) never receive deployment
  secrets. A PR is previewed locally or via an explicitly authorized manual deploy.

## Environment variables

| Context | Access |
| --- | --- |
| Node | `env.get("NAME")` (process env by default) |
| Edge | per-request `env` bindings forwarded by the platform adapter |
| Client | never — server values stay server-side |

## Headers & security in production

- `securityHeaders()` + `cspNonce()` from `@ramonyx/security` set CSP (with per-request nonce),
  `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`/`frame-ancestors`.
- HSTS/TLS termination belongs to your proxy or platform.
- Rate limiting and load shedding are in-process by default; use an external store for
  multi-instance deployments.
