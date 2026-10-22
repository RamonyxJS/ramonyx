# Data & Caching

Ramonyx keeps data loading in the page module: a `loader` for reads, an `action` for writes, and an
opt-in cache for expensive work.

## Loaders

```ts
export const revalidate = 60;
export const cacheTags = ["catalog"];

export async function loader({ params }) {
  return { product: await db.products.find(params.id) };
}
```

Loader data is JSON-serializable and available to the component as `data` (and to the client via
the hydration payload).

### Request-scoped dependency graph

Every loader/action receives `load(key, fn)`. The graph is created per request, so the same
resource is computed once even when loader code calls it multiple times or nested services do:

```ts
export async function loader({ params, load }) {
  const [product, reviews] = await Promise.all([
    load(`produk:${params.id}`, () => db.products.find(params.id)),
    load(`ulasan:${params.id}`, () => db.reviews.forProduct(params.id)),
  ]);
  return { product, reviews };
}
```

Keys must be stable and deterministic; do not include secrets or user-specific values unless the
loader is request-scoped (it is — the graph is discarded after the response). The graph deduplicates
concurrent calls and keeps the promise for the duration of the request; failed dependencies are not
silently retried. A page still owns its loader — the graph is for shared/nested data, not a global
cross-request cache (use the cache/revalidate API for that).

## Cache semantics

| Setting | Effect |
| --- | --- |
| `revalidate: 60` | Cache loader data for 60 s; the next 60 s serves stale data and refreshes in the background |
| `cacheTags: ["catalog"]` | Tag the entry so `revalidate({ tags: ["catalog"] })` removes it |
| no `revalidate` | No caching — loader runs on every request |

Session safety: requests with **cookies** or a **query string** bypass the cache. That keeps
per-user responses out of a shared cache by construction.

The default cache is in-memory (single process). The store interface (`KeyValueStore`) is pluggable
— implement `get/set/delete/invalidateTags` for Redis or another backend and pass it to
`createCache({ store })`. The contract has a shared test suite in the repo. See
[State & Adapters](state-and-adapters.md) for TTL, atomic operations, and failure-mode guidance.

## On-demand invalidation

```ts
// from an action
await revalidate({ tags: ["catalog"] });
```

```ts
// from anywhere with the cache instance
import { createCache } from "ramonyx";
const cache = createCache();
await cache.revalidate({ paths: ["/products"], tags: ["catalog"] });
```

Invalidation also fires the `onInvalidate` app hook, so observability and plugins can react.

## Server actions

Actions are POST handlers colocated with the page:

```ts
export const actionSchema = {
  "~standard": {
    version: 1,
    vendor: "app",
    validate: (form) => {
      const name = String((form as Record<string, unknown>)?.name ?? "").trim();
      return name.length > 0
        ? { value: { name } }
        : { issues: [{ message: "Name is required", path: ["name"] }] };
    },
  },
};

export async function action({ formData, revalidate }) {
  const name = String(formData.get("name"));
  await db.customers.create({ name });
  await revalidate({ tags: ["customers"] });
  return { message: `Created ${name}` };
}
```

`actionSchema` validates the form data before the action runs (invalid → `400` + field errors). The
page renders the last action result as `action` (`{ ok, errors?, message?, data? }`). Redirects use
`303` so a refresh does not resubmit.

## Pragmatic notes

- The cache key includes the page path, route params, and (with i18n) the active locale.
- Cached values are process-local; for multi-instance deployments use an external store.
- There is no HTML page cache (CSP nonces make HTML per-request); only **loader data** is cached.
- A CDN can cache the HTML of static/prerendered pages separately.
