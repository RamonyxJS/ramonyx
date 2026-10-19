---
adr: 0041
title: "`apps/create-app` — Scaffolder Aplikasi"
visibility: internal
---

# ADR-0041: `apps/create-app` — Scaffolder Aplikasi

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: BLUEPRINT §9 (tooling DX), ADR-0039 (rilis; publikasi npm menunggu keputusan pemilik)

## Konteks

Sejak Phase 1, "apps/create-app" tercatat sebagai non-blocker. Tanpa scaffolder, pengguna baru
harus menyalin playground (terlalu besar: ssr/react/bundler/compiler) atau merangkai sendiri
`createHandler` + adapter. Publikasi npm resmi masih menunggu kredensial pemilik, sehingga
scaffolder v1 harus berguna **di dalam repo** tanpa menunggu publish.

## Keputusan

- **`apps/create-app`** (workspace, `private`): CLI + `template/`.
  - CLI hanya memakai Node builtins; arg `[dir]`, `--force/-f`, `--help/-h`; direktori tidak
    kosong ditolak kecuali `--force`.
  - Copy rekursif + ganti placeholder `__APP_NAME__`; `template/gitignore` di-rename menjadi
    `.gitignore` saat copy.
  - Dipanggil `pnpm create:app <dir>` (lewat loader dev).
- **Template app minimal yang benar-benar berjalan**:
  - `ramonyx.config.ts` (`defineConfig`), `src/app.ts` (`createHandler`: halaman HTML, API
    `json`, demo `HttpError` 403), `src/main.ts` (`createNodeHost` + `resolveConfig`),
    `README.md`, `.gitignore`;
  - dependensi: `ramonyx`, `@ramonyx/server`, `@ramonyx/adapter-runtime` (`^0.1.0` — menunjuk
    artefak rilis npm bila publikasi dilakukan);
  - TS dijalankan Node ≥ 24 (type stripping untuk berkas aplikasi sendiri).
- **Bukti dalam CI**: test men-scaffold ke dalam repo lalu menjalankan **smoke handler**
  (`createApp()` + request langsung) — template tervalidasi terhadap paket workspace, bukan
  sekadar daftar berkas.

## Bukti

- 4 test (`apps/create-app/test/create-app.test.ts`): struktur + placeholder terganti (tanpa
  sisa `__APP_NAME__` di berkas mana pun); direktori tidak kosong ditolak tanpa `--force` dan
  berhasil dengan `--force` (berkas lama tidak dihapus); **smoke app hasil scaffold**
  (200 JSON, halaman HTML, 403, 404); `--help`.
- `pnpm typecheck` menyertakan template (route generik + config valid terhadap sumber workspace).
- `pnpm test` menjadi **122 tes**; lint/typecheck bersih.

## Batasan yang dicatat jujur

- **Belum dipublikasikan** (`private: true`): pemakaian saat ini `pnpm create:app <dir>` dari
  repo; `pnpm create ramonyx-app` menunggu keputusan publikasi npm (ADR-0039).
- Template v1 **tanpa SSR React/hydration/dev-server Vite** (petunjuk lanjutan ditulis di
  komentar `src/app.ts`); satu template saja (tanpa `--template`).
- Tidak menjalankan `pnpm install` otomatis — langkah dicetak manual.

## Alternatif yang ditolak

- **Menyalin playground**: membawa serta ssr/react/bundler/compiler dan puluhan berkas —
  bertentangan dengan tujuan "starting point minimal".
- **Menunggu paket npm terbit lalu baru membuat scaffolder**: menunda DX tanpa alasan; v1
  in-repo sudah memberi nilai dan siap dipromosikan menjadi paket npx saat rilis disetujui.

## Konsekuensi

- Pengguna baru mendapat titik awal yang berjalan dalam < 1 menit (tanpa membaca contoh besar).
- Non-blocker tersisa: **apps/docs** (docs site) dan keputusan publikasi npm.

## Diperbarui (2026-10-18): Template v2 — File Routing + SSR React + Hydration

Template ditingkatkan dari "halaman HTML manual" ke konvensi yang sama dengan playground:

- **File routing** (`@ramonyx/compiler`): `src/routes/page.tsx` (loader + komponen React),
  `layout.tsx`, `src/routes/api/**` (`export const GET = route({ ... })`);
- **Hydration**: `createPageRoutes({ client: { script: "/assets/client.js" } })` + `build.ts`
  (`@ramonyx/bundler`/Vite) → `dist/client/client.js`; middleware template menyajikan `/assets/*`
  (guard traversal);
- Middleware `securityHeaders()` + `cspNonce()` ikut di template; alur: `pnpm build` → `pnpm start`.

Bukti tambahan: test **mem-build klien sungguhan** lalu menyajikan aset (200 `text/javascript`,
traversal 404); smoke SSR memeriksa konten, payload `window.__RAMONYX__`, dan
`<script src="/assets/client.js">`; **verifikasi browser** (chrome-devtools) pada app hasil
scaffold: klik counter → `Klik saya: 1` (hydration bekerja), payload ada.
