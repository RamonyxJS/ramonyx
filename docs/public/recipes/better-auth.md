---
recipe: better-auth
title: Add Better Auth to an API route
summary: Mount Better Auth on /api/auth, store users and sessions with Drizzle, and keep secrets in bindings.
when: The app needs email/password login, sessions, and optional OAuth without building auth primitives from scratch.
files: src/auth.server.ts, src/routes/api/auth/[...all].ts, src/db.server.ts
verify: pnpm test && ramonyx check --json
---

# Add Better Auth to an API route

Better Auth owns users, accounts, sessions, verification tokens, cookies, and the auth HTTP
handler. Ramonyx only needs to mount that handler and provide a database adapter.

Install:

```bash
pnpm add better-auth drizzle-orm
```

## Database adapter

Use the Drizzle adapter with the database from the [Drizzle + D1 recipe](drizzle-d1.md). Generate
the Better Auth tables with its CLI, then keep the generated schema in the app:

```bash
npx @better-auth/cli generate
```

```ts
// src/auth.server.ts — server-only
import type { EnvReader } from "ramonyx";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { database } from "./db.server.ts";
import * as schema from "./schema.ts";

export function authFor(env: EnvReader) {
  const secret = env.get("BETTER_AUTH_SECRET");
  if (secret === undefined || secret.length < 32) {
    throw new Error("BETTER_AUTH_SECRET wajib diisi (minimal 32 karakter)");
  }
  return betterAuth({
    baseURL: env.get("BETTER_AUTH_URL") ?? "http://localhost:3000",
    secret,
    emailAndPassword: { enabled: true },
    database: drizzleAdapter(database(env), {
      provider: "sqlite",
      schema,
    }),
    trustedOrigins: [env.get("APP_ORIGIN") ?? "http://localhost:3000"],
  });
}
```

`BETTER_AUTH_SECRET` must come from a binding/secret store. In production use a randomly generated
value; never commit it.

## Mount the handler

Better Auth expects to own `/api/auth/*`. A catch-all API route forwards the original request:

```ts
// src/routes/api/auth/[...all].ts
import { route } from "ramonyx";
import { authFor } from "../../../auth.server.ts";

export const GET = route({
  handler: ({ request, env }) => authFor(env).handler(request),
});

export const POST = route({
  handler: ({ request, env }) => authFor(env).handler(request),
});
```

If the project uses a custom `src/app.ts` middleware chain instead, forward `/api/auth/*` there
before the page/API router. Do not mount Better Auth twice.

## Verify

```bash
ramonyx routes --json   # /api/auth/[...all] appears
ramonyx check --json
pnpm test
```

Executable example: [`tests/integrations/better-auth.test.ts`](../../../tests/integrations/better-auth.test.ts)
uses Better Auth's memory adapter for sign-up, session lookup, and bad-password rejection. For
production, switch to the Drizzle adapter and test against a real D1/Postgres/MySQL database.

## Limits

- Memory adapter is for tests/dev only; sessions disappear on restart.
- Better Auth's schema/migrations are owned by Better Auth; do not hand-edit generated tables
  without following its upgrade notes.
- Keep `BETTER_AUTH_SECRET` and OAuth client secrets in bindings; never expose them to client
  components.
- Set `trustedOrigins` explicitly and keep HTTPS in production.
- This recipe covers email/password plus adapter wiring. OAuth providers, email delivery,
  organization/roles, and UI remain application choices.
