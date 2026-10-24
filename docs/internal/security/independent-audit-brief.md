# Audit Keamanan Independen — Brief & Status

- Status: **belum dipesan**; review internal selesai 2026-10-24. Dokumen ini bahan untuk auditor
  eksternal, bukan laporan audit independen.
- Ringkasan publik: `docs/public/security/audit.md` (hanya temuan yang boleh publik).
- Repo: `RamonyxJS/ramonyx` · baseline Node/edge; runtime Rust di luar lingkup.

## 1. Tujuan

Mencari bypass autentikasi/otorisasi, kebocoran secret/client-server, SSRF, masalah session/CSRF,
kesalahan konfigurasi Worker/binding, dan jalur build/release yang dapat menghasilkan artefak tidak
tepercaya. Bukan audit performa atau audit vendor pihak ketiga.

## 2. Aset & trust boundary

- Session/cookie, password hash, token reset/verifikasi, user store.
- Secret environment/binding; API key Stripe/email; R2/KV data.
- Integritas build klien (tidak boleh memuat `*.server.ts`/`node:*`/secret).
- Ketersediaan proses (body/timeout/concurrency, rate limit, cache).
- Artefak rilis npm + provenance + tarball `create-ramonyx-app`.

Lihat `docs/internal/security/threat-model.md` untuk diagram dan asumsi.

## 3. Permukaan yang diminta diaudit

| Area | Kode | Bukti yang ada |
| --- | --- | --- |
| Limits/error | `packages/server/src/handler.ts` | `tests/security/server-hardening.test.ts`, `pnpm bench:security` |
| Session/cookie | `packages/security/src/session.ts`, `cookies.ts` | `packages/security/test/session*.test.ts` |
| CSRF | `packages/security/src/csrf.ts` | `packages/security/test/csrf.test.ts` |
| Auth/token/user store | `packages/security/src/auth.ts`, `password.ts` | `packages/security/test/auth*.test.ts`, `auth-flow.test.ts` |
| Authorization | `packages/security/src/authorization.ts` | test guard/action |
| SSRF | `packages/security/src/ssrf.ts` | test redirect/DNS pin/FormData |
| Boundary | `packages/compiler/src/boundaries.ts`, `packages/bundler/src/server-only.ts` | compiler/bundler tests |
| Worker | `scripts/build-worker.ts`, `wrangler.toml`, `apps/docs/src/landing.server.ts` | smoke live + docs e2e |
| Templates | `apps/create-app/templates/**` | `apps/create-app/test/templates.test.ts` |
| Release | `scripts/release.mjs`, `scripts/verify-release.mjs` | release verify + CI |

## 4. Temuan internal (perlu diverifikasi auditor)

- AUD-01 (High, fixed): template Cloudflare mengekspos R2/KV tanpa auth → bearer `STORAGE_TOKEN`
  + constant-time compare + test.
- AUD-02 (Medium, fixed): dokumentasi CSRF mengklaim HMAC, implementasi token acak double-submit.
- AUD-03 (Medium, fixed): template `api-auth` tanpa CSRF → middleware + hidden field + test.
- AUD-04 (Medium, fixed): CSRF membaca form clone sebelum body limit; kini dibatasi
  `maxFormBytes` + 413 dini + test streaming.
- AUD-05 (Medium, mitigated): session stateless tidak dapat direvokasi; template `api-auth` memakai
  server-side store + revoke; stateless tetap opsi eksplisit dengan trade-off terdokumentasi.
- AUD-06 (Medium, accepted): demo user store/password di template `api-auth`.
- AUD-07/08 (Low): CSP style `unsafe-inline`; HSTS deployment.
- AUD-09 (Low): plugin Node in-process; isolasi proses hanya runtime Rust eksperimental.
- AUD-10 (Info): rate limit/cache/session in-memory per proses.

## 5. Pertanyaan untuk auditor

1. Apakah ada bypass CSRF pada alur form/action atau kombinasi cookie SameSite + subdomain?
2. Apakah pinning DNS `guardedFetch` benar-benar menutup rebinding dan redirect ke alamat privat?
3. Apakah poison-pill `*.server.ts` + scan output dapat dilewati lewat re-export, dynamic import,
   source map, atau plugin Vite?
4. Apakah template `cloudflare`/`api-auth` aman untuk dipublikasikan sebagai starter, termasuk
   header, binding, dan error path?
5. Apakah pipeline rilis dapat memasukkan berkas di luar allowlist atau mempublikasikan versi yang
   tidak cocok dengan tag?
6. Apakah ada masalah session fixation/rotation/expiry pada `createSession` dengan/tanpa store?

## 6. Deliverable yang diharapkan

- Laporan per temuan: severity, bukti reproduksi, dampak, rekomendasi.
- Daftar residual risk yang disepakati.
- Verifikasi perbaikan (retest) dan commit/versi yang diaudit.
- Ringkasan publik yang disetujui (tanpa detail eksploitasi yang membahayakan pengguna).

## 7. Logistik

- Akses source pada commit/tag yang dipin; lingkungan test mengikuti `AGENTS.md` (Node ≥24, pnpm,
  Rust toolchain pinned; `pnpm test`, `pnpm test:edge`, `pnpm bench:security`).
- Kontak: pemilik repo; saluran privat di `SECURITY.md`.
- Audit independen belum dijadwalkan; jangan klaim "audited" sebelum laporan diterima dan temuan
  kritis/tinggi ditutup.
