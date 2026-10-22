# Sessions & Auth

Ramonyx ships **auth primitives**, not a turnkey user-management product: safe cookies, HMAC
signing, password hashing, user-store contracts/adapters, one-time reset/verification tokens,
OAuth/OIDC authorization-code + PKCE, role/permission authorization, server-side session stores,
and CSRF protection. Email delivery, provider-specific quirks, and account UI remain application
concerns.

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

## User store

`UserStore` is the persistence contract for account data. The reference implementations are:

- `createMemoryUserStore()` — development/tests only.
- `createKeyValueUserStore(store)` — any `KeyValueStore` (Redis/KV/cache). It keeps username and
  email indexes; **the unique-index check is best-effort**, so a database with real unique
  constraints remains the right choice under concurrent registration.

```ts
import { createKeyValueUserStore } from "@ramonyx/security";

const users = createKeyValueUserStore(store);
const user = await users.create({ username: "rina", email: "rina@example.test" });
await users.update(user.id, { emailVerified: true });
```

A SQL adapter only needs to implement five methods: `getById`, `getByUsername`, `getByEmail`,
`create`, `update`, and `delete`. A minimal migration for a relational database:

```sql
CREATE TABLE users (
  id            text PRIMARY KEY,
  username      text NOT NULL UNIQUE,
  email         text UNIQUE,
  password_hash text,
  email_verified boolean NOT NULL DEFAULT false,
  roles         text[] NOT NULL DEFAULT '{user}'
);
CREATE UNIQUE INDEX users_username_lower ON users (lower(username));
CREATE UNIQUE INDEX users_email_lower ON users (lower(email)) WHERE email IS NOT NULL;
```

Normalize usernames/emails before storing them. Never expose password hashes in serializers.

## Password reset and email verification

`createAuthTokens({ store })` issues cryptographically random, **one-time** tokens. Only a
SHA-256 hash is stored, with a TTL; consuming deletes the record atomically from the application's
point of view.

```ts
import { createAuthTokens, createMemoryStore } from "@ramonyx/security";

const tokens = createAuthTokens({ store: createMemoryStore() });
const raw = await tokens.issue(user.id, "reset", 15 * 60);
const userId = await tokens.consume(raw, "reset"); // string | null
```

Rules for the application flow:

- Return the **same generic response** whether the account exists or not.
- Send the raw token by email; never put it in logs, URLs indexed by search engines, or responses.
- Apply `rateLimit()` to request/consume endpoints and use a short TTL (for example 15 minutes).
- On reset, rotate/revoke active sessions and hash the new password with `hashPassword()`.
- Mark `emailVerified` only after consuming a `"verify"` token; do not trust a query-string email.

The reference HTTP tests cover generic reset responses, one-time use, password replacement, and
one-time email verification (`packages/security/test/auth-flow.test.ts`).

## OAuth / OIDC

`createOAuthClient()` implements the authorization-code flow with PKCE (S256), `state`, and a
`nonce`. It is provider-agnostic and fetches JSON; inject `fetch` in tests.

```ts
import { createOAuthClient, createOAuthAccountLinker } from "@ramonyx/security";

const oauth = createOAuthClient({
  clientId: env.get("OAUTH_CLIENT_ID")!,
  clientSecret: env.get("OAUTH_CLIENT_SECRET"),
  authorizationEndpoint: "https://provider.example/authorize",
  tokenEndpoint: "https://provider.example/token",
  userInfoEndpoint: "https://provider.example/userinfo",
  redirectUri: "https://app.example/auth/callback",
  scopes: ["openid", "email"],
});

const authorization = await oauth.authorize();
// store authorization.state, authorization.nonce, authorization.codeVerifier in the session
```

On callback:

1. Compare the returned `state` with the stored value (constant-time comparison is preferred).
2. Exchange the code with `oauth.exchange(code, storedCodeVerifier)`.
3. If an ID token is present, validate its signature/issuer/audience/nonce with your provider's
   JWKS and OIDC library; this package deliberately does not embed a JWKS cache.
4. Link the external identity with `createOAuthAccountLinker({ store, users }).link(profile)`.

Account linking only auto-links an existing account by email when the provider asserts
`emailVerified === true`. Unverified email claims are not stored. Unlinking removes the
provider+subject link and leaves the local user intact. Provider callback URLs must be registered
exactly (scheme, host, path) and secrets must come from env/bindings. OAuth errors returned to the
browser are generic; log provider details server-side without tokens or authorization codes.

## Authorization

Authorization is deny-by-default and works for route middleware and action bodies:

```ts
import { authorizationGuard, createAuthorization } from "@ramonyx/security";

const authz = createAuthorization({
  roles: {
    admin: ["user:manage", "audit:read"],
    user: ["post:read"],
  },
});

export const middleware = authorizationGuard({
  authorization: authz,
  permission: "user:manage",
  subject: ({ request }) => sessionSubject(await readSession(request)),
});
```

Denied routes get a generic `403`; the default audit path logs permission + path (no PII). In an
action, either call `authz.assert(subject, "user:manage")` before mutating or wrap the action with
`authorizedAction()`:

```ts
import { authorizedAction } from "@ramonyx/security";

export const action = authorizedAction(
  {
    authorization: authz,
    permission: "user:manage",
    subject: async ({ request }) => sessionSubject(await readSession(request)),
    audit: ({ permission }) => metrics.increment("authz.denied", { permission }),
  },
  async ({ params }) => {
    await users.delete(params.id);
    return { message: "deleted" };
  },
);
```

Map `AuthorizationError` to the same generic response. Direct permissions are combined with role
grants; an unknown role or a missing subject grants nothing. Migrate from manual checks by
centralizing the role → permission table and passing a subject built from the server-side session,
never from request JSON.

## Sessions

`createSession()` supports two modes:

- **Stateless** (default): the signed cookie contains the JSON data. Suitable for small,
  non-secret data. Signed data is **not encrypted**.
- **Store-backed**: the cookie contains only a signed session ID; data lives in a
  `SessionStore`. This enables rotation and server-side revocation.
  `createKeyValueSessionStore(store)` adapts any `KeyValueStore` (Redis/KV/cache) to this
  contract.

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

Rate limiting can share the same `KeyValueStore` via `rateLimit({ store })`; `increment` is used
for atomic fixed-window counters. See [State & Adapters](state-and-adapters.md) for lifecycle and
failure-mode guidance.

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
- The default session/user stores are in-memory; production deployments need shared stores and a
  secret-rotation strategy. The KeyValue user adapter's unique indexes are best-effort; use real
  database constraints under concurrent registration.
- Reset/verification email delivery and account UI are application concerns. Tokens are hashed and
  one-time, but the app must add generic responses, rate limits, and session revocation.
- OAuth/OIDC ID-token signature, issuer, audience, and nonce validation is delegated to the
  application/OIDC library; state and PKCE verifiers must be stored server-side per attempt.
- Authorization is a primitive, not a policy database or admin UI. Audit events must still be
  shipped to your logging/metrics backend.
- Rate limits are per-process unless a shared store with atomic `increment` is supplied.
