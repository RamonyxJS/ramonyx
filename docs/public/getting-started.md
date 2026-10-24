# Getting Started

Build a full-stack TypeScript app with file routing, SSR React, and secure defaults. Ramonyx runs
on **Node.js ≥ 24**; the Rust/V8 runtime is experimental.

```bash
npm create ramonyx-app@latest my-app
cd my-app
npm install
npm run dev     # Vite + SSR (http://localhost:3000, one port)
```

Open <http://localhost:3000>. The scaffold ships with a page, an API route, validation, actions,
security middleware, and hydration — all runnable.

## Package managers

All four tested managers work with the same generated app. Pick one; do not mix lockfiles.

| Manager | Create | Install | Dev |
| --- | --- | --- | --- |
| npm | `npm create ramonyx-app@latest my-app` | `npm install` | `npm run dev` |
| pnpm | `pnpm create ramonyx-app@latest my-app` | `pnpm install` | `pnpm dev` |
| Yarn | `yarn create ramonyx-app my-app` | `yarn` | `yarn dev` |
| Bun | `bun create ramonyx-app my-app` | `bun install` | `bun run dev` |

`npm run build && npm start` (or `pnpm build && pnpm start`, `yarn build && yarn start`,
`bun run build && bun run start`) produces and serves the production build.

### pnpm stale-scaffold note

pnpm may reuse an old `create-ramonyx-app` from its cache and scaffold a **1.x** app even with
`@latest`. Check before installing:

```bash
node -p "require('./package.json').dependencies['@ramonyx/devtools']"
# expected: ^2.0.1
```

If it prints `^1.0.0`, remove the directory and pin the scaffold version exactly:

```bash
pnpm create ramonyx-app@2.0.1 my-app
```

You can also use `pnpm dlx --package create-ramonyx-app@2.0.1 create-ramonyx-app my-app`.
A 1.x app still runs, but its dev server uses the removed two-port proxy (`5173` → `3000`); it is
not a 2.x single-port app. Pick a production-shaped starting point with
`--template api-auth`, `cloudflare`, or `docs-blog`; see [Templates](templates.md).

`ramonyx` is a project-local binary. For a one-off command use `pnpm exec ramonyx …`,
`bunx ramonyx …`, or `npx ramonyx …`; a bare `ramonyx` is not on the shell `PATH`.

## Project layout

```
src/app.ts             createApp() → fetch handler (API + pages + middleware)
src/server.ts          optional custom server entry (CLI still hosts it)
src/routes/            file routing
  page.tsx             route "/"
  layout.tsx           root layout
  [...slug]/page.tsx   404 page (metadata.status = 404)
  middleware.ts        per-folder middleware (root = every route)
  api/halo/[nama].ts   dynamic API route
ramonyx.config.ts      app/server options (optional)
```

## A page with a loader

`src/routes/page.tsx` is an isomorphic module: `loader` runs on the server, the component renders
on the server and then hydrates in the browser.

```tsx
import type { PageProps } from "@ramonyx/react";

export const metadata = { title: "Home", description: "My first app" };

export async function loader() {
  return { message: "Hello from the server" };
}

export default function Home({ data }: PageProps<{ message: string }>) {
  return <h1>{data.message}</h1>;
}
```

Loader data must be JSON-serializable (it is embedded in the hydration payload). For
filesystem/database access, use a `*.server.ts` module — the client bundle gets a poison-pill stub
instead of your secrets.

## An API route with validation

`src/routes/api/halo/[nama].ts`:

```ts
import { route } from "ramonyx";
import type { StandardSchema } from "@ramonyx/schema";

const params: StandardSchema<unknown, { nama: string }> = {
  "~standard": {
    version: 1,
    vendor: "my-app",
    validate: (value) =>
      typeof (value as Record<string, unknown>)?.nama === "string"
        ? { value: { nama: (value as { nama: string }).nama } }
        : { issues: [{ message: "nama wajib", path: ["nama"] }] },
  },
};

export const GET = route<{ nama: string }>({
  params,
  handler: ({ params, json }) => json({ hello: params.nama }),
});
```

Invalid input returns `400` with `issues` before your handler runs.

## A form action

```tsx
export async function action({ formData }: { formData: FormData }) {
  const name = String(formData.get("name") ?? "").trim();
  if (name.length === 0) return { errors: { name: "Required" } };
  return { message: `Hello, ${name}!` };
}
```

The runtime re-renders the page with the action result, and the browser intercepts submission so
it works without a page reload — while still working with JavaScript disabled (progressive
enhancement, `POST` + `303` PRG).

## Build & deploy

```bash
ramonyx build             # client bundle → dist/client
ramonyx start             # production SSR (NODE_ENV=production)
ramonyx build --static    # prerender → dist/static (host anywhere)
ramonyx build --target edge   # dist/edge/index.js ({ fetch } contract)
```

See [Deployment](deployment.md) for details, and [Routing](routing.md) /
[SSR & Hydration](ssr-hydration.md) for the runtime model.
