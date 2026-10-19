# SSR & Hydration

Ramonyx renders pages on the server, sends a hydration payload, and hydrates the same React tree in
the browser. Streaming is opt-in.

## What a request looks like

```
Request → middleware → route match → loader → render (React) → HTML document → Response
```

The document contains:

- the server-rendered markup inside `#ramonyx-root`,
- `<script id="ramonyx-payload">window.__RAMONYX__ = { path, params, data, action, locale }</script>`,
- the hashed client bundle (`/assets/client-<hash>.js`) that hydrates the tree and wires soft
  navigation, prefetch, and form interception.

Because the payload is embedded, there is no extra data request on hydration.

## Streaming (opt-in)

```ts
// ramonyx.config.ts
export default defineConfig({ app: { streaming: true } });
```

With `streaming: true`, the shell (head + layout) is sent immediately and the body is streamed with
`renderToReadableStream` (edge build of React). Errors after the first byte close the stream — the
status can no longer change. Error pages are always rendered synchronously.

## Layouts & error boundaries

- `layout.tsx` wraps pages in the folder and above; layouts receive `children`.
- `error.tsx` receives `{ error: { status, message, details? } }`. `details` (stack + source file)
  is only included outside production.
- Unknown paths fall through to a catch-all page (the template ships `[...slug]` with
  `metadata.status = 404`).

## Client behavior

| Feature | Behavior |
| --- | --- |
| Hydration | `hydrateRoot` on the existing markup; no re-render flash |
| Soft navigation | same-origin links fetch the next HTML, swap the container, re-hydrate, `pushState` |
| Prefetch | hover/focus/viewport prefetch with a small LRU cache (8 entries, 30 s TTL, max 2 concurrent) |
| Forms | submit intercepted when JS is available; `POST` + `303` PRG without JS |
| Scroll | `popstate` restores scroll; new navigations start at the top |

## Data loading & caching

Loaders run on the server on every request unless a page opts into caching:

```ts
export const revalidate = 60;                 // seconds (ISR-lite)
export const cacheTags = ["products"];        // for on-demand invalidation

export async function loader() {
  return { products: await db.products.list() };
}
```

- Responses that depend on a session (cookies) or query strings are **not** cached.
- Serve stale data while refreshing in the background (`stale-while-revalidate`).
- Invalidate on demand: `revalidate({ paths: ["/products"], tags: ["products"] })` from a loader,
  action (`context.revalidate`), or the cache instance.
- The default cache is in-memory per process; the store interface is pluggable for multi-instance
  deployments.

## Server actions

An `action` export turns a page into a mutation endpoint (POST to the same URL). It receives
`{ params, formData, request, env, log, locale, json(), revalidate() }` and can return
`{ message, errors, data, status, headers, redirect }`. A redirect is `303` (POST/Redirect/GET).

```ts
export async function action({ formData, revalidate }) {
  await db.notes.create({ text: String(formData.get("text") ?? "") });
  await revalidate({ tags: ["notes"] });
  return { message: "Saved" };
}
```

## Related primitives

- `AppHooks` (`onRequestStart/End`, `onLoaderEnd`, `onRenderEnd`, `onInvalidate`) for instrumentation.
- `traceId()`, `requestLogging()`, `createMetrics()` from `@ramonyx/server` for observability.
- Asset resolver + `Image` for hashed assets, responsive images, and anti-CLS dimensions.
