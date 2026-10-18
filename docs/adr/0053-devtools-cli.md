# ADR-0053: CLI `ramonyx` — `@ramonyx/devtools` v1

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: architecture (baris `packages/devtools` "belum dibuat"), ADR-0041 (template), ADR-0052 (ekspor)

## Konteks

Sampai sekarang setiap aplikasi Ramonyx menulis boilerplate sendiri: `build.ts` (bundler klien)
dan `src/main.ts` (server bootstrap) — duplikasi di playground, docs, dan template
`create-ramonyx-app`. Arsitektur sudah lama menyebut `packages/devtools` (CLI, dev server,
diagnostics) tetapi belum dibuat. Ini gap DX terbesar untuk pengguna alpha.

## Keputusan

- **Paket `@ramonyx/devtools`** dengan bin **`ramonyx`** (shebang dipertahankan saat tsc;
  staging rilis memetakan `bin: ./src/cli.ts` → `./dist/cli.js`).
- **Konvensi aplikasi** (menggantikan boilerplate):
  - `src/app.ts` mengekspor `createApp(options?)` → `FetchHandler`;
  - `src/routes` (file routing, tidak berubah);
  - `ramonyx.config.ts` (opsional; default `resolveConfig({})`).
- **Perintah v1**:
  - `ramonyx dev` — Vite + HMR (default :5173) → SSR; `importer` module graph + `reloadManifests`
    (pola yang sama dengan playground dev, kini tersedia untuk semua aplikasi);
  - `ramonyx build` — `loadPageRoutes` + `buildClient` → `dist/client`;
  - `ramonyx start` — server produksi; **`NODE_ENV=production` di-set CLI sebelum mengimpor
    aplikasi** (React build produksi dijamin, tanpa env prefix di skrip); peringatan bila
    `dist/client` belum dibangun;
  - `ramonyx doctor` — diagnostik: versi CLI/Node, appDir, config (file + nilai), `src/app.ts`,
    jumlah halaman, status `dist/client`;
  - `ramonyx version` / `help`.
- **Pemuatan berkas pengguna tanpa flag**: CLI memanggil `register("@ramonyx/compiler/register")`
  secara programatik (hook `node:module`) sebelum `import()` dinamis `src/app.ts` /
  `ramonyx.config.ts` — sehingga `pnpm exec ramonyx …` bekerja dengan Node polos (tanpa
  `--import`), termasuk berkas `.tsx` pengguna.
- **Template `create-ramonyx-app` dirombak ke konvensi CLI**: `src/app.ts` menerima opsi
  (`clientScript`/`clientModules`/`importer`/`reloadManifests`/`strictValidation`/`streaming`);
  `build.ts` + `src/main.ts` dihapus; skrip menjadi `ramonyx dev|build|start`; dependensi
  template menambah `@ramonyx/devtools` (bundler/adapter kini transitif).
- **`verify-release`** memahami skrip `ramonyx …` (resolusi bin `node_modules/.bin` naik ke
  direktori induk) sehingga verifikasi end-to-end tetap berjalan dengan alur CLI.

## Bukti

- Test `packages/devtools/test/cli.test.ts` (3): help/version/perintah tak dikenal; doctor
  (config port 0, `src/app.ts ada`, `1 halaman`, `dist/client belum dibangun`, flag `--app`);
  start (URL dari log, `NODE_ENV=production`, `clientScript=/assets/client.js`).
- Test `create-app` (5) berjalan di atas template baru — build klien lewat `ramonyx build`.
- **`pnpm release:verify`** (konsumen tarball bersih): scaffold → `ramonyx build` → `ramonyx start`
  → SSR halaman + runtime ✓ — alur CLI terbukti dari artefak rilis.
- Staging rilis: `@ramonyx/devtools` → `bin: { ramonyx: "./dist/cli.js" }`, shebang terjaga;
  total artefak npm kini **14 paket** (+ binary runtime = 15 artefak).
- **161 test Node** hijau (dari 158), lint/typecheck bersih.

## Batasan yang dicatat jujur

- CLI v1 **tanpa** watch/rebuild otomatis untuk produksi, tanpa `--host` khusus (host dari
  config), tanpa template/plugin scaffolding; `dev` mengandalkan Vite (sesuai ADR-0005).
- Konvensi `src/app.ts` mengikat nama berkas; aplikasi eksisting (playground/docs) tetap memakai
  entry mereka sendiri (bukan migrasi paksa).
- Paket `@ramonyx/devtools` terbit pada rilis berikutnya (0.1.1); template npm 0.1.0 yang sudah
  terbit masih memakai skrip lama sampai rilis itu.

## Alternatif yang ditolak

- **Bin di paket meta `ramonyx`**: mencampur API runtime dengan tooling; `packages/devtools`
  sudah disepakati di arsitektur.
- **Loader lewat skrip (`node --import …`)**: pengguna harus menghafal flag; register programatik
  membuat `pnpm exec ramonyx` setara tooling framework lain.
- **Migrasi playground/docs ke CLI sekarang**: keduanya punya kebutuhan khusus (docs export,
  playground e2e) — evaluasi terpisah, tidak memblokir v1.

## Konsekuensi

- Aplikasi baru tanpa boilerplate: tiga skrip + satu konvensi; `doctor` mempercepat diagnosis.
- Rilis berikutnya membawa CLI ke pengguna; kandidat lanjutan: `ramonyx doctor` lebih dalam
  (runtime Rust tersedia?), watch mode, dan `--host/--open`.
