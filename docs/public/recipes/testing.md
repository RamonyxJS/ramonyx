---
recipe: testing
title: Test a route in-process
summary: Exercise the real handler with an in-memory host, assert SSR/API behavior, then add a browser check.
when: You changed routes, loaders, actions, validation, or security limits.
files: test/home.test.ts
verify: pnpm test
---

# Test a route in-process

`@ramonyx/testing` runs your `FetchHandler` without ports or a browser:

```ts
// test/home.test.ts
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
    await server.close(); // always close: a leaked listener hangs node --test
  }
});

test("POST /api/users rejects invalid body", async () => {
  const server = await createTestServerFromHandler(await createApp());
  try {
    const response = await server.fetch("/api/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });
    assert.equal(response.status, 400);
    const body = (await response.json()) as { issues: unknown[] };
    assert.ok(body.issues.length > 0);
  } finally {
    await server.close();
  }
});
```

What to cover:

- Routing: `200`, `404`, `405` + `Allow`.
- Validation: invalid params/query/body → `400` with `issues`.
- Actions: rendered result, errors, redirect (`303`), and no-JS form submission.
- Cache: loader call counts and invalidation.
- Limits/security: `413`, `503`, `Retry-After`, CSRF.

Browser-level checks (hydration, soft navigation) belong in Playwright. Run `pnpm test` and
`ramonyx check --json` before handing work off. See [Testing](../testing.md).
