# Architecture

Ramonyx is a Node.js-first framework with an experimental Rust/V8 runtime. This page describes the
public architecture: how a request flows, what the packages do, and where the boundaries are.

## Request lifecycle

```
Request
  → runtime host (Node adapter)
  → server: body/timeout/concurrency gates
  → global middleware (security headers, CSP nonce, rate limit, logging)
  → router (API routes + page routes, 404/405)
  → folder middleware (root → deepest)
  → loader (GET) / action (POST)
  → render (React: sync or stream)
  → hydration payload + HTML document
Response
```

## Layers

| Layer | Responsibility |
| --- | --- |
| **Framework** | routing, SSR, server actions, data loading, client navigation, security defaults |
| **Compiler/bundler** | route manifest, codegen (client entry, typed routes, edge entry), Vite builds |
| **Runtime** | Node.js (baseline) or the experimental Rust/V8 host |
| **System** | OS, TCP/TLS, filesystem, process |

## Packages

| Package | Role |
| --- | --- |
| `ramonyx` | meta package re-exporting common primitives |
| `@ramonyx/core` | request lifecycle, context, middleware, errors, cache, i18n, assets types |
| `@ramonyx/router` | route matching, params, 404/405 |
| `@ramonyx/server` | HTTP wiring, limits, rate limit, observability |
| `@ramonyx/schema` | Standard Schema validation + error mapping |
| `@ramonyx/adapter-runtime` | runtime contract, Node + in-memory hosts, static serving |
| `@ramonyx/ssr` | page rendering, streaming, SEO helpers, locale routing |
| `@ramonyx/react` | React renderer, `Image`, `Link` |
| `@ramonyx/compiler` | page/API manifests, codegen, dev loader |
| `@ramonyx/bundler` | Vite builds, dev server, assets, plugins |
| `@ramonyx/security` | headers, CSP, CSRF, rate limit, cookies/sessions, SSRF guard |
| `@ramonyx/testing` | in-memory test server |
| `@ramonyx/devtools` | the `ramonyx` CLI |
| `@ramonyx/mcp-docs-server` | MCP server over stdio for agents |
| `@ramonyx/plugin-image` | build-time image variants (optional `sharp`) |

## Server ↔ client boundary

- Page/layout modules are isomorphic; loaders and actions are server-only.
- `*.server.ts` modules are stubbed with a poison pill in the client bundle.
- The build rejects `node:*` imports in client modules and scans the output for leaks.
- Secrets belong in `*.server.ts` or server-only loaders; only UI data goes into the hydration
  payload (JSON-serializable).

## Runtime contract

`@ramonyx/core` defines the web-standard boundary used by every host:

```ts
export type FetchHandler = (request: Request) => Promise<Response>;

export interface RuntimeHost {
  readonly name: string;                    // "node" | "memory" | "ramonyx"
  serve(handler: FetchHandler, options: { port: number; host?: string }): Promise<RunningServer>;
  readonly env: { get(name: string): string | undefined };
}
```

The Node adapter and the in-memory test host implement it; the experimental Rust/V8 runtime targets
the same contract (compatibility suite). The framework does not depend on runtime internals.

## Rendering & deployment targets

- **Node**: SSR + hydration + soft navigation; streaming opt-in.
- **Static**: prerendered pages + assets (`ramonyx build --static`).
- **Edge**: a single `{ fetch }` artifact with statically imported routes and an inlined asset map
  (CI exercises it in workerd).

See [Routing](routing.md), [SSR & Hydration](ssr-hydration.md), and [Deployment](deployment.md).
