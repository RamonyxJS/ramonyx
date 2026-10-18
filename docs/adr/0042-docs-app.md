# ADR-0042: `apps/docs` — Situs Dokumentasi (Dogfood SSR React)

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: BLUEPRINT §9 (tooling DX), ADR-0003 (adapter React), ADR-0013/0014 (security middleware)

## Konteks

Dokumentasi proyek hidup sebagai markdown di repo (`docs/BLUEPRINT.md`, `docs/architecture.md`,
`docs/api/core-contract.md`, `docs/adr/*`, `docs/roadmap/*`, `docs/security/*`) — lengkap tetapi
tidak nyaman dibaca berurutan di editor. `apps/docs` tercatat sebagai non-blocker sejak roadmap
awal.

## Keputusan

- **`apps/docs` adalah aplikasi Ramonyx biasa** (dogfood), bukan generator statis:
  - `@ramonyx/ssr` + `@ramonyx/react` merender halaman SSR; adapter Node menyajikan;
  - middleware `securityHeaders()` + `cspNonce()` aktif di situs itu sendiri (dogfood keamanan);
  - `DocumentRenderer` kustom: satu halaman HTML dengan CSS inline (tema gelap minimal).
- **Katalog dokumen** (`src/docs.ts`): memindai `docs/**/*.md` → slug (`adr/0041-create-app`),
  judul dari heading `# ` pertama.
- **Rute**:
  - `GET /` — indeks 52 dokumen (SSR);
  - `GET /dokumen/[...slug]` — halaman dokumen (catch-all router), markdown → HTML via
    **`marked`** (dependency dev untuk app privat; `minimumReleaseAge` tetap berlaku);
  - `GET /api/dokumen` — katalog JSON.
- **Guard traversal**: slug di-resolve dan wajib berada di dalam `docs/` (percobaan `../`,
  `..%2F` → 404) — situs tidak boleh membaca berkas mana pun di luar docs.
- HTML markdown dimasukkan apa adanya (`dangerouslySetInnerHTML`) dengan `biome-ignore`
  beralasan: sumbernya **repo sendiri (tepercaya)** — bukan input pengguna.

## Bukti

- 3 test (`apps/docs/test/docs.test.ts`): render markdown (heading/kode/tabel/judul),
  katalog + **guard traversal** (`readDoc("../package")` → null), smoke app: index 200
  (+ `nosniff` + CSP nonce), halaman ADR-0029 200 memuat teks heading, dokumen tak dikenal 404,
  traversal lewat URL 404, API ≥ 20 dokumen.
- `pnpm test` menjadi **125 tes**; typecheck (termasuk JSX + `@types/react`) & lint bersih.
- **Smoke server hidup**: `pnpm docs` → index 200 · halaman `adr/0041-create-app` 200 (memuat
  "Scaffolder Aplikasi") · `/api/dokumen` 200 (52 dokumen) · dokumen tak dikenal 404.

## Batasan yang dicatat jujur

- **SSR tanpa hydration**: tanpa bundle klien/soft-navigation/pencarian; `<title>` per dokumen
  masih statis ("Dokumen") karena metadata halaman bersifat statis di `createPageRoutes`.
- Indeks datar (tanpa pengelompokan per direktori); tanpa pencarian.
- `marked` adalah dependency app privat (bukan paket framework) — tidak masuk artefak rilis.
- Port default 4000 (playground tetap 3000).

## Alternatif yang ditolak

- **Generator statis terpisah**: menambah pipeline build kedua; dogfood SSR memberi bukti nyata
  framework dipakai untuk aplikasi non-playground.
- **Docusaurus/VitePress**: framework eksternal besar — bertentangan dengan semangat dogfood.
- **Renderer markdown buatan sendiri**: menulis parser penuh bukan nilai inti; `marked` kecil,
  matang, dan terkurung di app privat.

## Konsekuensi

- Semua ADR/blueprint/roadmap dapat dibaca sebagai situs dengan satu perintah (`pnpm docs`).
- Non-blocker tersisa: **publikasi npm** (keputusan pemilik) dan kandidat lanjutan (hydration
  situs docs, pencarian, pengelompokan).

## Diperbarui (2026-10-18): Hydration + Soft Navigation

Situs docs kini **dogfood penuh**: file routing (`src/routes/**`), hydration + soft navigation
klien (`build.ts` via `@ramonyx/bundler`, middleware `/assets/*`), dan script `pnpm docs`
(build + start).

Dua masalah ditemukan saat menaikkan situs ke hydration:

1. **`DocumentRenderer` kustom menjatuhkan `scripts`** — payload `window.__RAMONYX__` dan
   `<script src="/assets/client.js">` tidak pernah masuk HTML sehingga hydration mustahil.
   Renderer kini meneruskan `head`/`scripts` (perilaku `defaultDocument`).
2. **Modul halaman menarik `node:fs`** (loader membaca berkas) → bundel klien berisi impor
   Node yang ter-externalize. Solusi: **katalog browser-safe** (`src/catalog.ts`) berisi
   judul + HTML yang sudah dirender (diisi sekali oleh `app.ts` di server); modul halaman
   tetap bersih untuk bundel klien.

Selain itu, **bug klien ditemukan lewat verifikasi browser**: setelah soft navigation,
`window.__RAMONYX__` masih berisi payload halaman lama (kontrak ADR-0008 menyatakan payload =
halaman aktif). Diperbaiki di `@ramonyx/react/client` (payload diperbarui setelah tukar)
dan **dikunci e2e** (Playwright: `path` payload setelah navigasi + back/forward).

Bukti: 4 test docs (SSR payload/script, build klien memuat hydration + soft navigation, aset
200 `text/javascript`, traversal 404) dan e2e Playground **5/5 hijau**; verifikasi browser pada
situs docs: penanda JS bertahan saat klik dokumen (tanpa full reload), `payloadPath` berubah
ke `/dokumen/[...slug]`, konten dokumen tampil.
