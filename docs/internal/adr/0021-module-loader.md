---
adr: 0021
title: "Module Loader ESM + Transpile TypeScript (R1)"
visibility: internal
---

# ADR-0021: Module Loader ESM + Transpile TypeScript (R1)

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: ADR-0020 (deno_core), BLUEPRINT §3 (R1: module resolution, error reporting)

## Konteks

R1-lite hanya menjalankan script (tanpa `import`). R1 membutuhkan module loader dan — karena
entry aplikasi adalah TypeScript — transform TS sebelum eksekusi.

## Keputusan

- **Module loader file-based** (`FileModuleLoader` di `js-engine`):
  - resolusi relatif terhadap referrer (`./x`, `../x`) memakai `resolve_import` bawaan deno_core;
  - **fallback ekstensi** untuk import tanpa ekstensi: `.js` → `.mjs` → `.ts` → `.tsx`, lalu
    `index.{js,mjs,ts,tsx}` untuk direktori;
  - **bare specifier (paket npm) ditolak dengan pesan jelas** sampai resolusi `node_modules`
    dibangun — bukan ditebak diam-diam. Ini sisa R1 (package compatibility).
- **Transpile TypeScript via `deno_ast` (=0.53.3, fitur `transpiling`)** — versi sama dengan
  dev-dependency deno_core 0.412 agar API contoh resminya valid. `MediaType` menentukan
  transpile/tidak (JS/MJS/CJS langsung; TS/TSX/MTS/CTS ditranspile, source map disimpan in-memory).
- **Routing ekstensi di CLI**: `.js/.mjs/.ts/.tsx/.mts` → modul ESM; `.cjs/.cts` → script mode;
  lainnya → error jelas.
- **Runtime tokio current-thread di dalam `Engine`** (bukan `#[tokio::main]`) supaya CLI tetap
  sinkron dan runtime tetap dapat dipakai sebagai library.
- Verification end-to-end: `math.ts` (fungsi bertipe) diimpor `main.ts` (import relatif berekstensi
  `.ts`) → `console.log` dari V8; error V8/loader → exit 1 + log terstruktur.

## Alternatif yang ditolak

- **Transpile via esbuild/Node** — menambah ketergantungan runtime Rust pada toolchain Node;
  blueprint menegaskan transform sebelum eksekusi, bukan oleh siapa (deno_ast menjaga runtime mandiri).
- **Stripping tipe buatan sendiri** — parser TS penuh bukan prioritas; deno_ast sudah teruji di ekosistem Deno.
- **Dukungan bare specifier sekarang** — resolusi `node_modules` (exports/conditions) adalah pekerjaan
  tersendiri; menebak akan melanggar disiplin klaim.

## Konsekuensi

- Build pertama menambah swc/deno_ast (~3 menit; cache `target/` penting, CI memakai rust-cache).
- Import JSON/WASM belum didukung (error jelas).
- Dynamic import (`import()`) mengikuti mekanisme loader yang sama; permission/cancellation menyusul R2/R3.
