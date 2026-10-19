# Typed Routes

`ramonyx build` dan `ramonyx dev` menulis **`.ramonyx/routes.ts`** — modul nyata berisi peta
rute beserta `routeHref` bertipe. Kesalahan pola/nama param tertangkap saat **typecheck**,
bukan runtime. Keputusan desain: ADR-0073.

## Cara pakai

1. Jalankan `ramonyx build` (atau `dev`) sekali — modul digenerate otomatis.
2. Impor dari modul generate (path relatif; sesuaikan kedalaman folder):

```ts
// src/routes/users/page.tsx → ../../../.ramonyx/routes.ts
import { routeHref } from "../../../.ramonyx/routes.ts";

routeHref("/users/[id]", { id: "42" });    // "/users/42" ✓
routeHref("/users/[id]", { salah: "42" }); // ✗ error typecheck
routeHref("/tidak-ada");                    // ✗ error typecheck
```

3. Tautan dengan navigasi klien + prefetch:

```tsx
import { Link } from "@ramonyx/react/link";
import { routeHref } from "../../../.ramonyx/routes.ts";

<Link href={routeHref("/users/[id]", { id: user.id })}>Profil</Link>
```

`Link` merender `<a>` biasa; soft navigation + prefetch ditangani entry klien (ADR-0008/0060) —
tanpa JS, tautan tetap bekerja sebagai navigasi normal.

## Yang digenerate

```ts
// .ramonyx/routes.ts (contoh)
import { fillHref } from "@ramonyx/router";

export type RouteParamsMap = {
  "/": undefined;
  "/users": undefined;
  "/users/[id]": { id: string };
  "/[...slug]": { slug: string };
};

export type RoutePath = keyof RouteParamsMap;

export function routeHref<P extends RoutePath>(
  path: P,
  ...args: RouteParamsMap[P] extends undefined ? [] : [params: RouteParamsMap[P]]
): string {
  return fillHref(path, args[0] as Record<string, string> | undefined);
}
```

- Rute tanpa param → `undefined` (dipanggil tanpa argumen).
- `[id]` → `{ id: string }`; `[...slug]` → `{ slug: string }` (boleh berisi `/`).
- Route group `(grup)` tidak muncul (memang tidak ada di URL).
- Modul ini ikut aturan paket (erasable, impor `.ts`) — dijalankan loader yang sama.

## Kenapa modul, bukan augmentasi `declare module`

Pendekatan `declare module "@ramonyx/router"` (augmentasi interface) **tidak merge** di
TypeScript 7 untuk modul paket di proyek yang sama (duplicate identifier) — sudah diuji.
Modul generate memberi jaminan tipe yang sama tanpa bergantung pada semantik augmentasi.

## Batasan (jujur)

- Impor memakai **path relatif** ke `.ramonyx/routes.ts` (belum ada alias `#routes`); sesuaikan
  kedalaman folder.
- `href` pada `<Link>` tetap `string` (URL konkret rute dinamis tidak bisa dienumerasi); tiping
  ketat datang dari `routeHref`.
- Tanpa build pertama, `.ramonyx/routes.ts` belum ada — pakai `<a href>` biasa.
- Belum ada: alias subpath otomatis, typed params untuk loader/action, integrasi editor.
