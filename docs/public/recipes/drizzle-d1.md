---
recipe: drizzle-d1
title: Use Drizzle with Cloudflare D1
summary: Define a typed schema, read the D1 binding from env, and run typed queries in an API route.
when: The app runs on Cloudflare Workers and needs SQLite persistence through a D1 binding.
files: src/schema.ts, src/db.server.ts, src/routes/api/notes.ts, wrangler.toml
verify: pnpm test && ramonyx check --json
---

# Use Drizzle with Cloudflare D1

D1 is Cloudflare's SQLite binding. Drizzle's D1 adapter is the same client in production and in
the local test shim, so the query code does not change between runtimes.

## Schema

```ts
// src/schema.ts
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const notes = sqliteTable("notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  text: text("text").notNull(),
});
```

Create the table with a migration (for example `drizzle-kit`) or a one-time D1 statement. Keep
migrations in the repository; do not create tables during a request.

## Read the binding

```ts
// src/db.server.ts — server-only
import type { EnvReader } from "ramonyx";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema.ts";

export function database(env: EnvReader) {
  const binding = env.getRaw?.("DB");
  if (binding === undefined || binding === null) {
    throw new Error("D1 binding DB tidak tersedia — periksa wrangler.toml");
  }
  // `D1Database` comes from @cloudflare/workers-types in a Worker app.
  return drizzle(binding as D1Database, { schema });
}
```

```toml
# wrangler.toml
[[d1_databases]]
binding = "DB"
database_name = "my-app"
database_id = "your-d1-database-id"
```

## Query from an API route

```ts
// src/routes/api/notes.ts
import { route } from "ramonyx";
import { database } from "../../db.server.ts";
import { notes } from "../../schema.ts";

export const GET = route({
  handler: async ({ env, json }) => {
    const db = database(env);
    return json({ notes: await db.select().from(notes).all() });
  },
});

export const POST = route({
  handler: async ({ env, request, json }) => {
    const body = (await request.json()) as { text?: unknown };
    const text = String(body.text ?? "").trim();
    if (text.length === 0) {
      return json({ issues: [{ message: "text wajib", path: ["text"] }] }, 400);
    }
    const db = database(env);
    await db.insert(notes).values({ text }).run();
    return json({ ok: true }, 201);
  },
});
```

## Verify locally

The executable example [`tests/integrations/drizzle-d1.test.ts`](../../../tests/integrations/drizzle-d1.test.ts)
uses `node:sqlite` as a D1-compatible shim: it implements `prepare().bind().all()/raw()/run()`, the
same surface Drizzle uses against a real binding. It covers insert, select, update, and delete.

```bash
pnpm test -- tests/integrations/drizzle-d1.test.ts
ramonyx check --json
```

## Limits

- D1 is SQLite: no PostgreSQL features, and cross-request transactions are not a substitute for
  application-level consistency.
- The test shim is not a Cloudflare runtime; run a smoke test against a real D1 binding before
  deploying migrations.
- Keep `D1Database` types in the app (`@cloudflare/workers-types`); `@ramonyx` core stays free of
  Cloudflare-specific dependencies.
- Use Drizzle migrations, not schema creation in loaders/actions.
