# Typed Routes

`ramonyx build` and `ramonyx dev` generate `.ramonyx/routes.ts` from your page manifest. Use it to
make route paths and params type-safe at compile time.

## Generated module

```ts
// .ramonyx/routes.ts (generated — do not edit)
export type RouteParamsMap = {
  "/": undefined;
  "/users": undefined;
  "/users/[id]": { id: string };
  "/blog/[...slug]": { slug: string };
};

export function routeHref<P extends keyof RouteParamsMap>(
  path: P,
  ...args: RouteParamsMap[P] extends undefined ? [] : [params: RouteParamsMap[P]]
): string;

export const Link = createLink<RouteParamsMap>();
```

The template and playground map `#routes` to the generated file in both TypeScript and Node
(`package.json#imports`), so use the stable alias:

```tsx
import { Link, routeHref } from "#routes";

routeHref("/users");                    // "/users"
routeHref("/users/[id]", { id: "42" }); // "/users/42"
<Link href="/users/[id]" params={{ id: "42" }}>User 42</Link>;
```

Wrong paths, missing dynamic params, or params on a static route fail at type-check time. The
generated file is refreshed on `ramonyx dev` and `ramonyx build` — no manual step. Existing apps
can add the same `#routes` mapping; the generated module is app-local, so it cannot be shipped as
a fixed package path.

## `Link` component

`Link` from `@ramonyx/react/link` renders an `<a>` and uses the client navigation/prefetch path.
For typed routes, use the generated `Link` above (it calls `createLink` and fills params). The
low-level `createLink` is exported if you need a custom route map.

```tsx
import { createLink } from "@ramonyx/react/link";

const Link = createLink<{ "/": undefined; "/users/[id]": { id: string } }>();
<Link href="/users/[id]" params={{ id: "42" }}>User 42</Link>;
```

## Notes

- The module only exists after the first `build`/`dev` run.
- Use the `#routes` alias from the template; it is configured for TypeScript and Node/Vite.
- The params map follows the file router: `[param]` → required single segment, `[...param]` → rest.
- Custom codegen? The manifest is the source; `generateRouteTypes(pages)` is exported from
  `@ramonyx/compiler` if you need it in another tool.
