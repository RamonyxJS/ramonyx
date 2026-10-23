---
recipe: cache-revalidate
title: Cache loader data and invalidate it
summary: Opt into loader caching with revalidate/cacheTags, then invalidate by path or tag after a mutation.
when: A read-heavy page can tolerate a short stale window.
files: src/routes/products/page.tsx
verify: ramonyx check --json
---

# Cache loader data and invalidate it

```tsx title="src/routes/products/page.tsx"
export const revalidate = 60;               // seconds
export const cacheTags = ["products"];

export async function loader() {
  return { products: await db.products.list() };
}

export async function action({ formData, revalidate }: {
  formData: FormData;
  revalidate: (options: { tags?: string[] }) => Promise<void>;
}) {
  await db.products.create({ name: String(formData.get("name") ?? "") });
  await revalidate({ tags: ["products"] });
  return { message: "Created" };
}
```

- `revalidate` caches loader data for that many seconds and serves stale data while refreshing.
- Caching is skipped for requests with cookies or a query string.
- `cacheTags` lets you invalidate a group; `revalidate({ paths, tags })` also works from a loader,
  action, or the cache instance.
- Cached values are process-local by default. For multi-instance deployments, back the cache and
  session/rate-limit stores with Redis/KV.
- Do not combine loader caching with `defer()`; deferred data is for non-critical UI.

## Verify

Call the page twice and assert the loader count; invalidate a tag and assert the next request
re-reads. See [Testing](testing.md) and [Data & Caching](../data-and-caching.md).
