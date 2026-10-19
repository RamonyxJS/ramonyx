# For Agents

Agents get a machine-readable view of Ramonyx that is generated from **public** documentation only:

- [`llms.txt`](https://ramonyxjs.github.io/ramonyx/machine/llms.txt) — index of the public docs and
  machine files.
- [`llms-full.txt`](https://ramonyxjs.github.io/ramonyx/machine/llms-full.txt) — the same content in
  one file.
- `machine/features.json` — feature status, packages, evidence, and honest limitations.
- `machine/rules.json` — rules for writing apps with good/bad examples.
- `machine/adrs.json` — public architecture decisions (one-line decisions + relations).
- `machine/stats.json` — the single source of truth for numbers (version, packages, tests).
- `machine/api.json`, `machine/cli.json`, `machine/config.schema.json` — extracted API/CLI/config
  references.

## MCP server (stdio)

The docs are also available as an MCP server with five tools — `search_docs`, `get_page`,
`get_feature_status`, `get_rules`, `list_adrs`:

```bash
# Claude Code
claude mcp add ramonyx-docs -- npx -y @ramonyx/mcp-docs-server
```

```json
// Cursor: .cursor/mcp.json
{
  "mcpServers": {
    "ramonyx-docs": { "command": "npx", "args": ["-y", "@ramonyx/mcp-docs-server"] }
  }
}
```

```json
// OpenCode: opencode.json
{
  "mcp": {
    "ramonyx-docs": {
      "type": "local",
      "command": ["npx", "-y", "@ramonyx/mcp-docs-server"],
      "enabled": true
    }
  }
}
```

The server ships a **snapshot of the public docs** at release time, so it works without cloning the
repo. Inside the repository you can point it at the working tree:

```bash
node --import ./tools/register.mjs packages/mcp-docs-server/src/cli.ts --docs docs/public
```

## Ground rules for agents

1. **Facts over guesses.** Feature status comes from `features.json`; numbers from `stats.json`.
2. **Check the limitations field.** Features marked `partial`/`experimental` have documented gaps.
3. **Prefer the public contract.** If something is not in the public docs, do not assume it exists.
4. **Every claim needs evidence.** The machine layer links code/test/ADR paths; follow them.
