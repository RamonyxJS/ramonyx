# ADR-0073: Typed Routes — Codegen `RouteParamsMap` + `routeHref` + `Link`

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: TODO `p1-typed-routes`; rencana komprehensif F5.

## Konteks

DX TypeScript adalah alasan memilih framework TS-first; pesaing memberi tipe rute ter-generate
(Next typedRoutes, Nuxt typedPages, SvelteKit `$types`). Tanpa itu, URL/params salah baru
tertangkap saat runtime.

## Keputusan

1. **Codegen modul nyata**: `generateRouteTypes(pages)` (compiler) menulis
   **`.ramonyx/routes.ts`** — berisi `RouteParamsMap` (pola → params; `[id]` → `{ id: string }`,
   `[...slug]` → `{ slug: string }`, tanpa param → `undefined`) dan `routeHref` bertipe yang
   membungkus `fillHref`. CLI menulisnya di **build** (termasuk `--watch`) dan **dev**.
2. **`fillHref(pattern, params?)`** (`@ramonyx/router`): inti runtime (memakai `fillRouteParams`
   core — satu implementasi dengan SSG/SEO). **Pivot dari rencana awal** (augmentasi
   `declare module`): diuji nyata bahwa **TS 7 tidak merge augmentasi modul paket di proyek yang
   sama** (duplicate identifier) — baik target index maupun subpath; modul generate memberi
   jaminan tipe yang sama tanpa bergantung pada semantik augmentasi. Keputusan ini dicatat di
   sini karena mengubah bentuk artefak publik (`.d.ts` augmentasi → `.ts` modul).
3. **`Link`** (`@ramonyx/react/link`, tanpa JSX): elemen `<a>` dengan passthrough atribut;
   navigasi klien + prefetch sudah global (ADR-0008/0060) — tidak ada protokol baru.
4. **Opt-in yang jujur**: file digenerate selalu, tetapi aplikasi hanya "menikmati" tiping bila
   `tsc` memuat `.ramonyx` (didokumentasikan); template tidak memaksa tsconfig.
5. **Batasan dicatat**: `href` komponen `Link` tetap `string` (URL konkret rute dinamis tidak
   bisa dienumerasi); tiping ketat lewat `routeHref`.

## Bukti

- `packages/compiler/test/playground-pages.test.ts`: output codegen (import `fillHref`, peta
  params, wrapper bertipe, catch-all, tanpa-param).
- `packages/router/test/typed-routes.test.ts`: `fillHref` runtime (termasuk catch-all + error
  param kurang) + **typecheck nyata** (fixture + `tsc` proyek terpisah: modul generate
  dikompilasi; pemakaian benar lolos; param salah & pola tak dikenal gagal).
- `packages/react/test/link.test.ts`: elemen `a` + passthrough.
- `apps/create-app/test/create-app.test.ts`: CLI menghasilkan `.ramonyx/routes.ts` di app hasil
  scaffold (peta + wrapper bertipe).
- `docs/typed-routes.md` (pemakaian, yang digenerate, batasan).

## Alternatif yang ditolak

- **Tipe rute via generik pada komponen `Link`** (href union dari pola): tidak menyelesaikan URL
  konkret untuk rute dinamis; `routeHref` + `Link` komposabel lebih jujur.
- **Augmentasi `declare module`** (rencana awal): gagal di TS 7 untuk modul paket (diuji);
  modul generate menggantikannya.
- **Menulis tipe ke `node_modules`/`src`**: `.ramonyx` (gitignored, sudah ada untuk entry) adalah
  tempat artefak generate; tidak mengotori sumber.
- **Memaksa `include` tsconfig dari CLI**: mengubah konfigurasi pengguna diam-diam; didokumentasikan
  sebagai langkah eksplisit.

## Konsekuensi

- Kesalahan rute/param tertangkap saat typecheck; `routeHref`/`Link` menjadi jalur rekomendasi.
- Sisa kandidat: typed params untuk loader/action, `Link` dengan varian aktif (aria-current),
  integrasi editor.
