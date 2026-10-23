---
recipe: auth-session
title: Add session auth
summary: Store sessions server-side, rotate the session on login, and protect a route with a guard.
when: You need login/logout and per-request user identity.
files: src/routes/login/page.tsx, src/routes/account/page.tsx, src/app.ts
verify: ramonyx check --json
---

# Add session auth

Ramonyx ships primitives; you own the account UI and email delivery. The examples below are a
minimal store-backed setup.

```ts
// src/lib/auth.server.ts
import { createKeyValueSessionStore, createSession, type KeyValueStore } from "@ramonyx/security";

export function sessionFor(store: KeyValueStore, secret: string) {
  return createSession({
    secret,
    store: createKeyValueSessionStore(store), // Redis/KV/DB in production
    cookie: { secure: true, sameSite: "lax", path: "/" },
  });
}
```

```ts
// src/routes/login/page.tsx
import { verifyPassword } from "@ramonyx/security";
import { sessionFor } from "../../lib/auth.server.ts";

export async function action({ request, env }: { request: Request; env: { get(k: string): string | undefined } }) {
  const form = await request.formData();
  const username = String(form.get("username") ?? "");
  const password = String(form.get("password") ?? "");
  const user = await db.users.findByUsername(username);
  const valid = user !== null && (await verifyPassword(password, user.passwordHash));
  if (!valid) {
    return { errors: { form: "Invalid username or password" }, status: 401 };
  }
  const session = sessionFor(store, env.get("SESSION_SECRET")!);
  const cookie = await session.rotate(request, { user: user.id }); // prevents fixation
  return { redirect: "/account", headers: { "set-cookie": cookie } };
}
```

Protect a page in its loader:

```ts
import { HttpError } from "ramonyx";
import { sessionFor } from "../../lib/auth.server.ts";

export async function loader({ request, env }: { request: Request; env: { get(k: string): string | undefined } }) {
  const session = sessionFor(store, env.get("SESSION_SECRET")!);
  const data = await session.read(request);
  if (data === null) {
    throw new HttpError(401, "Login required");
  }
  return { user: data.user };
}
```

Render a login link in `error.tsx` for `401`, or redirect in a middleware that reads the session
before calling `next()`. (Loaders cannot return a redirect; use `HttpError`/middleware.)

- Signed cookies are **not encrypted**; store only an opaque session id or non-secret data.
- Rotate on login, revoke on logout, and use the same generic error for unknown user and bad password.
- Add CSRF protection for state-changing forms (`csrfProtection()`), and rate-limit login/reset.
- In-memory stores are for development; use a shared store for multi-instance deployments.

Read [Sessions & Auth](../sessions-and-auth.md) and [State & Adapters](../state-and-adapters.md).
