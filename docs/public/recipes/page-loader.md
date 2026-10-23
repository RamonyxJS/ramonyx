---
recipe: page-loader
title: Add a page with a loader
summary: Create a server-rendered page whose data is loaded on each request and embedded in the hydration payload.
when: The page needs request-time data from a database, API, or environment.
files: src/routes/page.tsx
verify: ramonyx check --json && ramonyx routes --json
---

# Add a page with a loader

Create `src/routes/page.tsx`:

```tsx title="src/routes/page.tsx"
import type { PageLoaderContext } from "ramonyx";
import type { PageProps } from "@ramonyx/react";

export async function loader({ request, env }: PageLoaderContext) {
  const greeting = env.get("GREETING") ?? "Hello";
  return { greeting, url: new URL(request.url).pathname };
}

export default function Home({ data }: PageProps<{ greeting: string; url: string }>) {
  return (
    <main>
      <h1>{data.greeting}</h1>
      <p>Rendered for {data.url}</p>
    </main>
  );
}
```

- `loader` runs on the server for GET requests. Its return value must be JSON-serializable.
- Import server-only code from `*.server.ts`; never import `node:*` from a page component.
- Use `metadata` for the title and `HttpError(404, "…")` for missing data.

## Verify

```bash
ramonyx routes --json   # the page appears with "loader": true
ramonyx check --json    # config, entry, routes, client/server boundaries
ramonyx dev             # request the page in a browser
```

Next: [Routing](../routing.md) and [SSR & Hydration](../ssr-hydration.md).
