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
```

Import it with a **relative path** (there is no `#routes` alias yet):

```tsx
import { routeHref } from "../.ramonyx/routes.ts";

routeHref("/users");                  // "/users"
routeHref("/users/[id]", { id: "42" }); // "/users/42"
```

Wrong paths or missing params fail at type-check time. The generated file is refreshed on
`ramonyx dev` and `ramonyx build` — no manual step.

## `Link` component

`Link` from `@ramonyx/react/link` renders an `<a>` and uses the client navigation/prefetch path:

```tsx
import { Link } from "@ramonyx/react/link";

<Link href={routeHref("/users/[id]", { id: "42" })}>User 42</Link>;
```

`href` is a plain string; use `routeHref` to build it safely.

## Notes

- The module only exists after the first `build`/`dev` run.
- Import by relative path from your app code; a path alias is a candidate for a future release.
- The params map follows the file router: `[param]` → required single segment, `[...param]` → rest.
- Custom codegen? The manifest is the source; `generateRouteTypes(pages)` is exported from
  `@ramonyx/compiler` if you need it in another tool.
