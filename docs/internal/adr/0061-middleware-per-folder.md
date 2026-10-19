---
adr: 0061
title: "Middleware Per-Folder + Route Group `(grup)`"
visibility: internal
---

# ADR-0061: Middleware Per-Folder + Route Group `(grup)`

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: TODO `p1-middleware-per-route` (analisis kesenjangan §3: "Middleware: partial — hanya
  app-level; tanpa per-folder/route group")

## Konteks

Middleware hanya app-level (array di `createHandler`) sehingga proteksi per-area (mis. `/admin`)
harus dicocokkan manual di satu tempat dan mudah bocor. Framework pesaing memakai middleware
per-folder (Next `middleware.ts`) dan route group untuk organisasi tanpa segmen URL.

## Keputusan

1. **`middleware.ts` per folder** di `src/routes/**` (konvensi file yang sama dengan
   page/layout/error). File mengekspor `default [fn, ...] satisfies Middleware[]`.
   - Dikumpulkan `@ramonyx/compiler` per halaman/route API (root → terdalam, urutan eksekusi
     sama) dan dipasang pada `RouteEntry.middlewares`.
   - **Root `src/routes/middleware.ts` berlaku otomatis untuk semua rute** (halaman + API).
     Aplikasi tidak lagi meneruskannya manual ke `createHandler`.
   - `createHandler` menjalankannya **setelah pencocokan rute** (sebelum handler); dapat
     mengganti request (nonce) dan short-circuit (redirect/response langsung).
2. **Urusan pre-routing tetap global** di `createHandler` (`middleware` array): aset statis
   (`serveStatic` — perlu berjalan untuk path non-rute seperti `/assets/*`), logging global.
   Respons aset memakai `headers: { "x-content-type-options": "nosniff" }` (security header
   tidak lagi otomatis di jalur pre-routing).
3. **Route group `(grup)`**: segmen folder berpola `(...)` tidak muncul di URL (halaman, layout,
   middleware, dan route API). Direktori fisik tetap untuk organisasi.
4. **Kodegen ikut**: `generateServerEntry` (edge) mengimpor file middleware dan **menyebar**
   (`...m.default`) ke `middlewares` halaman/API; `generateClientEntry` tidak menyentuh
   middleware (bundle klien bersih).
5. **Dogfood**: playground menambah `users/middleware.ts` (header `x-area`) + halaman route group
   `(publik)/tentang`; docs/template memindahkan `serveStatic` ke `app.ts`.

## Bukti

- `packages/compiler/test/playground-pages.test.ts`: asosiasi middleware (root 1 file/2 fungsi;
  `/users` 2 file/3 fungsi) + route group (`/tentang`, direktori fisik tetap `(publik)/tentang`).
- `apps/playground/test/app.test.ts`: `/users` membawa `x-area: users`, `/` tidak; `/tentang` 200.
- `apps/create-app/test/create-app.test.ts`: smoke + static + edge (middleware root ikut di
  artefak edge — regresi spread array tertangkap dan diperbaiki).
- Suite penuh + e2e tetap hijau.

## Alternatif yang ditolak

- **Middleware dijalankan sebelum pencocokan rute (pre-routing) dengan matcher manual**:
  mengembalikan masalah pencocokan manual yang ingin dihapus; setelah pencocokan lebih tepat
  dan tetap dapat mengganti request.
- **Middleware per-halaman eksplisit di modul halaman** (`export const middlewares`): duplikasi
  per halaman; konvensi folder lebih ringkas dan konsisten dengan layout/error.
- **Mempertahankan middleware root manual** (tidak otomatis): dua jalur yang mudah tertukar;
  root otomatis + global hanya untuk pre-routing lebih jelas.

## Konsekuensi

- Proteksi per-area menjadi deklaratif per folder; route group merapikan struktur tanpa mengubah URL.
- Perubahan perilaku pra-1.0: aplikasi yang meneruskan `middleware` root manual ke `createHandler`
  kini menjalankannya **dua kali** — template/docs/playground diperbarui; dicatat di CHANGELOG.
- Sisa kandidat: matcher per-path untuk global middleware (mis. skip `/assets`), middleware pada
  layout (bukan folder), urutan lintas-group.
