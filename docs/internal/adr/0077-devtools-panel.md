---
adr: 0077
title: "Panel Devtools (dev-only) — Rute, Timing, Hydration, Bundel"
visibility: internal
---

# ADR-0077: Panel Devtools (dev-only) — Rute, Timing, Hydration, Bundel

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: TODO `p3-devtools-ui` (\"Panel devtools (rute, timing loader, hydration)\"); rencana
  komprehensif F6 (dipilih lebih dulu karena `AppHooks` ADR-0065 sudah matang).

## Konteks

`AppHooks` (ADR-0065) + middleware (ADR-0067) sudah menjadi primitif instrumentasi tunggal, dan
`ramonyx dev` (ADR-0076) kini jalur aplikasi nyata (playground/docs). Belum ada UI yang
menampilkan data ini ke pengembang — observability (ADR-0071) untuk produksi, bukan dev.

## Keputusan

1. **Kolektor di `@ramonyx/bundler`** (`createDevtoolsCollector`): `hooks` + `middleware` +
   `setRoutes`/`setAssets`/`snapshot()`. Dibuat **hanya** oleh `createDevServer` — panel tidak
   pernah ada di `ramonyx start`/produksi.
2. **Dua endpoint dev server** (dilayani Vite middleware, tidak diproksikan ke SSR):
   - `GET /__ramonyx/devtools` — halaman panel (HTML mandiri tanpa build; polling 2 dtk);
   - `GET /__ramonyx/data` — JSON `{ routes, assets, requests }`.
3. **Data nyata, bukan tebakan**:
   - request/status/durasi dari middleware kolektor (paling luar — termasuk request yang
     di-short-circuit plugin);
   - loader/render dari `onLoaderEnd`/`onRenderEnd` (korelasi aproksimasi: request terbuka
     terakhir dengan path sama — event hook tidak membawa identitas request; didokumentasikan);
   - hydration dari pemeriksaan HTML respons (`<script id=\"ramonyx-payload\">`) via
     `response.clone()` — dev-only;
   - bundel/aset dari manifest build `dist/client/ramonyx.assets.json` + ukuran berkas
     (panel tidak membangun; kosong bila belum `ramonyx build`).
4. **Wiring CLI**: `ramonyx dev` menggabungkan hook plugin + devtools (`mergeHooks`) dan menaruh
   middleware devtools sebelum middleware plugin; URL panel dicetak saat start.

## Bukti

- `packages/bundler/test/devtools.test.ts`: pencatatan request/status/durasi, deteksi hydration
  (payload/none/non-HTML), korelasi hook loader/render, batas 50 riwayat, panel HTML.
- `apps/create-app/test/create-app.test.ts`: spawn `ramonyx dev` (port SSR bebas + Vite port 0) →
  panel HTML 200, rute template `[\"/\", \"/[...slug]\"]` + berkas terdaftar, request beranda lewat
  proxy tercatat dengan `hydration: \"payload\"` dan `ms` angka.
- `docs/devtools.md` (pemakaian, data, batasan jujur) + `docs/plugins.md` entry kustom.

## Alternatif yang ditolak

- **Paket npm baru `@ramonyx/devtools-ui`**: satu paket untuk panel kecil = beban rilis
  (14 → 15 paket) tanpa manfaat; kolektor menumpang `@ramonyx/bundler` (dev-only by construction).
- **Overlay di halaman aplikasi** (widget client-side): menyentuh bundel klien pengguna dan
  mensyaratkan kode masuk ke produksi; halaman panel terpisah lebih aman + tetap dev-only.
- **WebSocket/SSE push**: polling 2 dtk cukup untuk dev; push menambah state kompleks (Vite HMR
  sudah menangani reload kode).

## Konsekuensi

- Pengembang melihat rute/timing/hydration/bundel tanpa alat eksternal; data berasal dari hook
  yang sama dengan observability produksi (bukan jalur paralel).
- Aproksimasi korelasi hook→request adalah batasan yang tercatat; bila di masa depan hook
  membawa identitas request, korelasi dapat diperketat tanpa mengubah API panel.
- Sisa kandidat F6: i18n, docs-domain (menunggu sinyal pengguna).
