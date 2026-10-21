# Plugins

A plugin extends an app at build time (Vite), at request time (middleware), through app hooks
(observability/caching), and through the asset pipeline.

```ts
// ramonyx.config.ts
import { imageOptimizer } from "@ramonyx/plugin-image";
import { defineConfig } from "ramonyx";
import { analytics } from "./src/plugins/analytics.ts";

export default defineConfig({
  plugins: [analytics(), imageOptimizer()],
});
```

`ramonyx dev|build|start` loads plugins from the config. A custom server entry (`src/server.ts`)
still receives their hooks and is wrapped by their middleware — plugins are never duplicated.

## Writing a plugin

```ts
// src/plugins/analytics.ts
import { definePlugin } from "@ramonyx/bundler";
import type { Middleware } from "ramonyx";

const middleware: Middleware = async (context, next) => {
  const started = performance.now();
  const response = await next();
  console.log(context.request.method, new URL(context.request.url).pathname, response.status, Math.round(performance.now() - started));
  return response;
};

export const analytics = () =>
  definePlugin({
    name: "analytics",
    middleware: () => middleware,
    hooks: () => ({
      onLoaderEnd: (event) => {
        /* record loader timing */
      },
    }),
  });
```

| Hook | Runs | Typical use |
| --- | --- | --- |
| `vite` | build/dev | extra Vite plugins (CSS, fonts, aliases) |
| `middleware` | before routing | logging, headers, early blocking |
| `hooks` | request lifecycle | timing, metrics, invalidation |
| `assets` | build, per file | derived outputs (image variants) + dimensions |

`middleware` must be edge-safe (no `node:*`) if you deploy the edge artifact. Middleware runs
**before** application middleware, in plugin order.

## Asset hook

```ts
export const plugin = definePlugin({
  name: "thumbnails",
  async assets(_context, asset) {
    if (!asset.path.endsWith(".png")) return undefined;
    return {
      meta: { width: 800, height: 600 },
      outputs: [{ path: "img/hero-400.webp", data: encoded, width: 400, format: "webp" }],
    };
  },
});
```

Derived files are hashed automatically and recorded as `variants` in the manifest, so
`assets.image()` and `Image` can render them.

## Publishing a plugin

Third-party plugins live in `node_modules`, where Node does **not** strip TypeScript. Ship compiled
JavaScript:

```json
{
  "name": "ramonyx-plugin-analytics",
  "type": "module",
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
  "peerDependencies": { "@ramonyx/bundler": "^0.4.0", "ramonyx": "^0.4.0" },
  "engines": { "node": ">=24" }
}
```

- Use `peerDependencies` (not `dependencies`) so types/contracts follow the app's Ramonyx version.
- Heavy dependencies should be **optional peers** (`peerDependenciesMeta`) and imported lazily with
  a clear error — see how `@ramonyx/plugin-image` treats `sharp`.
- Test the hooks directly and in a real app (`ramonyx build|dev|start`).
- Contract stability: the plugin contract is **stable since 0.4.2**. Breaking changes follow
  semver (minor/major) with migration notes; additive optional hooks remain possible.

## Limitations (honest)

- No plugin registry or `ramonyx add` — install with your package manager.
- No per-route/per-loader plugin hooks (pre-routing middleware + app hooks only).
- Plugin order is config order; there is no explicit priority field.
