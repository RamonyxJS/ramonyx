# __APP_NAME__ — API auth starter

A production-shaped starting point for session auth:

- `POST /` — login server action (progressive enhancement; no JS required)
- `GET /api/me` — current user or `401`
- `POST /api/auth/logout` — revoke the cookie
- `src/lib/auth.server.ts` — session, password verification, demo user store

## Run

```bash
pnpm install
pnpm dev
```

Demo credentials: `demo` / `demo-password-123`.

## Before production

1. Set a random `SESSION_SECRET` (32+ characters) in the environment or binding.
2. Replace `createMemoryUserStore()` with a database/KV `UserStore`; memory loses users on restart.
3. Add CSRF protection to state-changing forms, rate-limit login, and use a production auth provider
   (Better Auth is documented in the integration recipes).
4. Serve over HTTPS so the session cookie's `Secure` attribute takes effect.

The template deliberately keeps auth code in `src/lib/auth.server.ts`; never import it from a client
component.