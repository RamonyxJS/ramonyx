# Security Overview

Ramonyx is designed to be **secure by default**: limits apply before your code runs, and security
primitives ship in the framework instead of being copy-pasted between apps.

> This page describes mitigations, not guarantees. Security claims without executable tests are not
> made (see the repository's evidence policy). Report vulnerabilities privately via
> [SECURITY.md](https://github.com/RamonyxJS/ramonyx/blob/main/SECURITY.md).

## Defaults that apply to every app

| Control | Default |
| --- | --- |
| Request body limit | 1 MiB → `413` (checked before routing, including streamed bodies) |
| Handler/loader/render timeout | 10 s → `503`, with `request.signal` aborted |
| Concurrent requests | 100 → `503` + `Retry-After` (load shedding) |
| SSR document size | 2 MiB → `500` |
| Client bundle boundary | `node:*` imports and `*.server.ts` modules are rejected/stubbed at build time |

All limits are configurable per app (`createHandler({ maxBodyBytes, timeoutMs, maxConcurrent })`).

## Security primitives

```ts
import {
  cspNonce,
  csrfProtection,
  rateLimit,
  securityHeaders,
} from "@ramonyx/security";

export default [
  securityHeaders(),        // CSP (with nonce), nosniff, referrer policy, frame-ancestors
  cspNonce(),               // per-request nonce injected into the hydration payload
  csrfProtection(),         // double-submit cookie (Web Crypto random token, constant-time compare)
  rateLimit({ limit: 120, windowSeconds: 60 }),  // per client; identity from the adapter
];
```

- **CSP nonce** — the nonce travels with the hydration payload, so inline scripts carry the same
  nonce the policy allows. No `'unsafe-inline'` for scripts.
- **CSRF** — double-submit cookie + header, signed with Web Crypto; compare in constant time.
  `trustProxy` is opt-in, so a spoofed `X-Forwarded-For` cannot evade rate limits by default.
- **Sessions** — cookie parsing/serialization with safe defaults (HttpOnly, SameSite=Lax, Secure),
  HMAC-signed values, and a small session helper (`read/commit/clear`).
- **Outbound fetch** — `guardedFetch` (from `@ramonyx/security/ssrf`) rejects private/loopback/
  link-local targets, validates every redirect hop, and **pins the resolved IP** so DNS rebinding
  cannot redirect a connection to an internal address.
- **Input validation** — Standard Schema at the trust boundary (params, query, body, form); invalid
  input returns `400` with field-level `issues` before your handler runs.
- **Output safety** — React escaping everywhere; raw HTML requires an explicit
  `dangerouslySetInnerHTML`; server errors never leak stack traces in production.

## Server/client boundary

Server-only code belongs in `*.server.ts` modules. The build:

1. rejects `node:*` imports in page/layout modules (with a message pointing at the file),
2. replaces `*.server.ts` imports in the **client** bundle with a poison-pill stub,
3. scans the client output for leaked Node built-ins.

A secret placed in a plain shared module can still reach the client — keep secrets in
`*.server.ts` or server-only loaders and pass only what the UI needs.

## Runtime (experimental)

The Rust/V8 runtime is experimental. Its permission model is **deny-all by default**
(`--allow-read|write|net|env` opt-in), with worker/process isolation, resource quotas, and an
OS-level sandbox (Landlock) for plugins. It is not part of the production promise yet.

## Dependency & supply chain

- Lockfile committed; `pnpm audit --audit-level high` in CI and weekly.
- New versions must be at least **24 hours old** before adoption (`minimumReleaseAge`), reducing
  exposure to compromised fresh releases.
- npm releases are published from **verified tarballs** with **provenance** (build → verify →
  publish), guarded by tag↔version checks.

## Limitations (honest)

- Rate limiting and load shedding are process-local; multi-instance deployments need a shared
  store.
- CSP is wired through `@ramonyx/security`; if you replace it, you own the policy.
- CSRF protection is a random double-submit cookie (not session-bound) plus the hidden `_csrf`
  field for no-JS forms. It relies on same-site cookies; do not share a registrable domain with
  untrusted subdomains, or bind tokens to the session in a custom middleware.
- **No independent third-party security audit has been commissioned.** An internal review with
  findings and residual risk is published in [Security review & audit status](audit.md).
