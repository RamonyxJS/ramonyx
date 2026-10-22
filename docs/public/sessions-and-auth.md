# Sessions & Auth

Ramonyx ships **auth primitives**, not a turnkey user-management product: safe cookies, HMAC
signing, password hashing, server-side session stores, and CSRF protection. OAuth providers,
authorization models, and production user storage remain application concerns.

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

## Password hashing

```ts
import { hashPassword, verifyPassword } from "@ramonyx/security";

const stored = await hashPassword("correct horse battery staple");
const valid = await verifyPassword(candidate, stored);
```

The default encoding is `pbkdf2-sha256$<iterations>$<salt>$<hash>` with a random salt and 210,000
iterations. Always return the same generic error for an unknown user and a wrong password, and
store the hash string (not the password) in your user store.

## Sessions

`createSession()` supports two modes:

- **Stateless** (default): the signed cookie contains the JSON data. Suitable for small,
  non-secret data. Signed data is **not encrypted**.
- **Store-backed**: the cookie contains only a signed session ID; data lives in a
  `SessionStore`. This enables rotation and server-side revocation.

```ts
import { createMemorySessionStore, createSession } from "@ramonyx/security";

const session = createSession({
  secret: env.get("SESSION_SECRET")!,
  store: createMemorySessionStore(), // use KV/Redis/DB in production
  cookie: { secure: true },
});

// read
const data = await session.read(request); // SessionData | null

// login: new ID (fixation protection) + fresh cookie
const cookie = await session.rotate(request, { user: "rina" });

// logout: delete the store record + expire cookie
const cleared = await session.revoke(request);
```

`commit()` creates a session without rotating an existing ID. On login, prefer `rotate()` so a
pre-login session ID cannot be reused (session fixation). `read()` rejects invalid signatures,
malformed data, and expired store records. The in-memory store is for development/tests; use a
shared store for multi-instance production.

Action results can return `headers`; `set-cookie` headers are applied to the re-render.

## CSRF

```ts
import { csrfProtection } from "@ramonyx/security";

export default [csrfProtection({ secure: true })];
```

Double-submit cookie:
- a safe request issues a token cookie when missing;
- JavaScript sends it in `x-csrf-token`;
- no-JS forms send the same token in a hidden `_csrf` field;
- state-changing requests without a matching token get `403`.

For a no-JS form, read the active token in the loader from the internal request header:

```ts
import { CSRF_REQUEST_HEADER } from "@ramonyx/security";

export async function loader({ request }) {
  return { csrfToken: request.headers.get(CSRF_REQUEST_HEADER) ?? "" };
}
```

```tsx
<form method="post">
  <input type="hidden" name="_csrf" value={data.csrfToken} />
  {/* fields */}
</form>
```

The active token is copied onto the request for action re-renders, so forms rendered after a
mutation remain valid. Form-field verification reads a clone of the request body; the action still
receives the original body.

## Reference flow

`apps/playground/src/routes/sesi` is an end-to-end reference: PBKDF2 password hashes, an in-memory
user/session store, login/logout/register, session rotation, CSRF for JS and no-JS forms, and a
basic rate limit. The tests cover both JavaScript and native form flows.

## Limitations (honest)

- Signed cookies are not encrypted; do not put secrets in stateless session data.
- The built-in session store is in-memory; production deployments need a shared store and a
  secret-rotation strategy.
- No OAuth providers, production user store, password reset, email verification, or authorization
  model is included.
- Rate limits are per-process in this implementation; use a shared limiter or edge gateway for
  horizontally scaled deployments.
