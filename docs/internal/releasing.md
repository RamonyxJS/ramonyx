# Panduan Rilis — Checklist Pra-Publikasi

- Status: **TERBIT — 0.3.0** (2026-10-19): **16 paket** (baru: `@ramonyx/mcp-docs-server`,
  `@ramonyx/plugin-image`) + GitHub Release v0.3.0 (19 aset). Riwayat: 0.2.0 (2026-10-19,
  14 paket, GitHub Release 17 aset), 0.1.1 (2026-10-18, 14 paket), 0.1.0 (2026-10-18, 13 paket) —
  verifikasi registry end-to-end lolos untuk semuanya. Kebijakan ADR-0039/0049 di bawah berlaku
  untuk rilis berikutnya; hasil + acceptance 0.3.0 di bagian bawah.
- **TERBIT — 0.4.0** (2026-10-19): fitur **i18n** (ADR-0081) + benchmark pipeline gambar +
  panduan publikasi plugin (ADR-0080); 16 paket → 17 artefak; GitHub Release v0.4.0 (19 aset);
  hasil + acceptance di bagian "Hasil rilis 0.4.0".
- **TERBIT — 0.4.1** (2026-10-20): remediasi snapshot MCP (`docs/public` saja) + situs publik
  berbasis kebijakan konten (ADR-0082); 17 artefak; hasil + verifikasi di "Hasil rilis 0.4.1".
- **TERBIT — 0.4.2** (2026-10-21): gate kesiapan paket publik — meta `createHandler`, React
  peer dependency, deskripsi/README 16 paket, metadata release, `release:verify` dari tarball,
  dan seluruh paket terverifikasi di registry dengan provenance.
- **PERSIAPAN — 0.5.0** (2026-10-21): partial hydration islands (`@ramonyx/react/islands`),
  route code splitting, rekonsiliasi head soft navigation, dan pembaruan situs/docs. Bump versi
  16 paket + template; verifikasi rilis penuh sebelum tag.

## Persiapan 0.5.0 (2026-10-21)

- Fitur: `<Island>`/`defineIsland` dengan SSR root terisolasi + hydration per marker, `useId`
  stabil; e2e playground interaksi/no-JS/back-forward; docs SSR.
- Bump: `Cargo.toml` + 15 paket `packages/*` + `apps/create-app` → **0.5.0**; template
  `^0.5.0`; CHANGELOG `[0.5.0]`; README/AGENTS status.
