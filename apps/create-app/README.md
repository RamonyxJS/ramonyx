# create-ramonyx-app

Scaffold a Ramonyx app with SSR React, hydration, and file routing.

```bash
pnpm create ramonyx-app my-app
# or
pnpm dlx create-ramonyx-app my-app
```

Then `cd my-app && pnpm install && pnpm dev`.

## Templates

```bash
pnpm create ramonyx-app my-app --template api-auth
pnpm create ramonyx-app my-app --template cloudflare
pnpm create ramonyx-app my-app --template docs-blog
```

| Id | Shape |
| --- | --- |
| `minimal` (default) | Welcome screen, SSR + hydration, API route, form action |
| `api-auth` | Session login/logout, protected API, server action |
| `cloudflare` | Worker artifact, R2 + KV binding example, `wrangler.toml` |
| `docs-blog` | Blog index, dynamic posts with `getStaticPaths`, static export |

Run `--list-templates` to print the current list. Templates are starting points, not audited
production systems; replace demo stores/secrets and review the deployment notes.

Add `--with-agent-docs` to include `AGENTS.md` and `.opencode/skills/ramonyx/SKILL.md`.

Docs: https://ramonyx.devmoon.net/docs/templates
Repository: https://github.com/RamonyxJS/ramonyx
License: MIT
