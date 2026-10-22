# Ramonyx skill

Use this skill when working in a Ramonyx application.

## Workflow

1. Read `AGENTS.md` and the relevant page module under `src/routes/`.
2. Keep reads in `loader` and mutations in `action`; validate at trust boundaries.
3. Run `pnpm typecheck` and the relevant tests before claiming a change works.
4. For framework questions, query the Ramonyx docs (MCP `search_docs` / `get_page`) instead of
   guessing APIs.

## Safety

- Never put secrets in client components, loader payloads, or stateless signed cookies.
- Preserve CSRF and security-header middleware.
- Prefer the in-memory dev adapters only for local work; production multi-instance needs shared
  session/rate-limit/cache adapters.
