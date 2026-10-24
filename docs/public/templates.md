# Templates

`create-ramonyx-app` ships four starting points. They share the same file-routing, SSR, security,
and deployment model; each adds a different production-shaped slice.

```bash
pnpm create ramonyx-app my-app --template api-auth
# or in this repository:
pnpm create:app my-app --template api-auth
```

`--list-templates` prints the current list. `minimal` is the default.

| Template | Use it for | Verify |
| --- | --- | --- |
| `minimal` | First app, SSR + hydration + API + form action | `pnpm dev`, `pnpm build` |
| `api-auth` | Server-side session login/logout, protected API, server action | in-process auth test |
| `cloudflare` | R2 + KV bindings, Worker artifact, `wrangler.toml` | `pnpm build:edge` |
| `docs-blog` | Blog/docs pages, dynamic posts, static export | `pnpm build:static` |

## api-auth

Includes `src/lib/auth.server.ts`, a login server action, `GET /api/me`, and
`POST /api/auth/logout`.

```bash
cd my-app
pnpm install
pnpm dev
```

Demo credentials are `demo` / `demo-password-123`. Before production:

- set a random `SESSION_SECRET` (32+ characters);
- replace the in-memory user/session stores with database/KV adapters;
- add CSRF protection and login rate limiting;
- use HTTPS so the `Secure` session cookie is sent;
- or use the [Better Auth recipe](recipes/better-auth.md) for a full auth provider.

## cloudflare

Includes a real R2 + KV API, an HTML overview, and `wrangler.toml`. Bindings are not available in
the Node dev server; use the Worker runtime or Miniflare for those routes.

```bash
cd my-app
pnpm install
pnpm dlx wrangler kv namespace create KV_STORE
pnpm dlx wrangler r2 bucket create my-app-files
pnpm dlx wrangler secret put STORAGE_TOKEN
# edit wrangler.toml with the namespace id
pnpm deploy
```

`pnpm build:edge` produces `dist/edge/index.js`; `pnpm deploy` builds and runs `wrangler deploy`.
The storage API requires `Authorization: Bearer <STORAGE_TOKEN>`. See
[R2 + KV](recipes/cloudflare-r2-kv.md) for upload/download details and limits.

## docs-blog

Includes a typed post list, `/blog/[slug]` with `getStaticPaths()`, and a static export script.

```bash
cd my-app
pnpm install
pnpm dev
pnpm build:static   # dist/static
```

Deploy `dist/static` to Cloudflare Pages/Workers Assets, GitHub Pages, or any static host. Replace
`src/data/posts.ts` with Markdown/files or a CMS when you need a content workflow.

## Deploy matrix

| Target | Command | Output |
| --- | --- | --- |
| Node server | `pnpm build && pnpm start` | `dist/client` + SSR on the configured port |
| Static | `pnpm build:static` | `dist/static` |
| Cloudflare Worker | `pnpm deploy` (cloudflare template) | `dist/edge/index.js` + assets |
| Vercel Edge | `ramonyx build --target vercel` | `dist/vercel` fetch handler |
| Deno Deploy | `ramonyx build --target deno` | `dist/deno` fetch handler |

The Vercel/Deno presets are emitted by the CLI; wire the platform's project settings to the output
directory and provide the same env/bindings your app reads.

## Support level

Templates are maintained starting points, not audited production systems or vendor compatibility
guarantees. Review the generated code, replace demo stores and secrets, and verify the target
platform before exposing real traffic. Every template has a smoke test in the repository; the
`cloudflare` and `docs-blog` templates additionally exercise edge/static builds in CI.
