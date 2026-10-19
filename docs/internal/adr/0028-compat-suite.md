---
adr: 0028
title: "Compatibility Suite v1 — Pipeline Framework di Runtime"
visibility: internal
---

# ADR-0028: Compatibility Suite v1 — Pipeline Framework di Runtime

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: BLUEPRINT §9 (exit criteria Phase 4: "framework demo berjalan di runtime alpha dan
  lulus subset compatibility tests"), ADR-0021/0026/0027

## Konteks

Runtime kini punya ESM + TypeScript + `node_modules` + web basics. Langkah pertama exit criteria
Phase 4 adalah menjalankan **kode framework nyata** (bukan fixture mainan) di runtime.

## Keputusan

- **Fixture compatibility**: `tests/compatibility/fixtures/route-pipeline.mjs` mengimpor paket
  workspace asli (`@ramonyx/core`, `@ramonyx/router`, `@ramonyx/schema`, `@ramonyx/server`) dan
  menjalankan pipeline `createHandler` penuh: matching parameter, validasi params (400),
  validasi output, `HttpError` (403), dan 404.
- **Runner**: test integrasi Rust (`runtime/crates/js-engine/tests/compat_framework.rs`) — mesin
  dijalankan dengan `Permissions::allow_all()` (membaca repo), fixture diverifikasi lewat
  `globalThis.__compat`.
- **Temuan penting (dan perbaikan)**: resolusi `node_modules` **harus canonicalize** path hasil
  resolve. Tanpa itu, symlink workspace pnpm membuat `@ramonyx/core` ter-resolve lewat dua jalur
  berbeda → modul dimuat dua kali → `HttpError` dari handler tidak dikenali `instanceof` di server
  → 403 berubah jadi 500. Resolver (relatif & bare) kini men-canonicalize sebelum membuat
  `ModuleSpecifier` — meniru perilaku Node (`preserveSymlinks=false`).
- **Bukti**: fixture lulus di runtime Rust; `cargo test` menjalankannya otomatis (CI Rust job).

## Batasan yang dicatat jujur (belum diklaim)

- **SSR/react belum**: `@ramonyx/react` & react-dom adalah **CommonJS** → butuh interop CJS
  (item berikutnya).
  > **Diperbarui (ADR-0029):** interop CJS v1 selesai — **SSR React (`react` +
  > `react-dom/server.browser`) sudah berjalan di runtime** (fixture `react-ssr.mjs`).
- **fetch/ReadableStream belum**: ssr/security penuh (dan test yang memakai fetch) belum bisa.
- Body request di runtime masih `null` (streaming request belum) — pipeline diuji untuk jalur
  GET/params/query; POST body menyusul.
- Ini **subset** compatibility, bukan klaim "runtime mendukung semua package npm".

## Alternatif yang ditolak

- Fixture tiruan (mock) alih-alih paket asli — tidak membuktikan apa pun untuk exit criteria.
- Menjalankan lewat Node sebagai pembanding dulu — sudah menjadi baseline (test Node hijau);
  fokus di sini adalah runtime.

## Konsekuensi

- Menjalankan suite ini men-transpile sumber framework (deno_ast) → ±10 detik; wajar untuk CI.
- Dedupe symlink adalah perilaku wajib resolver ke depan (diuji lewat scenario `HttpError`).
- Checklist exit criteria Phase 4 bergerak: pipeline subset ✅; demo SSR/browser + compatibility
  luas menunggu interop CJS & fetch.
