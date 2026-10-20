# Sessions & Auth Primitives

Ramonyx ships **primitives**, not a full auth product: safe cookies, HMAC-signed values, a signed
session cookie, and CSRF protection. Authentication flows (password/OAuth/etc.) stay in your app.

## Cookies

```ts
import { parseCookies, serializeCookie, expireCookie } from "@ramonyx/security";

const cookies = parseCookies(request.headers.get("cookie"));
const header = serializeCookie("theme", "dark", { path: "/", sameSite: "lax" });
```

Defaults for session cookies are safe: `path=/`, `httpOnly`, `secure`, `sameSite=lax`.
`expireCookie(name)` produces `Max-Age=0`.

## Signed values

```ts
import { signValue, verifyValue } from "@ramonyx/security";

const signed = await signValue("user-42", env.get("SESSION_SECRET")!);
const value = await verifyValue(signed, env.get("SESSION_SECRET")!); // string | null
```

HMAC-SHA256 via Web Crypto with a constant-time comparison. The secret must come from env/bindings
(never hard-coded).

## Signed session cookie

```ts
const session = createSession({ secret: env.get("SESSION_SECRET")! });

// read (loader/middleware/action)
const data = await session.read(request);   // SessionData | null

// commit (action) — returns a Set-Cookie value
const cookie = await session.commit({ user: "rina" }, { maxAgeSeconds: 3600 });

// logout
const cleared = session.clear();
```

Options: `cookieName` (default `ramonyx_session`), `maxAgeSeconds` (default 7 days), and extra cookie
attributes (`domain`, `secure: false` for local HTTP).

```ts
export async function action({ request, env }) {
  const session = createSession({ secret: env.get("SESSION_SECRET")! });
  const user = await session.read(request);
  if (user === null) return { redirect: "/login" };
  return {
    message: `Hello ${String(user.user)}`,
    headers: { "set-cookie": await session.commit({ ...user, seen: true }) },
  };
}
```

Action results can return `headers`; `set-cookie` headers are applied to the re-render.

## CSRF

```ts
import { csrfProtection } from "@ramonyx/security";

export default [csrfProtection()];
```

Double-submit cookie + header:
- the middleware issues a signed token cookie when missing;
- state-changing requests (non-GET/HEAD) must echo the token in `x-csrf-token`;
- comparison is constant-time.

Client code can read the cookie (`httpOnly: false` for the CSRF cookie) and send the header. Forms
with JavaScript use the intercepted submit path; without JavaScript, use the standard form POST.

## Limitations (honest)

- **No auth package**: no user store, password hashing, OAuth providers, or authorization model.
  Build those in your app (or an ecosystem package).
- Hidden-field CSRF verification for non-JS form flows is **not implemented** (double-submit
  header is the supported path).
- `trustProxy` for rate limiting/client identity is opt-in; set it only behind a trusted proxy.
- The session cookie holds JSON; keep it small and non-secret (store large/secret data in a store and
  keep only an id in the cookie).
