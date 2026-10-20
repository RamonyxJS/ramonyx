---
adr: 0078
title: "MCP docs server: stdio, no hosting, public snapshot"
visibility: public
---

# ADR-0078: MCP Docs Server — stdio, No Hosting

- Status: Public summary (the full decision record lives in the internal log)
- Date: 2026-10-19

## Context

Agents need structured access to the docs. A hosted MCP server adds hosting, uptime, and
maintenance. The protocol is JSON-RPC over stdio, and the needed surface is small (search, page
read, feature status, rules, ADR index).

## Decision

1. Ship `@ramonyx/mcp-docs-server` (bin `ramonyx-mcp-docs`) running over **stdio** — the client
   launches it locally; there is no hosted service.
2. No external dependencies: a documented subset of JSON-RPC/MCP (initialize, tools, resources,
   ping). Unknown methods return `-32601`.
3. Tools: `search_docs`, `get_page`, `get_feature_status`, `get_rules`, `list_adrs`; resources expose
   the public machine files.
4. The npm package bundles a **snapshot of the public docs** at release time, so `npx` works without
   cloning the repo. The release verifier checks the snapshot and runs a protocol handshake against
   the packed tarball.
5. Reads go through an in-memory index (slug → document); no path traversal from client input.

## Consequences

- Zero hosting cost; the docs version matches the package version.
- Only public documentation is packaged; internal docs are quarantined from the release pipeline.
- HTTP/SSE transport, prompts, sampling, and batching are not supported (documented limitations).
