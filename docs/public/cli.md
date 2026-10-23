# CLI Reference

The `ramonyx` CLI (from `@ramonyx/devtools`) runs the app: dev server, build, production start, and
diagnostics.

`ramonyx` is installed as a **project-local** binary. Run it through your package manager:
`pnpm dev` / `bun run dev` / `npm run dev` for scripts, or `pnpm exec ramonyx …` / `bunx ramonyx …` /
`npx ramonyx …` for one-off commands. A bare `ramonyx …` only works after a global install, because
the shell does not include `node_modules/.bin`.

```bash
ramonyx dev              # Vite + HMR + SSR on one port (default :3000)
ramonyx build            # client bundle → dist/client (run before production start)
ramonyx build --static   # client bundle + prerender pages → dist/static
ramonyx build --target edge   # server/edge bundle → dist/edge ({ fetch } contract)
ramonyx build --watch    # rebuild on file changes (covers --static/--target)
ramonyx start            # production SSR (NODE_ENV=production)
ramonyx start --watch    # restart the server when src/** changes
ramonyx add <name> --registry <path|url>  # verified plugin install + lock
ramonyx remove <name>    # remove plugin + lock entry
ramonyx doctor           # config + routes + build diagnostics
ramonyx routes           # page + API route manifest
ramonyx check            # config, entry, routes, client/server boundaries
ramonyx ai init          # AGENTS.md + thin adapters + MCP config
ramonyx ai sync          # update the managed block/config without touching user prose
ramonyx version | help
```

`doctor`, `routes`, `check`, and `ai` accept `--json` for agents and CI. JSON output is stable and
does not include timestamps:

```bash
ramonyx routes --json
ramonyx check --json
ramonyx doctor --json
```

`check --json` returns diagnostics with a stable code and a troubleshooting link:

```json
{
  "schemaVersion": 1,
  "ok": false,
  "appDir": "/app",
  "summary": { "errors": 1, "warnings": 0 },
  "diagnostics": [
    {
      "code": "RMX-BUILD-1",
      "severity": "error",
      "message": "Impor \"node:fs\" di modul klien tidak diizinkan (node-builtin). ...",
      "file": "src/routes/panel/page.tsx",
      "docs": "https://ramonyx.devmoon.net/docs/troubleshooting/#rmx-build-1"
    }
  ]
}
```

## Flags

| Flag | Applies to | Meaning |
| --- | --- | --- |
| `--app <dir>` | all | App directory (default: cwd) |
| `--config <path>` | all | Config path (default `<app>/ramonyx.config.ts`) |
| `--port <n>` | dev/start | Override the dev/start port |
| `--dev-port <n>` | dev | Deprecated alias for `--port` |
| `--static` | build | Prerender static routes (`getStaticPaths` for dynamic routes) → `dist/static` |
| `--target <name>` | build | Extra target; `edge` → `dist/edge` |
| `--watch` | build/start | Build: rebuild on changes (debounced, safe queue). Start: restart a supervised server process with clean shutdown. |
| `--registry <path\|url>` | add/remove | Plugin registry JSON (or `RAMONYX_PLUGIN_REGISTRY`) |
| `--public-key <path>` | add | Ed25519 public key PEM (or `RAMONYX_PLUGIN_PUBLIC_KEY`) |
| `--agents <list>` | ai | Adapters: `claude,cursor,copilot,opencode` (default: all) |
| `--no-mcp` | ai | Do not write MCP client configuration |
| `--force` | ai | Overwrite existing files, including `AGENTS.md` without a managed marker |
| `--dry-run` | ai | Report actions without writing |
| `--json` | doctor/routes/check/ai | Machine-readable output (stable schema, no timestamps) |

## Conventions

```
src/app.ts             export createApp(options?) → FetchHandler
src/server.ts          optional custom server entry (CLI still hosts it)
src/routes/            page.tsx / layout.tsx / error.tsx + api/*.ts
ramonyx.config.ts      default export { app?, server? } (optional)
```

- `ramonyx dev` runs Vite middleware, HMR, and SSR on one port. There is no second Vite proxy port.
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

## Doctor, routes, and check

`ramonyx doctor` prints the CLI/Node versions, resolved config, the resolved entry
(`src/server.ts` or `src/app.ts`), route counts, and whether `dist/client` has a manifest. Use it
before filing an issue or before an agent starts work.

`ramonyx routes` prints the page/API manifest: path, source file, loader/action flags, API methods,
and middleware. It does not open a server. `--json` is the agent-facing form.

`ramonyx check` validates config, the server entry, page/API route exports, and client/server
boundaries. It is intentionally static and does not replace `pnpm typecheck` or `ramonyx build`.
Exit code is `1` when an error diagnostic is present. Codes are the stable `RMX-*` codes documented
in [Troubleshooting](troubleshooting.md).

## Agent setup

`ramonyx ai init` writes an `AGENTS.md` managed block from the project manifest and, optionally,
thin adapters for Claude Code, Cursor, GitHub Copilot, and OpenCode. It also writes project MCP
configs (`.mcp.json`, `.cursor/mcp.json`, `opencode.json`) with the MCP package **pinned to the
project's `ramonyx` version** — never `@latest`.

```bash
ramonyx ai init
ramonyx ai init --agents claude,cursor --dry-run
ramonyx ai sync              # refresh the managed block + MCP command
ramonyx ai sync --json       # { schemaVersion, ok, mcp, files, warnings }
```

`AGENTS.md` is canonical; `CLAUDE.md`, `.cursor/rules/ramonyx.mdc`,
`.github/copilot-instructions.md`, and `.opencode/skills/ramonyx/SKILL.md` are short pointers to it.
Files you already wrote are skipped unless `--force`; `--dry-run` writes nothing. Run
`ramonyx check --json` afterwards to verify the app itself.

## Devtools

`ramonyx dev` also prints the devtools panel URL (`/__ramonyx/devtools`). See
[Devtools Panel](devtools.md).
