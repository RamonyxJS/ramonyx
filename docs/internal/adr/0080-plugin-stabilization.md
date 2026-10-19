---
adr: 0080
title: "Stabilisasi Kontrak Plugin + Publikasi Plugin Pihak Ketiga"
visibility: internal
---

# ADR-0080: Stabilisasi Kontrak Plugin + Publikasi Plugin Pihak Ketiga

- Status: Accepted (2026-10-19)
- Tanggal: 2026-10-19
- Sumber: TODO `p2-plugin-ecosystem` (kriteria "kontrak stabil + panduan publikasi") — lanjutan
  ADR-0065/0067 (kontrak experimental sampai ada ≥2 plugin nyata).

## Konteks

Kontrak plugin (ADR-0065/0067) kini dipakai **dua plugin nyata**: `kunjungan` (contoh di
playground) dan `@ramonyx/plugin-image` (paket ke-16, ADR-0079 — hook `assets` baru ditambahkan).
Kriteria lama ("stabil setelah ≥2 plugin nyata") terpenuhi secara jumlah, tetapi hook terakhir
baru saja bertambah — mendeklarasikan stabil saat kontrak masih berubah akan menyesatkan.
Panduan publikasi plugin juga masih berupa sketsa 4 poin.

## Keputusan

1. **Kriteria stabilisasi**: kontrak plugin dideklarasikan **stabil** pada rilis berikutnya bila
   **tidak ada perubahan aditif** pada kontrak sejak 0.3.0 (satu siklus rilis). Bila ada
   perubahan, siklus dihitung ulang. Setelah stabil, perubahan breaking mengikuti semver
   (minor/major) + catatan migrasi; penambahan aditif tetap dimungkinkan.
2. **Panduan publikasi plugin pihak ketiga** (`docs/plugins.md` §"Mempublikasikan plugin"):
   - **Kirim JS terkompilasi** (`dist/`) dengan `exports` types+default — plugin pihak ketiga
     berada di `node_modules` dan **tidak** melewati type-stripping Node (paket repo source-first
     hanya karena dijalankan dari workspace).
   - **`peerDependencies`** ke `@ramonyx/bundler`/`ramonyx` (bukan `dependencies`) agar kontrak
     mengikuti versi aplikasi; dependency berat sebagai **peer opsional** (`peerDependenciesMeta`)
     dengan impor dinamis + pesan error yang memandu (pola `sharp` di `@ramonyx/plugin-image`).
   - Konvensi nama: `ramonyx-plugin-*` (komunitas), `@ramonyx/plugin-*` (resmi); ESM-only,
     `engines.node >= 24`.
   - Uji wajib: hook dipanggil langsung di test + dijalankan di aplikasi nyata
     (`ramonyx build|dev|start`).
3. **Referensi implementasi**: `@ramonyx/plugin-image` (struktur paket, staging rilis yang
   menyalin `peerDependencies`, test hook + integrasi buildClient).

## Bukti

- `docs/plugins.md` — panduan publikasi + kriteria stabilisasi (bagian "Mempublikasikan plugin").
- `packages/plugin-image/` — referensi: `package.json` (peer opsional `sharp`), `src/index.ts`
  (impor dinamis + pesan error), `test/image.test.ts` (hook + integrasi).
- `apps/playground/src/plugins/kunjungan.ts` + test CLI (`apps/create-app/test/create-app.test.ts`)
  — plugin dimuat dari `ramonyx.config.ts`.
- `scripts/release.mjs` — staging mempertahankan `peerDependencies`/`peerDependenciesMeta`
  (diperbaiki saat rilis 0.3.0).
- TODO baru `p2-plugin-contract-freeze` mencatat deklarasi stabil di rilis berikutnya.

## Alternatif yang ditolak

- **Deklarasi stabil sekarang**: hook `assets` baru ditambahkan di rilis yang sama — belum ada
  siklus tanpa perubahan; klaim stabil akan menyesatkan pengguna kontrak.
- **Kontrak selamanya experimental**: menahan adopsi plugin pihak ketiga tanpa alasan setelah
  2 plugin nyata; kriteria waktu (1 siklus) memberi batas yang jelas.
- **Registry/`ramonyx add` sekarang**: butuh hosting + kurasi — dicatat sebagai kandidat terpisah,
  bukan syarat stabilisasi.

## Konsekuensi

- Plugin pihak ketiga punya jalur publikasi yang jelas dan teruji (pola plugin-image).
- `features.json` `plugin-ecosystem` tetap `partial` sampai deklarasi stabil (jujur), dengan
  catatan kriteria + TODO `p2-plugin-contract-freeze`.
- Kandidat lanjutan: registry/`ramonyx add`, hook loader/route individual, prioritas antar-plugin.
