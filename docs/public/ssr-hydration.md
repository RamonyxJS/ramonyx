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
| Hydration | `hydrateRoot` on the existing markup; pages with islands hydrate only their marked boundaries |
| Deferred data | `defer()` + `<Suspense>` streams a server fallback, then the resolved boundary with a state script for hydration |
| Soft navigation | same-origin links fetch the next HTML, reconcile the head, swap the container, re-hydrate, `pushState` |
| Code splitting | client entry dynamically imports the active route/layout chunks; other routes load on navigation/prefetch |
| Prefetch | hover/focus/viewport prefetch HTML and warm the route chunk (LRU 8 entries, 30 s, max 2 concurrent) |
| Forms | submit intercepted when JS is available; `POST` + `303` PRG without JS |
| Scroll | `popstate` restores scroll; new navigations start at the top |

## Deferred loader data (streaming)

`defer()` starts non-critical work immediately and returns a thenable that can be read with
React's `use()` inside a `<Suspense>` boundary:

```tsx
import { defer, type Deferred } from "ramonyx";
import { Suspense, use } from "react";

export async function loader() {
  return {
    title: "Dashboard",
    stats: defer(() => loadStats()),
  };
}

function Stats({ value }: { value: Deferred<{ visits: number }> }) {
  const stats = use(value);
  return <p data-stats>{stats.visits} visits</p>;
}

export default function Dashboard({ data }: { data: Awaited<ReturnType<typeof loader>> }) {
  return (
    <main>
      <h1>{data.title}</h1>
      <Suspense fallback={<p>Loading stats…</p>}>
        <Stats value={data.stats} />
      </Suspense>
    </main>
  );
}
```

- **Streaming is required** (`streaming: true`). The shell and a meaningful fallback are sent
  first; the resolved boundary follows and is revealed in the browser.
- **No-JS**: the fallback is the content users see. Make it useful (not an empty spinner); the
  final deferred value is progressively enhanced and is not available without JavaScript.
- The resolved values are serialized into a `<script type="application/json">` state tag after
  the mount container; the client reads it for hydration. Values must be JSON-serializable and
  must be rendered inside the boundary.
- **Soft navigation/actions** use a synchronous render; the client re-renders the deferred route
  from the state tag (avoiding React Suspense hydration mismatch). Prefetch, back/forward, and
  no-JS remain unchanged.
- A deferred rejection cannot change the response status after the first byte; React keeps the
  boundary fallback and switches it to client rendering, while `onError` logs the failure. Wrap
  recoverable failures with a React error boundary for a custom fallback.
- Deferred data is for non-critical UI. Keep critical content in the awaited loader result; do not
  combine deferred loader data with loader caching (`revalidate`).

## Code splitting & streaming boundaries

- The generated client entry uses dynamic imports per page/layout. The initial entry hydrates
  only the active route; other route chunks are loaded on navigation and warmed by prefetch.
- Streaming is active (`streaming: true`), but loaders resolve before render except data explicitly
  wrapped in `defer()`. Deferred boundaries are opt-in and retain a server-rendered fallback.
- Islands and deferred data are separate opt-ins. A page with islands hydrates only marked
  boundaries; a page with deferred data hydrates the route and client-renders it on soft
  navigation.

## Partial hydration islands (opt-in)

A page can mark interactive boundaries instead of hydrating the whole route. Register the client
component at module scope and render an `Island` with JSON-serializable props:

```tsx
import { defineIsland, Island } from "@ramonyx/react/islands";
import { useState } from "react";

function Counter({ start }: { start: number }) {
  const [count, setCount] = useState(start);
  return <button onClick={() => setCount((value) => value + 1)}>Count: {count}</button>;
}

defineIsland("counter", Counter);

export default function Page() {
  return (
    <main>
      <p>Static server content.</p>
      <Island id="counter" props={{ start: 2 }} />
    </main>
  );
}
```

- The server renders the component inside a `data-ramonyx-island` wrapper. The client detects
  markers and calls `hydrateRoot` only on those wrappers; the rest of the route stays static.
