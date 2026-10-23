# For Agents

Agents get a machine-readable view of Ramonyx that is generated from **public** documentation only:

- [`llms.txt`](https://ramonyx.devmoon.net/machine/llms.txt) — index of the public docs and
  machine files.
- [`llms-full.txt`](https://ramonyx.devmoon.net/machine/llms-full.txt) — the same content in
  one file.
- `machine/features.json` — feature status, packages, evidence, and honest limitations.
- `machine/rules.json` — rules for writing apps with good/bad examples.
- `machine/adrs.json` — public decision summaries (one-line decisions + relations).
- `machine/stats.json` — the single source of truth for numbers (version, packages, tests).
- `machine/api.json`, `machine/cli.json`, `machine/config.schema.json` — extracted API/CLI/config
  references.
- `machine/recipes.json` — task recipes with stable ids, affected files, and verification commands;
  the full guides live in `recipes/` (start at [Recipes](recipes/index.md)).
- `ramonyx routes --json` / `ramonyx check --json` / `ramonyx doctor --json` — project map and
  stable diagnostics (`RMX-*` codes + troubleshooting links) from the CLI.

## Context7

- Library listing: [ramonyx_devmoon_net](https://context7.com/websites/ramonyx_devmoon_net)
- Search endpoint: `https://context7.com/api/v2/ask?siteKey=ask_89339fd8bad939f239a589fa&query=<URL-encoded question>`
  — returns documentation with source links; no API key required.

## MCP server (stdio)

The docs are also available as an MCP server. The docs-only baseline has five tools —
`search_docs`, `get_page`, `get_feature_status`, `get_rules`, `list_adrs`. Add `--app <dir>` for
project mode, which adds `get_project_context`, `list_routes`, `get_route`, `get_recipe`, and
`search_api`:

Run `ramonyx ai init` to write these configs with the package pinned to your project's `ramonyx`
version. The examples use `1.0.0`; substitute your installed version (never `@latest`).

```bash
# Claude Code (project-aware)
claude mcp add ramonyx-docs -- npx -y @ramonyx/mcp-docs-server@1.0.0 --app .
```

```json
// Cursor: .cursor/mcp.json
{
  "mcpServers": {
    "ramonyx-docs": {
      "command": "npx",
      "args": ["-y", "@ramonyx/mcp-docs-server@1.0.0", "--app", "."]
    }
  }
}
```

```json
// OpenCode: opencode.json
{
  "mcp": {
    "ramonyx-docs": {
      "type": "local",
      "command": ["npx", "-y", "@ramonyx/mcp-docs-server@1.0.0", "--app", "."],
      "enabled": true
    }
  }
}
```

The server ships a **snapshot of the public docs** at release time, so it works without cloning the
repo. Inside the repository you can point it at the working tree:

```bash
node --import ./tools/register.mjs packages/mcp-docs-server/src/cli.ts --docs docs/public --app .
```

Project mode is a **static scan**: it reads file names and exports, and does not execute your app.
Use `ramonyx routes --json` / `ramonyx check --json` when you need the validated route manifest or
diagnostics. Keep the MCP package pinned to the project's `ramonyx` version rather than `@latest`.

### HTTP transport

For hosted MCP clients, use the edge-safe HTTP handler (POST JSON-RPC):

```ts
import { createMcpHttpHandler } from "@ramonyx/mcp-docs-server";

const mcp = createMcpHttpHandler({
  token: env.get("MCP_TOKEN"),                 // optional bearer auth
  rateLimit: { limit: 60, windowMs: 60_000 },  // in-memory; use gateway for multi-instance
  maxBodyBytes: 1_048_576,
});

// In a Node/edge handler:
const response = await mcp(request);
```

The handler returns `401` for a bad/missing bearer token, `429` with `Retry-After`, `405` for
non-POST, and `202` for notifications. Put it behind TLS and your own authentication when exposed
publicly; the built-in rate limit is per process and trusts `x-forwarded-for` only behind a
controlled proxy.

### Scaffolder opt-in

`pnpm create ramonyx-app <dir> --with-agent-docs` writes `AGENTS.md` and
`.opencode/skills/ramonyx/SKILL.md` in addition to the minimal app. Without the flag, the template
contains no agent-specific files. After scaffolding (or in any existing app), run
`ramonyx ai init` to regenerate the guide from the actual route map and write MCP configs.

## Ground rules for agents

1. **Facts over guesses.** Feature status comes from `features.json`; numbers from `stats.json`.
2. **Check the limitations field.** Features marked `partial`/`experimental` have documented gaps.
3. **Prefer the public contract.** If something is not in the public docs, do not assume it exists.
4. **Every claim needs evidence.** The machine layer links code/test/ADR paths; follow them.
