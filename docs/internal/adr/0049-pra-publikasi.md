---
adr: 0049
title: "Kesiapan Pra-Publikasi — Publish dari Artefak Terverifikasi + Dist-Tag + `create-ramonyx-app`"
visibility: internal
---

# ADR-0049: Kesiapan Pra-Publikasi — Publish dari Artefak Terverifikasi + Dist-Tag + `create-ramonyx-app`

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: pertanyaan pemilik ("apa yang lebih penting sebelum publikasi?"), ADR-0039/0041, audit `docs/IMPLEMENTATION_STATUS.md`

## Konteks

- Job `publish-npm` pada `release.yml` menjalankan `pnpm release:build` lalu loop `dist/npm/*/` —
  staging direktori itu hanya dibuat oleh `scripts/release.mjs` (full), bukan `release:build` →
  **publish pertama akan gagal**; kalaupun jalan, ia membangun ulang bit yang belum diverifikasi.
- `create-ramonyx-app` (ADR-0041) tidak ikut pipeline rilis (hanya `packages/*`) → pintu masuk
  adopsi (`pnpm create ramonyx-app`) tidak akan terbit.
- Kebijakan dist-tag & provenance belum ada; tag pertama berisiko langsung mencemari `latest`.

## Keputusan

1. **Publish dari tarball terverifikasi**: job `publish-npm` mengunduh artefak `ramonyx-release`
   (hasil `pnpm release` + `pnpm release:verify` di job `artifacts`) dan menjalankan
   `npm publish <tarball>` — **tanpa build ulang**, sehingga bit yang terbit = bit yang diuji.
2. **Guard tag ↔ versi**: workflow menolak tag yang tidak sama dengan versi `Cargo.toml`
   (sumber versi tunggal), gagal cepat sebelum build panjang.
3. **Kebijakan dist-tag** dari nama tag: `-alpha` → `alpha`, `-beta` → `beta`, `-rc` → `rc`,
   selain itu `latest`.
4. **Provenance kondisional**: `id-token: write` + `--provenance` hanya bila
   `github.event.repository.visibility == 'public'` (repo privat → publish tanpa provenance,
   dicatat di log).
5. **`create-ramonyx-app` ikut rilis**: staging baru di `release.mjs` — `src/cli.ts` di-bundle
   esbuild (`--platform=node`, shebang dipertahankan), `template/` + `LICENSE` + README Inggris,
   `bin: { create-ramonyx-app: "dist/cli.js" }`; `verify-release.mjs` men-scaffold app **nyata**
   lewat bin dari tarball (termasuk cek placeholder `__APP_NAME__` terganti).
6. **Checklist serah-terima**: `docs/releasing.md` (prasyarat pemilik, kebijakan, langkah,
   catatan unpublish 72 jam); `REPOSITORY` placeholder didokumentasikan untuk diganti.

## Bukti

- `pnpm release` → **14 artefak**: 13 tarball npm (termasuk `create-ramonyx-app-0.1.0.tgz`,
  5 KiB — memuat `dist/cli.js` mode 755 + shebang, `template/`, README, LICENSE) + binary runtime
  + `SHA256SUMS`/manifest.
- `npm publish --dry-run` ×13 → **exit 0, tanpa warning**; nama/versi benar (`@ramonyx/*@0.1.0`,
  `ramonyx@0.1.0`, `create-ramonyx-app@0.1.0`).
- `pnpm release:verify` → smoke konsumen (Node polos) ✓, source map paket ✓,
  **scaffold `app-baru` lewat `create-ramonyx-app` dari tarball ✓** (nama placeholder terganti,
  `src/routes/page.tsx` tersalin), runtime ✓.

## Batasan yang dicatat jujur

- Workflow tetap **belum pernah dijalankan di runner GitHub** (tanpa remote) — itu langkah pemilik.
- `REPOSITORY` masih `github.com/ramonyx/ramonyx` (placeholder) sampai remote nyata dibuat.
- Provenance hanya untuk repo publik; tanpa itu, rantai pasok tetap memakai `SHA256SUMS` + GitHub
  Release sebagai jejak integritas.
- Unpublish npm dimungkinkan 72 jam, tetapi nama/versi yang ditarik tetap terkunci.

## Alternatif yang ditolak

- **Build ulang di job publish** (ransum tidak identik dengan yang diverifikasi).
- **Selalu `latest` tanpa kebijakan tag** (alpha pertama langsung dikonsumsi pengguna umum).
- **`--provenance` tanpa kondisi** (gagal di repo privat → merusak tag pertama).
- **Menunda `create-ramonyx-app`** sampai publikasi framework terbukti (biaya kecil, manfaat
  adopsi besar; verifikasinya sudah otomatis).
- **Menaruh publish di `release:build` juga** (memperluas peran skrip build; publikasi tetap
  harus dari artefak, bukan rebuild).

## Konsekuensi

- Tag pertama seharusnya mulus (dry-run lokal mencakup metadata + instalasi + scaffold).
- Semua bit publik terverifikasi sebelum terbit; provenance otomatis di repo publik.
- `create-ramonyx-app` menjadi jalur adopsi resmi (`pnpm create ramonyx-app` / `pnpm dlx`).
