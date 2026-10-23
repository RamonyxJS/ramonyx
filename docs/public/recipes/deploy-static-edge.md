---
recipe: deploy-static-edge
title: Deploy static or edge output
summary: Prerender static routes or build a fetch-handler bundle, then deploy the generated directory.
when: You need a CDN/static host or an edge/serverless runtime instead of a Node process.
files: dist/static, dist/edge/index.js
verify: ramonyx build --static && ramonyx build --target edge
---

# Deploy static or edge output

## Static

```bash
ramonyx build --static
# → dist/static
```

- Every static page is prerendered; dynamic routes need `getStaticPaths`.
- A catch-all page with `metadata.status = 404` becomes `404.html`.
- Upload `dist/static` to GitHub Pages, S3, Netlify, or any static host.

## Edge / serverless

```bash
ramonyx build --target edge    # → dist/edge/index.js
ramonyx build --target vercel  # → dist/vercel
ramonyx build --target deno    # → dist/deno
```

The artifact exports the standard fetch contract:

```js
export const fetch = (request, env) => handler(request);
export default { fetch };
```

- Pages, API routes, actions, middleware, and the asset map are bundled together.
- Platform bindings arrive in `env` and are exposed as `env.get(name)`.
- `node:*` imports are rejected in the edge bundle (except platform shims). Move server-only code
  behind bindings or to a Node deployment.

## Verify

```bash
ramonyx check --json
ramonyx build --static
ramonyx build --target edge
# serve dist/static locally and request / and /404.html
```

Read [Deployment](../deployment.md) and [Troubleshooting](../troubleshooting.md) for target-specific
errors (`RMX-EDGE-1`, `RMX-BUILD-*`).
