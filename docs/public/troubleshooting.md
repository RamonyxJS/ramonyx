# Troubleshooting

Framework errors carry a stable code and a link to this page. Search the code below, or grab the
anchor from the error message.

## RMX-CONFIG-1 — invalid config

`ramonyx.config.ts` has a value with the wrong type.

| Field | Expected |
| --- | --- |
| `app.strictValidation` | boolean |
| `app.streaming` | boolean |
| `server.port` | integer 0–65535 |
| `server.host` | non-empty string |

Fix the value; unknown keys are kept (config pass-through) and are not the cause.

## RMX-ROUTES-1 — can't read the routes directory

The compiler cannot read `src/routes` (missing directory or permissions). Create
`src/routes/page.tsx` or point the CLI at the right app with `--app`.

## RMX-ROUTES-2 — missing default export

A page/layout/error module has no `default` export. Every `page.tsx`, `layout.tsx`, and `error.tsx`
must export the component as default:

```tsx
export default function Page() { /* ... */ }
```

## RMX-ROUTES-3 — invalid middleware export

A `middleware.ts` must default-export an **array of functions**:

```ts
import type { Middleware } from "ramonyx";
export default [securityHeaders(), cspNonce()] satisfies Middleware[];
```

## RMX-ROUTES-4 — API route without an HTTP method export

An `api/**/*.ts` file exports none of `GET`/`POST`/`PUT`/`PATCH`/`DELETE`/`HEAD`/`OPTIONS`. Export at
least one using `route({ handler })`.

## RMX-ROUTES-5 — invalid route definition

An exported method is not a route definition. Use the helper:

```ts
export const GET = route({
  handler: ({ json }) => json({ ok: true }),
});
```

## RMX-BUILD-1 — server import in a client module

A page/layout imports `node:*` directly. The client bundle cannot contain Node APIs. Move that code
into a `*.server.ts` module and call it from a loader/action/API route; the client bundle gets a
poison-pill stub instead of your server code.

## RMX-BUILD-2 — server code leaked into the client bundle

Same problem, but through a transitive import (or a Vite browser-external shim was found). Split the
server-only code behind `*.server.ts` and import it only from the server side.

## RMX-EDGE-1 — `node:*` in the edge artifact

The edge target rejects Node built-ins. `guardedFetch` lives in a Node-only subpath; import it from
`@ramonyx/security/ssrf` **only** in Node code, and keep edge code on `fetch`.

## Common non-coded issues

| Symptom | Cause / fix |
| --- | --- |
| `413` on POST | Body over 1 MiB. Raise `maxBodyBytes` in `createHandler` or stream/upload differently. |
| `503` after 10 s | Handler/loader/render timeout. Optimize, or raise `timeoutMs`. `request.signal` is aborted. |
| `503` + `Retry-After` under load | Concurrency limit (default 100) shedding load. Scale out or raise `maxConcurrent`. |
| Hydration mismatch / no interactivity | Client bundle not built (`ramonyx build` before `ramonyx start`) or an error page (error pages are not hydrated). |
| Assets 404 in production | Build first; assets are hashed into `dist/client` and served by `ramonyx start`. |
| `node_modules` TypeScript fails | Node does not type-strip `node_modules`; publish compiled JS for plugins/consumers. |
| Dev server panel missing | Open the URL printed by `ramonyx dev` (`/__ramonyx/devtools`); it is dev-only. |

## Getting more detail

- Development error pages include the stack and source file; production pages never do.
- The CLI `ramonyx doctor` prints config, route count, and build status.
- See [Testing](testing.md) for reproducing issues in-process.


## Client/server boundaries

`ramonyx build` (and `buildClient`) statically rejects page/layout/error modules that import
`node:*`, `server-only`, or `*.server.ts`, before Vite attempts the bundle. Move database/secrets
code into a `*.server.ts` module and import it only from a loader, action, or API route. The error
names the offending file and specifier; the compiler also exposes `lintClientBoundaries(pages)` if
you want the check in your own tooling.
