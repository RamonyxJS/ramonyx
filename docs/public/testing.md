# Testing

Test the handler in-process (no ports, no runtime), then add browser tests for hydration and
progressive enhancement.

## In-process tests

`@ramonyx/testing` wraps a handler in an in-memory host:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { createTestServerFromHandler } from "@ramonyx/testing";
import { createApp } from "../src/app.ts";

test("GET / renders SSR", async () => {
  const server = await createTestServerFromHandler(await createApp());
  try {
    const response = await server.fetch("/");
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Hello/);
  } finally {
    await server.close();
  }
});
```

- `createTestServerFromHandler(handler)` — any `FetchHandler` (e.g. from `createApp`).
- `createTestServer({ routes, middleware })` — build a handler from route entries directly.
- `server.fetch(path | Request, init?)` resolves relative URLs against the in-memory origin.
- **Always `close()` in `finally`** — a leaked listener makes `node --test` hang.

## What to test

| Layer | Approach |
| --- | --- |
| Routing / params / methods | `server.fetch` — assert `200`, `404`, `405` + `Allow` |
| Validation | invalid query/params/body → `400` with `issues` |
| Loaders & actions | assert rendered HTML and the hydration payload |
| Cache/revalidate | call twice, assert loader counts and stale-while-revalidate behavior |
| Security | body limits (`413`), timeout (`503`), concurrency (`503` + `Retry-After`), CSRF |
| Browser | Playwright: hydration, soft navigation, forms with and without JS |

## Browser tests

The repo's playground runs Playwright against a production build (`pnpm build && pnpm test:e2e`).
For a new app:

```ts
// e2e/home.spec.ts
import { expect, test } from "@playwright/test";

test("hydrates and handles a form", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Click/ }).click();
  await expect(page.getByRole("button")).toHaveText(/1/);
});
```

Test **no-JS** by disabling JavaScript in the Playwright context: forms must still submit
(`POST` + `303` PRG).

## Commands

```bash
pnpm test          # node --test (packages, apps, tests, benchmarks)
pnpm test:e2e      # Playwright against a production build
pnpm test:docs     # this site's e2e (policy + a11y), if you vendor the docs app
```

## Tips

- Loader data must be JSON-serializable — assert the payload shape when in doubt.
- Use a fresh app/server per test for isolation; keep shared fixtures read-only.
- The dev scripts run app TypeScript/JSX through `@ramonyx/compiler/register` (no build step).