- Gate: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm docs:stats`, `pnpm docs:generate`,
  `pnpm docs:validate`; lalu `pnpm release` + `pnpm release:verify` + `npm publish --dry-run`
  untuk 16 tarball.
- Langkah pemilik: tag `v0.5.0` → workflow publish provenance + GitHub Release.

## Persiapan 0.4.0 (2026-10-19)

- Bump versi: `Cargo.toml` + 15 paket `packages/*` + `create-ramonyx-app` → **0.4.0**; template
  `^0.4.0`; CHANGELOG `[0.4.0]` (i18n; benchmark pipeline gambar; panduan publikasi plugin).
- `pnpm release` → **17 artefak** (16 tarball npm + binary runtime 0.4.0).
- `pnpm release:verify` → lolos penuh (konsumen bersih + source map + scaffold build/start/SSR +
  handshake MCP dari tarball + binary runtime).
- `npm publish --dry-run` ×16 → exit 0 tanpa warning.
- **Langkah tersisa (pemilik)**: `git tag v0.4.0 && git push origin main --tags` — **selesai**
  (lihat "Hasil rilis 0.4.0").

## Hasil rilis 0.4.2 (2026-10-21)

- Tag `v0.4.2` → workflow **success**: 16 paket @ 0.4.2 (provenance) + **GitHub Release 19 aset**.
- **Gate paket**: `ramonyx` meta mengekspor `createHandler` + contract test; `@ramonyx/react`
  memakai peer React 19; 16 deskripsi/README unik; `verify-release` memeriksa metadata tarball,
  peer React, smoke meta, dan instalasi konsumen bersih.
- **Registry**: seluruh 16 paket @ 0.4.2 terlihat dengan `dist.attestations`; `@ramonyx/react`
  tanpa React di dependencies; `ramonyx` bergantung pada core + server.
- Catatan propagasi: sebagian paket (termasuk `@ramonyx/plugin-image`) sempat tertunda di edge
  registry sebelum terlihat; verifikasi dilakukan setelah semua tersedia.

## Hasil rilis 0.4.1 (2026-10-20)

- Tag `v0.4.1` → workflow success: **16 paket @ 0.4.1** (provenance) + **GitHub Release 19 aset**.
- **Snapshot MCP:** tarball registry `@ramonyx/mcp-docs-server@0.4.1` memuat **38 entri `docs/`
  publik** — tanpa `PRD`, `IMPLEMENTATION_STATUS`, roadmap, `BLUEPRINT`, atau asesmen keamanan
  (`npm pack` + `tar -tzf` diverifikasi).
- **Deprecation:** `@ramonyx/mcp-docs-server@0.3.0` dan `@0.4.0` di-`npm deprecate` dengan pesan
  upgrade ke 0.4.1+ (tarball lama tetap dapat diunduh — dicatat sebagai residual).
- **Situs publik:** GitHub Pages kini hanya memuat `docs/public/` (landing + `/docs`, 8 ADR publik);
  URL internal lama (`/dokumen/security/threat-model`, `/dokumen/PRD`, …) → 404.
- Gate CI baru berjalan: `pnpm test:docs` (e2e kebijakan + a11y) dan `pnpm docs:no-leak`.

## Persiapan 0.4.1 — remediasi snapshot MCP (2026-10-20)

- **Alasan**: tarball `@ramonyx/mcp-docs-server` 0.3.0/0.4.0 membawa seluruh `docs/` (PRD,
  IMPLEMENTATION_STATUS, roadmap, asesmen keamanan) — melanggar kebijakan konten (ADR-0082).
- Perubahan: `scripts/release.mjs` menyalin **`docs/public/` saja**; `verify-release` menolak
  tarball berisi dokumen internal; `docs:no-leak` memeriksa tarball.
- Langkah: bump `Cargo.toml` + 16 paket + template → **0.4.1**; `pnpm release` + `release:verify` +
  `npm publish --dry-run` ×16; tag `v0.4.1`; setelah publish: `npm deprecate` versi 0.3.0/0.4.0
  dengan pesan upgrade; verifikasi registry (snapshot publik).

## Hasil rilis 0.4.0 (2026-10-19)

- Tag `v0.4.0` → workflow: build+verifikasi dan **publish 16 paket @ 0.4.0** (provenance) +
  **GitHub Release v0.4.0 (19 aset)**.
- **Acceptance registry end-to-end**: `create-ramonyx-app@0.4.0` → install → `ramonyx build` →
  `ramonyx start` → home 200 + payload hydration + API 200 ✓.
- **i18n dari registry**: `import { createTranslator, negotiateLocale, localePath } from "ramonyx"`
  → "Hello Rina" / `id` / `/en/tentang` ✓ (primitif ikut di tarball `@ramonyx/core`).
- Peer metadata `@ramonyx/plugin-image@0.4.0` (sharp opsional) tetap terdeklarasi ✓; provenance
  terverifikasi (`dist.attestations`).

## Hasil rilis 0.3.0 (2026-10-19)

- Tag `v0.3.0` → workflow: build+verifikasi dan **publish 16 paket @ 0.3.0** (provenance) +
  **GitHub Release v0.3.0 (19 aset)**. Propagasi registry ±15 menit (pola sama dengan 0.2.0).
- **Acceptance registry end-to-end**: `create-ramonyx-app@0.3.0` → install → `ramonyx build` →
  `ramonyx start` → home 200 + payload hydration + API 200 ✓; **aset hasil pipeline disajikan
  200** (`image/svg+xml`) — memverifikasi perbaikan bug M1 dari registry.
- **MCP dari registry**: `npx -y @ramonyx/mcp-docs-server@0.3.0` → handshake `ramonyx-docs` +
  5 tools ✓.
- **Peer metadata di registry**: `@ramonyx/plugin-image@0.3.0` memuat `sharp` opsional
  (memverifikasi perbaikan staging `peerDependencies`).
- Flake test yang selama ini muncul di `pnpm docs:stats` (mesin sibuk) diperbaiki:
  jendela penghitung `createMemoryStore.increment` kini memakai **waktu monotonik**
  (`performance.now`) — rate limit tidak boleh terpengaruh penyesuaian jam sistem; test SWR
  revalidate memakai margin jendela lebih lebar (500 ms/1 dtk).

## Persiapan 0.3.0 (2026-10-19)

- Bump versi: `Cargo.toml` + 15 paket `packages/*` + `create-ramonyx-app` → **0.3.0**; template
  `^0.3.0`; CHANGELOG `[0.3.0]` (MCP docs server, pipeline gambar M2, koreksi layout aset,
  hygiene repo).
- `pnpm release` → **17 artefak** (16 tarball npm + binary runtime 0.3.0).
- `pnpm release:verify` → lolos penuh (konsumen bersih + source map + scaffold build/start/SSR +
  **handshake MCP dari tarball** + binary runtime) — **setelah memperbaiki bug staging**:
  `stagePackage` tidak menyalin `peerDependencies`/`peerDependenciesMeta` (peer opsional `sharp`
  hilang dari tarball plugin-image; tertangkap inspeksi tarball).
- `npm publish --dry-run` ×16 → exit 0 tanpa warning.
- **Langkah tersisa (pemilik)**: `git tag v0.3.0 && git push origin main --tags` — **selesai**
  (lihat "Hasil rilis 0.3.0").
- Verifikasi lokal terakhir (2026-10-19, 0.3.0): `pnpm release` → **17 artefak** (16 tarball npm +
  binary runtime) → `npm publish --dry-run` ×16 (exit 0, tanpa warning) →
  `pnpm release:verify` (konsumen bersih + source map + scaffold `create-ramonyx-app` + **handshake
  MCP dari tarball** + binary runtime).

## Prasyarat pemilik (status saat ini: terpenuhi)

1. **Remote GitHub** — ✅ repo publik (`github.com/RamonyxJS/ramonyx`); `release.yml` berjalan
   dari tag dan provenance npm aktif.
2. **Scope npm** — ✅ `@ramonyx`, `ramonyx`, `create-ramonyx-app` atas akun/org pemilik.
3. **`NPM_TOKEN`** — ✅ terpasang sebagai secret repo (automation token).
4. **Keputusan tag** — ✅ konvensi `vX.Y.Z` (dist-tag `latest`) dipakai sejak 0.1.0; dist-tag
   `alpha`/`beta`/`rc` tersedia dari nama tag.

## Kebijakan (ditegakkan workflow)

- **Sumber versi = `Cargo.toml` root.** Workflow menolak bila tag ≠ versi paket
  (mis. tag `v0.1.0` wajib versi `0.1.0`).
- **Dist-tag dari nama tag**: `-alpha` → `alpha`, `-beta` → `beta`, `-rc` → `rc`, selain itu
  `latest`.
- **Publish memakai tarball terverifikasi** (unduhan artefak job `artifacts`) — bukan build
  ulang; bit yang terbit = bit yang diuji di proyek konsumen.
- **Provenance** aktif otomatis bila repo publik (`id-token: write` + `--provenance`); repo
  privat → publish tanpa provenance (dicatat di log).
- `REPOSITORY` di `scripts/release.mjs` sudah menunjuk remote resmi
  (`https://github.com/RamonyxJS/ramonyx`).

## Langkah

```bash
# 1. Samakan versi di Cargo.toml (sumber) + package.json paket, commit.
# 1b. Regenerasi dokumentasi machine-readable (angka test/ADR/paket dari suite — ADR-0054):
pnpm docs:stats && pnpm docs:generate && pnpm docs:validate && git add -A && git commit -m "docs: regenerasi stats"
# 2. Dry-run lokal (tanpa kredensial):
pnpm release && pnpm release:verify
for t in dist/npm/*.tgz; do npm publish --dry-run "$t"; done
# 3. Tag & push → memicu workflow:
git tag v0.1.0-alpha.1 && git push origin main --tags
# 4. Pantau job `artifacts` (build+verifikasi) lalu `publish-npm` (butuh NPM_TOKEN).
# 5. Verifikasi dari registry (setelah job hijau):
pnpm dlx create-ramonyx-app@alpha demo-app
cd demo-app && pnpm install && pnpm build && pnpm start
```

## Hasil rilis pertama (2026-10-18)

- Publish lokal via automation token (2FA akun aktif → publish interaktif butuh OTP).
- npm memberi stub `0.0.0-stage` per paket baru (placeholder internal) dan sempat menunda
  propagasi scope ±3 menit — normal.
- `npm dist-tag add <pkg>@0.1.0 latest` dijalankan eksplisit untuk memastikan seluruh paket
  konsisten (satu paket sempat `latest: 0.0.0-stage` karena propagasi).
- Verifikasi registry: `pnpm dlx create-ramonyx-app@alpha demo-app` → `pnpm install` (template
  `^0.1.0` + `allowBuilds` esbuild) → `pnpm build` → `pnpm start` → halaman SSR + payload
  hydration + CSP nonce + API route template ✓.
- **Workflow `release.yml` dieksekusi sukses** pada tag `v0.1.0` (2026-10-18): 14 artefak +
  verifikasi penuh (scaffold build/start/SSR dari tarball) + **GitHub Release** (16 aset);
  job publish skip (versi sudah ada; idempoten). Secret `NPM_TOKEN` (automation) terpasang
  untuk rilis berikutnya — rilis baru cukup: bump versi di `Cargo.toml` → commit → tag `vX.Y.Z`.
- Catatan higiene: jangan pernah menempelkan nilai token sebagai **nama** `gh secret set`
  (nama secret terlihat di pengaturan repo — token harus dianggap terekspos dan dirotasi).

## Hasil rilis 0.2.0 (2026-10-19)

- Tag `v0.2.0` → workflow `release.yml`: job **Build artefak rilis + verifikasi** dan
  **Publikasi npm** keduanya **success**; **14 paket @ 0.2.0 terbit** (`npm publish` ×14,
  dist-tag `latest`, **provenance** — terverifikasi di registry: `dist.attestations` ada) +
  **GitHub Release v0.2.0 (17 aset)**.
- **Acceptance registry end-to-end (2026-10-19)**: `pnpm dlx create-ramonyx-app@0.2.0 demo-app`
  → `pnpm install` → `ramonyx build` (bundel klien ber-hash) → `ramonyx start` (produksi) →
  halaman SSR 200 + payload hydration + `GET /api/halo/dunia` → `{"halo":"dunia"}` 200 ✓.
- Catatan operasional (propagasi): `npm view` sebagian paket sempat menampilkan `0.1.1` dan
  **tarball `@ramonyx/ssr@0.2.0` sempat 404 di edge** (±20 menit) — `npm install` sudah berhasil
  sebelum `curl`/`pnpm` (edge berbeda); log workflow menunjukkan 14× `+ <paket>@0.2.0` dengan
  provenance. Sebelum menguji segera setelah publish: bersihkan cache metadata pnpm dan retry
  bila edge belum konsisten.
- Dokumentasi pasca-terbit: klaim "belum dirilis" di `docs/machine/features.json` dihapus
  (25 fitur → `since: 0.2.0`); README + status rilis diperbarui.

## Persiapan 0.2.0 (2026-10-19)

- Bump versi: `Cargo.toml` (sumber) + 13 paket `packages/*` + `create-ramonyx-app` → **0.2.0**;
  template scaffolder `^0.1.0` → **`^0.2.0`** (penting: caret 0.x mengunci minor — tanpa ini
  scaffold baru tetap memasang 0.1.x); CHANGELOG `[0.2.0] — 2026-10-19` (ADR-0055–0077).
- `pnpm release` → **15 artefak** (14 tarball npm + binary runtime 0.2.0) + SHA256SUMS/manifest.
- `pnpm release:verify` → lolos penuh (konsumen bersih + source map + scaffold
  `create-ramonyx-app` build/start/SSR dari tarball + binary runtime) — **setelah memperbaiki bug
  verifikasi**: cek berkas klien kini lewat manifest `ramonyx.assets.json` (aset ber-hash sejak
  ADR-0055; cek lama `client.js` gagal — tepatnya baru terekspos di persiapan ini).
- `npm publish --dry-run` ×14 → exit 0 tanpa warning.
- **Langkah tersisa (pemilik)**: `git tag v0.2.0 && git push origin main --tags` → workflow
  `release.yml` memverifikasi artefak lalu publish 14 paket (dist-tag `latest`, provenance) +
  GitHub Release. Setelah itu: verifikasi registry end-to-end + rapikan klaim "belum dirilis"
  di dokumentasi machine.

## Hasil rilis 0.1.1 (2026-10-18)

- Tag `v0.1.1` → workflow: 15 artefak + verifikasi + **publish 14 paket dengan provenance**
  (repo publik + `id-token: write`) + GitHub Release.
- Acceptance dari registry di direktori bersih: scaffold `create-ramonyx-app@0.1.1` →
  `pnpm install` (bin `ramonyx` terpasang) → `ramonyx build` → `ramonyx start` → SSR + API
  (403/404) + `ramonyx doctor` ✓ — template baru tanpa boilerplate.
- Catatan operasional: metadata npm untuk paket yang baru dipublikasikan butuh beberapa menit
  untuk terlihat di CDN; pnpm yang menyimpan cache metadata lama perlu dibersihkan/install ulang
  (`--prefer-offline` tidak membantu; hapus `~/.cache/pnpm/**ramonyx**` atau tunggu TTL).

## Catatan jujur

- `release.yml` dieksekusi pertama kali lewat tag `v0.1.0` (setelah repo publik dibuat);
  rancangan awal bahkan tidak bisa jalan (job publish menulis ke `dist/npm/*/` yang tidak pernah
  dibuat di job itu) — ADR-0049 memperbaiki: publish dari artefak terverifikasi + guard versi +
  dist-tag + provenance kondisional + **publish idempoten** (versi yang sudah ada dilewati,
  sehingga tag ulang aman).
- Unpublish npm masih mungkin dalam 72 jam; **nama/versi yang sudah ditarik tetap terkunci**.
  Karena itu tag pertama sebaiknya memakai dist-tag `alpha`/`next` bila ingin ruang koreksi.
- **pnpm ≥10 memblokir build script dependensi** — `esbuild` (loader runtime) butuh postinstall;
  template sudah membawa `pnpm-workspace.yaml` dengan `allowBuilds: { esbuild: true }`, dan proyek
  konsumen `release:verify` menyetel hal yang sama. npm/yarn tidak memblokir.
