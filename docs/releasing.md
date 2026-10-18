# Panduan Rilis — Checklist Pra-Publikasi

- Status: **siap secara lokal**; publikasi registry menunggu keputusan + kredensial pemilik
  (ADR-0039/0049).
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
- `REPOSITORY` di `scripts/release.mjs` harus diganti ke remote sebenarnya sebelum tag.

## Langkah

```bash
# 1. Samakan versi di Cargo.toml (sumber) + package.json paket, commit.
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

## Catatan jujur

- `release.yml` **belum pernah dieksekusi di runner GitHub** (tidak ada remote saat dibuat).
  Rancangan awal bahkan tidak bisa jalan (job publish menulis ke `dist/npm/*/` yang tidak pernah
  dibuat di job itu); ADR-0049 memperbaiki: publish dari artefak terverifikasi + guard versi +
  dist-tag + provenance kondisional.
- Unpublish npm masih mungkin dalam 72 jam; **nama/versi yang sudah ditarik tetap terkunci**.
  Karena itu tag pertama sebaiknya memakai dist-tag `alpha`/`next` bila ingin ruang koreksi.
