# Security review and audit status

> **Status:** internal review completed 2026-10-24. An independent third-party audit has **not**
> been commissioned. Nothing on this page is an independent audit result or a security guarantee.

Report vulnerabilities privately via
[SECURITY.md](https://github.com/RamonyxJS/ramonyx/blob/main/SECURITY.md).

## Scope reviewed

The internal review covered the Node/edge production baseline:

- request limits, timeouts, load shedding, and error responses;
- session cookies, CSRF, rate limiting, password/token primitives, and authorization helpers;
- SSRF guard and redirect handling;
- client/server build boundaries (`*.server.ts`, `node:*`, secret leakage);
- Cloudflare Worker artifact, R2/KV bindings, and the public docs/waitlist deployment;
- official templates (`api-auth`, `cloudflare`, `docs-blog`);
- dependency audit and supply-chain policy.

The experimental Rust/V8 runtime is **out of scope** for this review and remains experimental.

## Findings from the internal review

| ID | Severity | Status | Finding and resolution |
| --- | --- | --- | --- |
| AUD-01 | High | Fixed | The `cloudflare` template exposed R2/KV read/write without authentication. Added a required `STORAGE_TOKEN` bearer check (constant-time compare), edge test coverage, and deployment instructions. |
| AUD-02 | Medium | Fixed | Public docs described CSRF as HMAC-signed; the implementation is a random double-submit token with constant-time comparison. Corrected the docs and added the session-binding limitation. |
| AUD-03 | Medium | Fixed | `api-auth` template shipped no CSRF protection for its login/logout forms. Added `csrfProtection()`, hidden `_csrf` fields, cookie handling, and test coverage. |
| AUD-04 | Medium | Open | CSRF form-token verification clones and parses a form body in middleware, before the handler's body-limit check. Large chunked form bodies can consume memory before the limit fires. Use the header token for JSON APIs, enforce a proxy body limit, or keep CSRF form parsing off large upload routes. |
| AUD-05 | Medium | Open | Stateless sessions are signed, not encrypted, and have no server-side revocation. Password changes cannot invalidate already-issued cookies. Use a server-side `SessionStore` (KV/Redis/database) or an auth provider when revocation matters. |
| AUD-06 | Medium | Accepted | `api-auth` uses an in-memory demo user store with a fixed demo password and no login rate limit. The template is a starting point; the README lists the production replacements. |
| AUD-07 | Low | Accepted | The default CSP allows inline styles (`style-src 'unsafe-inline'`) and CSP is opt-in through middleware. Apps with a custom policy own their nonce/hash wiring. |
| AUD-08 | Low | Accepted | HSTS and HTTPS redirects are deployment responsibilities; `securityHeaders()` does not set HSTS. |
| AUD-09 | Low | Accepted | Node plugins run in-process and are trusted application code. Process/OS isolation applies to the experimental Rust runtime's plugin bridge, not Node plugins. |
| AUD-10 | Informational | Accepted | In-memory rate limits and cache/session stores are per-process. Multi-instance deployments need shared adapters or an edge gateway. |

## Evidence

Run from the repository root:

```bash
pnpm audit --audit-level high          # no known high/critical advisories at review time
pnpm test                              # unit, integration, fuzz, and compatibility suites
pnpm test:coverage                     # per-package coverage gates
pnpm test:edge                         # workerd + Miniflare R2/KV bindings
pnpm bench:security                    # abuse cases (oversized body, traversal, malformed input)
pnpm docs:no-leak                      # public export has no internal docs/secrets
```

Additionally reviewed: `tests/security/`, `packages/security/test/`, `tests/integrations/`, the
repository threat model, and the release/publish pipeline.

## Residual risks

- The internal review is not independent and does not replace a pentest or code audit.
- CSRF tokens are not bound to a user session; untrusted sibling subdomains can set cookies.
  Serve the app on a dedicated registrable domain or implement session-bound tokens.
- There is no WAF, bot protection, or shared rate limiter in the framework.
- Secrets are only as safe as the application's bindings and build boundaries; a secret placed in a
  shared (non-`*.server.ts`) module can still reach the client.
- Vendor integrations (Better Auth, Stripe, email, R2/KV, Tailwind) were tested against local
  simulators or vendor SDKs, not audited as third-party products.
- The Rust runtime's sandbox has its own internal assessment; it is not production-ready.

## Independent audit plan

Not scheduled. When commissioned, the brief should include:

1. the Node/edge threat model and the review scope above;
2. source access at a pinned commit and reproducible test commands;
3. focus on session/CSRF, SSRF, client/server boundary, Worker bindings, templates, and release
   provenance;
4. a written report with severity, reproduction, fixes, and residual risk;
5. public publication of scope, findings, and fixes after remediation.

Until that happens, treat this page as an **internal review and audit brief**, not an external
certification.
