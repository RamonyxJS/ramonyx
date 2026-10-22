# Agent guide — Ramonyx app

This project uses Ramonyx (SSR React + file routing). Read the framework docs before changing
routing, data loading, auth, or security-sensitive code.

## Commands

- `pnpm dev` — Vite HMR + SSR on the port in `ramonyx.config.ts`.
- `pnpm build` — client bundle + server build.
- `pnpm start` — production server (`NODE_ENV=production`).
- `pnpm test` — application tests.

## Project map

- `src/app.ts` — `createApp()`, middleware, security headers.
- `src/routes/**` — file routes; `page.tsx` for pages, other files for API methods.
- `src/routes/**/middleware.ts` — per-folder middleware (root → leaf).
- `ramonyx.config.ts` — server/port and app options.

## Rules

- Loaders/actions run on the server; never trust request JSON at a trust boundary — validate it.
- Mutations use a page `action` (works without JS); do not add a parallel fetch-only mutation path.
- Secrets come from env/bindings, never source or client bundles.
- Keep auth/session cookies `HttpOnly`, `Secure`, `SameSite=Lax` in production; use CSRF protection.
- Loader data must be JSON-serializable.
- Do not import server-only modules (`node:*`, database clients) into client components/islands.

For framework details, use the MCP docs server (`@ramonyx/mcp-docs-server`) or the docs site.
