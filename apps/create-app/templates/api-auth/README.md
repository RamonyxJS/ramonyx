# __APP_NAME__ — API auth starter

A production-shaped starting point for session auth:

- `POST /` — login server action (progressive enhancement; no JS required)
- `GET /api/me` — current user or `401`
- `POST /api/auth/logout` — revoke the cookie
- `src/lib/auth.server.ts` — server-side session store, password verification, demo user store
- `src/routes/middleware.ts` — security headers, CSP nonce, and CSRF (`_csrf` / `x-csrf-token`)
  - CSRF cookie is not `Secure` by default so HTTP dev works; enable `csrfProtection({ secure: true })`
    in production or terminate TLS with a Secure-only policy.

## Run

```bash
pnpm install
pnpm dev
```

Demo credentials: `demo` / `demo-password-123`.

## Before production

1. Set a random `SESSION_SECRET` (32+ characters) in the environment or binding.
2. Replace `createMemoryUserStore()` and `createMemorySessionStore()` with database/KV adapters;
   memory loses users and sessions on restart.
3. Add login rate limiting and a production auth provider (Better Auth is documented in the
   integration recipes). CSRF is enabled; JSON clients must send the cookie plus `x-csrf-token`.
4. Serve over HTTPS so the session cookie's `Secure` attribute takes effect.

The template uses a server-side session store so logout revokes the server record (not just the
cookie). It deliberately keeps auth code in `src/lib/auth.server.ts`; never import it from a client
component.