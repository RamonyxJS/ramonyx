# Security Policy

Ramonyx is pre-1.0 (alpha). Security fixes are released for the **latest published minor
version** (currently `0.2.x`); older versions are not maintained.

## Reporting a vulnerability

**Please do not open a public issue for security problems.** Use GitHub's private vulnerability
reporting instead:

1. Go to the **Security** tab → **Report a vulnerability**
   (<https://github.com/RamonyxJS/ramonyx/security/advisories/new>).
2. Include: affected package(s) and version, a minimal reproduction, impact, and any suggested fix.

We aim to **acknowledge within 72 hours** and to ship a fix or documented mitigation as soon as
practical. Reporters who want credit are acknowledged in the advisory and the release notes.

## Scope

**In scope:** the published packages (`@ramonyx/*`, `ramonyx`, `create-ramonyx-app`), the
experimental Rust runtime (`runtime/`, `ramonyx-runtime` binaries), and the release pipeline
(verified tarballs + npm provenance, ADR-0049).

**Out of scope:** dependency vulnerabilities without a demonstrated impact on Ramonyx (still
welcome — dependencies are tracked via `pnpm audit` + Dependabot and the policy in
`docs/security/dependency-policy.md`); misconfiguration of applications built with Ramonyx;
issues that require already-compromised developer machines.

## What the project already does

- **Threat model & controls:** `docs/BLUEPRINT.md` §7, `docs/machine/security.json` (controls with
  ASVS mapping, validated in CI).
- **Dependency policy:** `docs/security/dependency-policy.md` — 24 h minimum release age,
  `pnpm audit --audit-level high` in CI + weekly, Dependabot.
- **Runtime isolation assessments:** `docs/security/` (worker/plugin isolation, pentest results
  with residual findings stated honestly).
- **Supply chain:** npm releases are published from **verified tarballs** with **provenance**
  (build → verify → publish), guarded by tag↔version checks (ADR-0039/0049).
- **Framework defaults:** body/timeout/concurrency limits, security headers + CSP nonce, CSRF,
  rate limiting, SSRF-guarded fetch (ADR-0011–0017).
