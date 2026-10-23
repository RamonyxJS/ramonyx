# Architecture Decision Records (public)

Public summaries of the decisions that shape the framework's user-facing behavior. Each page keeps
the original ADR number; the full decision records live in the repository's internal log (not part
of the public site).

| ADR | Decision |
| --- | --- |
| [0007](0007-hydration.md) | Hydration — inline payload + one client bundle |
| [0047](0047-ssr-streaming.md) | SSR streaming — opt-in, edge renderer, synchronous error pages |
| [0057](0057-server-actions.md) | Server actions — form mutations with progressive enhancement |
| [0058](0058-edge-target.md) | Edge/serverless target — one fetch handler, `node:*` rejected |
| [0066](0066-revalidate.md) | Revalidation — cache loader data, not HTML |
| [0069](0069-assets.md) | Asset pipeline — manifest + resolver instead of a custom loader |
| [0078](0078-mcp-docs-server.md) | MCP docs server — stdio, no hosting, public snapshot |
| [0081](0081-i18n.md) | i18n — primitives + locale routing, no auto-detection |
| [0083](0083-single-port-dev-server.md) | Single-port dev server — Vite middleware + HMR + SSR |
