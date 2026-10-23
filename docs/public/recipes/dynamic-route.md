---
recipe: dynamic-route
title: Add a dynamic route
summary: Map a URL segment or catch-all to a page, read params in the loader, and validate them.
when: The URL contains an identifier, slug, or nested path.
files: src/routes/blog/[slug]/page.tsx
verify: ramonyx routes --json && ramonyx check --json
---

# Add a dynamic route

Use `[param]` for one segment and `[...param]` for a catch-all:

```
src/routes/blog/[slug]/page.tsx   → /blog/:slug
src/routes/docs/[...path]/page.tsx → /docs/*path
```

```tsx title="src/routes/blog/[slug]/page.tsx"
import { HttpError, type PageLoaderContext } from "ramonyx";
import type { PageProps } from "@ramonyx/react";

export async function loader({ params }: PageLoaderContext<{ slug: string }>) {
  const post = await findPost(params.slug);
  if (post === null) {
    throw new HttpError(404, "Post not found");
  }
  return { post };
}

export default function Post({ data }: PageProps<{ post: { title: string; body: string } }>) {
  return (
    <article>
      <h1>{data.post.title}</h1>
      <p>{data.post.body}</p>
    </article>
  );
}
```

- Params are strings; validate/normalize them before using them in queries.
- For static export, export `getStaticPaths()` with every allowed param object.
- Route groups `(marketing)` do not appear in the URL. Keep folder names that start with `_` for
  private files.

## Verify

```bash
ramonyx routes --json   # check the generated path, e.g. /blog/[slug]
ramonyx check --json
```

Next: [Routing](../routing.md) and [Typed Routes](../typed-routes.md).
