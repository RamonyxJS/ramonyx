# create-ramonyx-app

Scaffold a Ramonyx app with SSR React, hydration, and file routing.

```bash
npm create ramonyx-app@latest my-app
# or
pnpm create ramonyx-app@latest my-app
# or
yarn create ramonyx-app my-app
# or
bun create ramonyx-app my-app
```

Then `cd my-app` and use the same manager: `npm install && npm run dev`,
`pnpm install && pnpm dev`, `yarn && yarn dev`, or `bun install && bun run dev`.

## Templates

```bash
npm create ramonyx-app@latest my-app --template api-auth
npm create ramonyx-app@latest my-app --template cloudflare
npm create ramonyx-app@latest my-app --template docs-blog
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

## pnpm stale scaffold

pnpm can reuse an old cached `create-ramonyx-app` and scaffold a 1.x app even with `@latest`.
Check `node -p "require('./package.json').dependencies['@ramonyx/devtools']"`; if it is `^1.0.0`,
recreate with `pnpm create ramonyx-app@2.0.1 my-app` or
`pnpm dlx --package create-ramonyx-app@2.0.1 create-ramonyx-app my-app`.

Docs: https://ramonyx.devmoon.net/docs/templates
Repository: https://github.com/RamonyxJS/ramonyx
License: MIT
