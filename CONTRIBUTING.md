# Contributing

Thanks for your interest in Ramonyx. The project is early-stage (alpha) — the most valuable
contributions right now are **bug reports with reproductions**, documentation fixes, and focused
patches. For anything architectural, please open an issue first.

## Setup

- **Node.js ≥ 24** and **pnpm** (`corepack enable`). The Rust toolchain (pinned via
  `rust-toolchain.toml`) is only needed for `runtime/` work.
- `pnpm install` — installs the workspace (apps + packages + benchmarks).

```bash
pnpm dev          # Vite (5173) + HMR → SSR (3000), playground app
pnpm test         # Node test runner (packages/apps/tests/benchmarks)
pnpm lint         # Biome
pnpm typecheck    # tsc --noEmit
pnpm test:e2e     # Playwright against a production build (needs a browser)
pnpm docs         # docs site (full dogfood: SSR + hydration)
pnpm docs:validate  # machine-readable docs gate (run when docs/ changes)
```

## Conventions (enforced in CI)

- **TypeScript strict, ESM-only, erasable syntax** — no `enum`, `namespace`, parameter properties
  or `import =` (`erasableSyntaxOnly` + `verbatimModuleSyntax`). Packages are executed by Node's
  type stripping directly from `./src/*.ts` (source-first `exports`).
- **`node:*` imports are restricted**: `@ramonyx/core`, `router`, `schema`, `server`, `testing`
  and `ramonyx` must stay edge-safe; Node-only code lives in packages like `adapter-runtime`,
  `compiler`, `bundler`, `devtools`, `mcp-docs-server`, `plugin-image` (lint-enforced).
- **Framework packages contain no JSX** (they run under plain Node). Apps and tests may use JSX
  via the repo loader (`node --import ./tools/register.mjs`).
- **Facts live in `docs/machine/`** (the single source of truth for numbers/status): update the
  JSON entries and run `pnpm docs:generate` / `pnpm docs:validate` instead of typing numbers into
  prose. Every claim needs evidence (a code/test/ADR path that exists).
- **Language**: internal docs are Indonesian; public-facing text (README, npm package READMEs,
  error messages, this file) is English.
- **Tests**: `node:test`; test servers must `close()` in `finally`. Browser-level behavior belongs
  in `apps/playground/e2e/`.

## Pull requests

- One logical change per PR; conventional-ish, scoped subjects (`feat(ssr): …`, `fix(cli): …`),
  referencing ADRs or TODO ids where relevant.
- Run the gates before pushing: `pnpm lint && pnpm typecheck && pnpm test` (plus
  `pnpm docs:validate` and `pnpm test:e2e` when relevant). CI runs: lint → typecheck → test →
  build → e2e → security checks (+ workerd edge smoke, docs validation, Rust fmt/clippy/test).
- Architectural decisions need an ADR in `docs/adr/` (add it to the index in
  `docs/adr/README.md`) and a `docs/machine/adrs.json` entry.
- Never leave CI red: fix forward in a follow-up commit if a gate fails after pushing.

## Security

Please report vulnerabilities privately — see [SECURITY.md](SECURITY.md).

## Releases

Maintainers only; see [docs/releasing.md](docs/internal/releasing.md). Releases are cut from **verified
tarballs** with npm **provenance** (`pnpm release` → `pnpm release:verify` → tag → workflow).
