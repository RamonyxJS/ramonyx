# CLI Reference

The `ramonyx` CLI (from `@ramonyx/devtools`) runs the app: dev server, build, production start, and
diagnostics.

```bash
ramonyx dev              # Vite + HMR (default :5173) → SSR (port from config)
ramonyx build            # client bundle → dist/client (run before production start)
ramonyx build --static   # client bundle + prerender pages → dist/static
ramonyx build --target edge   # server/edge bundle → dist/edge ({ fetch } contract)
ramonyx build --watch    # rebuild on file changes (covers --static/--target)
ramonyx start            # production SSR (NODE_ENV=production)
ramonyx start --watch    # restart the server when src/** changes
ramonyx add <name> --registry <path|url>  # verified plugin install + lock
ramonyx remove <name>    # remove plugin + lock entry
ramonyx doctor           # config + routes + build diagnostics
ramonyx version | help
```

## Flags

| Flag | Applies to | Meaning |
| --- | --- | --- |
| `--app <dir>` | all | App directory (default: cwd) |
| `--config <path>` | all | Config path (default `<app>/ramonyx.config.ts`) |
| `--port <n>` | dev/start | Override the SSR port |
| `--dev-port <n>` | dev | Override the Vite port (default 5173) |
| `--static` | build | Prerender static routes (`getStaticPaths` for dynamic routes) → `dist/static` |
| `--target <name>` | build | Extra target; `edge` → `dist/edge` |
| `--watch` | build/start | Build: rebuild on changes (debounced, safe queue). Start: restart a supervised server process with clean shutdown. |
| `--registry <path\|url>` | add/remove | Plugin registry JSON (or `RAMONYX_PLUGIN_REGISTRY`) |
| `--public-key <path>` | add | Ed25519 public key PEM (or `RAMONYX_PLUGIN_PUBLIC_KEY`) |

## Conventions

```
src/app.ts             export createApp(options?) → FetchHandler
src/server.ts          optional custom server entry (CLI still hosts it)
src/routes/            page.tsx / layout.tsx / error.tsx + api/*.ts
ramonyx.config.ts      default export { app?, server? } (optional)
```

- `ramonyx dev|start` prefers `src/server.ts` when present, otherwise `src/app.ts`.
- Plugins from `ramonyx.config.ts` are loaded by the CLI (Vite, middleware, hooks, assets).
- `ramonyx start` sets `NODE_ENV=production` if unset; reactivity/React production build depends on it.
- `start --watch` is a supervisor: the server runs in a child process so changed modules are not
  cached; SIGINT/SIGTERM stops both watcher and child. Rebuild the client separately when client
  sources change.
- `--static` and `--target edge` cannot be combined (different artifacts).

## Examples

```bash
# Local development with HMR
ramonyx dev --app examples/shop

# Production build + start on port 8080
ramonyx build --app examples/shop
ramonyx start --app examples/shop --port 8080

# Static export and edge artifact
ramonyx build --static --app examples/shop
ramonyx build --target edge --app examples/shop
ramonyx build --watch --app examples/shop
```

## Doctor

`ramonyx doctor` prints the CLI/Node versions, resolved config, whether `src/app.ts` exists, the
number of pages, and whether `dist/client` has a manifest. Use it before filing an issue.

## Devtools

`ramonyx dev` also prints the devtools panel URL (`/__ramonyx/devtools`). See
[Devtools Panel](devtools.md).
