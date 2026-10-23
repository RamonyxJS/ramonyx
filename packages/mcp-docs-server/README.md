# @ramonyx/mcp-docs-server

MCP docs server (stdio) — tools agen untuk membaca docs/machine + docs/** Ramonyx.

Part of the Ramonyx framework. Requires Node.js 24 or newer and ESM.

## Install

```bash
npm install @ramonyx/mcp-docs-server
```

Run the stdio server with `ramonyx-mcp-docs` and point your MCP client at it. For project-aware
tools, pass the app directory:

```bash
ramonyx-mcp-docs --app .
```

Docs-only tools: `search_docs`, `get_page`, `get_feature_status`, `get_rules`, `list_adrs`.
Project mode adds `get_project_context`, `list_routes`, `get_route`, `get_recipe`, `search_api`,
plus `ramonyx://project/manifest`. The project scan is static (no user code executes).

## Documentation

- [Ramonyx docs](https://ramonyx.devmoon.net/docs/for-agents)
- [Repository](https://github.com/RamonyxJS/ramonyx)
- [Issues](https://github.com/RamonyxJS/ramonyx/issues)

## License

MIT