- Detection is per page. **If a page contains any island, its whole route is island-hydrated** —
  every component that relies on React state, effects, or event props on that page or layout must
  be an `Island`. Document-level soft navigation and form interception still work for static
  markup.
- Island IDs are global and must be unique; props must be JSON-serializable (no functions,
  elements, `Date`/`Map`/`Set`, or circular references). Nested islands are not supported.
- Each island is an independent React root. React context from a static layout is not available;
  pass data through props or mount the provider inside the island. Shared state must live outside
  the island roots. React `useId` is supported because server and client use the same per-island
  identifier prefix.
- Soft navigation, prefetch, back/forward, and action re-renders hydrate the new page's islands;
  pages without islands keep the existing full-tree hydration. No-JS output is unchanged.
- Islands are a client-side boundary, not a server-component or data-loading feature.

## Soft navigation & head reconciliation

A soft navigation does not reload the document. Before the body is swapped, the client reconciles
the new document's head with the active one:

- `<title>` and `<html lang>`/`dir` are updated.
- `<meta>` and `<link>` tags are matched by their identity (`name`/`property`/`rel` + target);
  obsolete metadata and discovery links are removed.
- Inline `<style>` tags are staged with `media="not all"` and activated at the swap, so the old
  page keeps its styles until the new body is ready.
- External stylesheets are preloaded before the swap; the real `<link rel="stylesheet">` is then
  installed and the old styles/link are removed. The wait is capped at 2 seconds.
- New inline styles reuse the **current document's CSP nonce**, never the nonce embedded in the
  fetched document (the response's CSP header belongs to the active document).

The server document marks its generated style block with `data-ramonyx-style` so the client can
reconcile it without touching unrelated runtime nodes. Vite development styles are left alone.

### Boundaries

- `<script>` tags in the fetched head are not added or executed; the active client bundle remains
  responsible for navigation and hydration. Server-rendered payload data changes through
  `window.__RAMONYX__`, not through a new script.
- Nodes that are not part of the server head (for example Vite HMR styles) are preserved.
- Prefetch responses go through the same reconciliation path as normal navigation.
- If an external stylesheet fails to load, navigation continues after the timeout and falls back
  to the styles already in the document.

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

### Pending, optimistic UI, and declarative revalidation

`@ramonyx/react` provides small opt-in primitives for actions:

```tsx
import { PendingButton, useActionStatus, useOptimisticForm } from "@ramonyx/react";

const [optimistic, setOptimistic] = useOptimisticForm({ name: "" });

<form
  method="post"
  onSubmit={(event) => {
    const data = new FormData(event.currentTarget);
    setOptimistic({ name: String(data.get("name") ?? "") });
  }}
>
  <input name="name" />
  <PendingButton pendingText="Saving…">Save</PendingButton>
</form>;

{optimistic.name ? <p>Optimistic: {optimistic.name}</p> : null}
```

- The client sets `aria-busy` on the form and dispatches `ramonyx:actionstart` /
  `ramonyx:actionend`; `useActionStatus()` (and `PendingButton`) follow those events.
- `useOptimisticForm()` keeps local optimistic values until the server action re-render replaces
  them with authoritative data.
- Native form POST still works with JavaScript disabled; these primitives simply do nothing.
- To invalidate other data after a successful action, declare it in the page module:

```ts
export const cacheTags = ["notes"];
export const actionRevalidate = { tags: ["notes"] };
```

The server invalidates those tags after a successful action (and fires `onInvalidate`); actions
that return `errors` do not invalidate. This complements `context.revalidate()` for action-local
logic.

## Related primitives

- `AppHooks` (`onRequestStart/End`, `onLoaderEnd`, `onRenderEnd`, `onInvalidate`) for instrumentation.
- `traceId()`, `requestLogging()`, `createMetrics()` from `@ramonyx/server` for observability.
- Asset resolver + `Image` for hashed assets, responsive images, and anti-CLS dimensions.
