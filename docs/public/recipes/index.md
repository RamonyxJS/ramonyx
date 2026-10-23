# Recipes

Short, task-oriented guides for agents and humans. Each recipe has a stable id, the files it
touches, and a verification command; the machine-readable index is
`machine/recipes.json`.

| Task | Recipe | Verify |
| --- | --- | --- |
| Server-rendered page with data | [Add a page with a loader](page-loader.md) | `ramonyx check --json` |
| URL params and catch-all | [Add a dynamic route](dynamic-route.md) | `ramonyx routes --json` |
| Form mutation with progressive enhancement | [Handle a form with a server action](form-action.md) | `ramonyx check --json` |
| JSON endpoint with validation | [Add an API route with validation](api-validation.md) | `ramonyx routes --json` |
| SQLite persistence on Cloudflare | [Use Drizzle with Cloudflare D1](drizzle-d1.md) | `pnpm test` |
| Email/password + sessions | [Add Better Auth to an API route](better-auth.md) | `pnpm test` |
| Login/logout and protected pages | [Add session auth](auth-session.md) | `ramonyx check --json` |
| Loader caching + invalidation | [Cache loader data and invalidate it](cache-revalidate.md) | `ramonyx check --json` |
| In-process route tests | [Test a route in-process](testing.md) | `pnpm test` |
| Static/edge deployment | [Deploy static or edge output](deploy-static-edge.md) | `ramonyx build --static` |

## Use with an agent

```bash
ramonyx routes --json     # current page/API map
ramonyx check --json      # stable diagnostics + docs links
```

MCP clients can call `get_recipe` (project mode) or `get_page` with these slugs. Prefer the public
docs over guessing; if a recipe does not fit, start from [Routing](../routing.md) and
[SSR & Hydration](../ssr-hydration.md).
