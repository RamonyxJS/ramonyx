# Panduan Rilis — Checklist Pra-Publikasi

- Status: **TERBIT** — **0.1.1** (2026-10-18, 14 paket termasuk `@ramonyx/devtools`, **dengan
  provenance**; GitHub Release v0.1.1) di atas 0.1.0 (2026-10-18, 13 paket). Verifikasi registry
  end-to-end lolos untuk keduanya. Kebijakan ADR-0039/0049 di bawah berlaku untuk rilis berikutnya.
- Verifikasi lokal terakhir (2026-10-18): `pnpm release` → **14 artefak** (13 tarball npm +
  binary runtime) → `npm publish --dry-run` ×13 (exit 0, tanpa warning) →
  `pnpm release:verify` (konsumen bersih + source map + scaffold `create-ramonyx-app` + runtime).

## Prasyarat pemilik (belum bisa diotomasi dari repo)

1. **Remote GitHub** — repo belum punya remote; tanpa itu `release.yml` tidak bisa jalan dan
   provenance npm tidak mungkin. Push `main`, lalu tag.
2. **Scope npm** `@ramonyx` dan nama `ramonyx` / `create-ramonyx-app` atas akun/org pemilik.
3. **`NPM_TOKEN`** (automation token, 2FA-safe) sebagai secret repo bernama `NPM_TOKEN`.
4. **Keputusan tag pertama** — mis. `v0.1.0-alpha.1` (dist-tag `alpha`) untuk uji registry,
   promosikan setelah yakin; atau langsung `v0.1.0` (dist-tag `latest`).

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
