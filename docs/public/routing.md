# Routing

Ramonyx maps files under `src/routes/` to URLs. No route config file, no decorators.

```
src/routes/
  page.tsx                 /
  layout.tsx               root layout (wraps every page)
  error.tsx                error boundary for this folder
  [...slug]/page.tsx       catch-all (404 in the template)
  users/
    page.tsx               /users
    [id]/page.tsx          /users/:id
  (marketing)/about/page.tsx   /about        ← route group: parentheses are not in the URL
  api/
    hello.ts               /api/hello
    users/[id].ts          /api/users/:id
```

## Pages

A page module exports:

| Export | Purpose |
| --- | --- |
| `default` | React component receiving `PageProps` |
| `loader` | server-only data loading (GET) |
| `action` | form mutation handler (POST to the same path) |
| `metadata` | title/description/status/robots/canonical/head |
| `revalidate` | cache TTL in seconds (ISR-lite) |
| `cacheTags` | tags for on-demand invalidation |
| `prerender` / `getStaticPaths` | static generation control |

Dynamic segments use `[param]`; catch-all segments use `[...param]`. Route groups `(name)` organize
files without changing URLs. A folder-level `layout.tsx` wraps pages below it; `error.tsx` renders
when a loader/action/render throws an `HttpError` (or any error), with the status preserved.

## Loaders

```ts
export async function loader({ params, query, request, env, log }) {
  const user = await db.user.find(params.id);
  if (user === null) throw new HttpError(404, "User not found");
  return { user };
}
```

The loader context also exposes `assets` (asset resolver) and `locale` (when i18n routing is
enabled). Loader data is embedded in the hydration payload — keep it JSON-serializable.

## API routes

```ts
// src/routes/api/hello/[nama].ts
import { route } from "ramonyx";

export const GET = route<{ nama: string }>({
  handler: ({ params, json }) => json({ hello: params.nama }),
});

export const POST = route({
  handler: async ({ request }) => Response.json({ received: await request.text() }),
});
```

Exported `GET`/`POST`/`PUT`/`PATCH`/`DELETE` become allowed methods; others return `405` with an
`Allow` header. Query/params/body can be validated with a Standard Schema; invalid input → `400`
with `issues`.

## Middleware

- `src/routes/middleware.ts` runs before every route in that folder (root = every route), in
  root → deepest order. It is edge-safe: no `node:*` imports.
- Application-wide middleware (static files, logging, security headers) is passed to
  `createHandler({ middleware })` in `src/app.ts`.

```ts
export default [
  securityHeaders(),
  cspNonce(),
  rateLimit({ limit: 120, windowSeconds: 60 }),
];
```

## HTTP limits (secure by default)

| Limit | Default | On exceed |
| --- | --- | --- |
| Request body | 1 MiB | `413` |
| Handler/loader/render | 10 s | `503` + `request.signal` aborted |
| Concurrent requests | 100 | `503` + `Retry-After` |

Override per app via `createHandler({ maxBodyBytes, timeoutMs, maxConcurrent })`.

## Typed routes

`ramonyx build` and `ramonyx dev` generate `.ramonyx/routes.ts` with a typed `routeHref()` helper
and a `RouteParamsMap`, so wrong paths or params fail at type-check time. Import it by relative
path from your app code.

## i18n routing

`createPageRoutes({ i18n: { locales: ["en", "id"], defaultLocale: "en" } })` registers a route per
locale (`/id/...`), keeps the default locale unprefixed, sets `<html lang>` + `hreflang`, and
passes `locale` to loaders and page props. See the i18n section in the source docs for the full
guide (translation helper, negotiation, language switcher).
