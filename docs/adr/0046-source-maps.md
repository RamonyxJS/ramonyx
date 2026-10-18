# ADR-0046: Source Map Produksi (Client Bundle + Paket npm)

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: audit implementasi (`docs/IMPLEMENTATION_STATUS.md` §2/§4/§10), ADR-0005/0007/0039

## Konteks

Audit menemukan gap: `buildClient` tidak mengaktifkan `build.sourcemap`, dan paket npm hasil
`build-packages.mjs` di-emit dengan `sourceMap: false`. Akibatnya error produksi (browser
maupun konsumen npm) menunjuk ke bundel/JS hasil kompilasi tanpa jalur kembali ke sumber TS.

## Keputusan

- **Client bundle (framework apps)**: `buildClient` menambah opsi `sourcemap` dengan **default
  `true`** → Vite menulis `client.js.map`. Middleware aset (`/assets/*`) sudah menyajikan `.map`
  (content-type `application/json`), jadi lokalisasi error browser langsung berfungsi.
- **Paket npm (rilis)**: tsconfig yang digenerate `build-packages.mjs` memakai
  `sourceMap: true` + **`inlineSources: true`** — sumber TS ikut tertanam di map sehingga tetap
  berguna walau `src/` tidak dikirim di tarball. `files: ["dist", ...]` otomatis membawa
  `*.js.map`.
- **Verifikasi rilis diperkuat**: `verify-release.mjs` memeriksa
  `node_modules/@ramonyx/server/dist/index.js.map` ada **dan** memuat `sourcesContent` (selain
  smoke yang sudah ada).
- `declarationMap` tetap **false**: map deklarasi akan menunjuk `../src/*.ts` yang tidak
  dikirim; menghindari map setengah berguna.

## Bukti

- Build playground: `pnpm build` → `apps/playground/dist/client/client.js.map` ada,
  **19 sumber** dengan `sourcesContent` (termasuk sumber app TSX dan vendor React).
- Asersi test: `apps/create-app/test/create-app.test.ts` dan `apps/docs/test/docs.test.ts`
  kini memeriksa `.map` + `sourcesContent` (10/10 test terkait lulus).
- Rilis: `pnpm release` (13 artefak) → tarball paket memuat `*.js.map`;
  `pnpm release:verify` lulus termasuk pemeriksaan source map (`✓ npm: source map (1 sumber)`).

## Batasan yang dicatat jujur

- Minify masih **off** di `buildClient` (default lama); dengan minify off, map "hidden vs
  public" belum menjadi isu — bila minify dinyalakan, evaluasi `sourcemap: "hidden"` + unggah
  map terpisah agar tidak membocorkan sumber di produksi publik.
- Map menambah ukuran artefak (contoh playground: `client.js` 577 KB + `.map` 1.0 MB) — untuk
  produksi nyata, sajikan map hanya saat diperlukan/terautentikasi.
- Map paket npm per-berkas (tsc), bukan bundled.

## Alternatif yang ditolak

- **`declarationMap: true`**: menunjuk `../src` yang tidak dikirim → tautan mati.
- **Source map hanya di dev**: menghilangkan kemampuan mendiagnosis error produksi — justru itu
  kebutuhan yang dicatat audit.
- **Mengirim folder `src/` di tarball**: memperbesar paket dan membuka sumber yang tidak perlu;
  `inlineSources` cukup.

## Konsekuensi

- Error produksi (browser & konsumen npm) dapat dipetakan kembali ke sumber TS.
- Ukuran artefak bertambah (didokumentasikan); kebijakan "hidden map" menjadi pekerjaan lanjutan
  bila minify/redaksi diaktifkan.
