# ADR-0039: Release Pipeline v1 — Artefak, Verifikasi Instalasi, Rilis 0.1.0

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: BLUEPRINT §9 (Phase 5: release pipeline), ADR-0002 (source-first), ADR-0018 (MIT,
  scope `@ramonyx/*`)

## Konteks

Phase 5 menutup dengan rilis: paket dapat dipasang konsumen dan binary runtime dapat dijalankan.
Dua kendala nyata:

1. Repo **source-first** (`exports` → `./src/index.ts`), tetapi **Node tidak melakukan type
   stripping untuk berkas di dalam `node_modules`** — paket npm mentah berisi `.ts` tidak dapat
   dipakai konsumen tanpa loader. Artefak rilis karena itu harus berisi **JS + `.d.ts`**.
2. Tidak ada remote/CI saat ini: klaim "pipeline rilis" harus dibuktikan dengan alur yang
   **dapat dijalankan lokal** (build → pack → verifikasi instalasi).

## Keputusan

### Versi 0.1.0

- `Cargo.toml` workspace + seluruh `packages/*` → **0.1.0** (satu versi; `ramonyx-runtime version`
  ikut dari crate).

### Build paket (`scripts/build-packages.mjs`)

- `tsc` per paket (urutan topologis dari impor `@ramonyx/*`), `outDir` `dist/build/<paket>`,
  deklarasi aktif, `rewriteRelativeImportExtensions` untuk `.ts` → `.js`.
- Deklarasi (`.d.ts`) masih memuat specifier `.ts` → **post-pass** menulis ulang specifier
  relatif `.ts` → `.js` (konsumen hanya menerima `.d.ts`).
- Cross-package di-typecheck lewat `paths` ke hasil build dependensi (bukan ke sumber).

### Staging + pack (`scripts/release.mjs`)

- Staging `dist/npm/<paket>`: `dist/` hasil build, `LICENSE`, README kecil per paket, dan
  `package.json` hasil rewrite — `exports` → `{ types: ./dist/*.d.ts, default: ./dist/*.js }`,
  `files`, `engines.node >= 24`, `publishConfig.access=public`, dependensi `workspace:*` →
  `^<versi>`.
- `pnpm pack` per paket → `dist/npm/*.tgz`.
- **Binary runtime**: `cargo build --release` → `dist/runtime/ramonyx-runtime-<versi>-<target>.tar.gz`
  (binary + LICENSE + README).
- `dist/SHA256SUMS` + `dist/release-manifest.json` (path, ukuran, sha256).

### Verifikasi instalasi (`scripts/verify-release.mjs`)

- Proyek konsumen **bersih** yang dipasangi tarball; smoke dijalankan dengan **Node polos**
  (tanpa loader): router + schema, pipeline `createHandler` + middleware security (nosniff +
  CSP nonce), POST body, 404, **SSR React**; impor seluruh paket termasuk `ramonyx`,
  `@ramonyx/adapter-runtime`, `compiler`, `bundler`, `testing`.
- Dependensi internal transitif diresolusi lewat **`pnpm-workspace.yaml` overrides** (pnpm ≥ 12
  tidak lagi membaca `pnpm.overrides` di package.json) → diverifikasi tanpa publikasi registry.
- Binary runtime dari tarball: `version` + menjalankan skrip hello.

### CI rilis (`.github/workflows/release.yml`)

- Dipicu tag `v*`: gate cepat → artefak → verifikasi → unggah artefak → GitHub Release →
  publikasi npm (dilewati bila `NPM_TOKEN` kosong).

## Bukti (lokal)

- `pnpm release` → **13 artefak** (12 tarball npm + 1 runtime, 25 MiB) + SHA256SUMS + manifest.
- `pnpm release:verify` → proyek konsumen bersih: `SMOKE OK halo,dunia paket 24.22.0`;
  runtime `version` → `ramonyx-runtime 0.1.0`; skrip hello jalan.
- 90 test Rust + 118 test Node tetap hijau; lint/typecheck/clippy/fmt bersih.

## Batasan yang dicatat jujur

- **Belum dipublikasikan ke npm** (tanpa kredensial) — alur publikasi ada di workflow dan
  gating `NPM_TOKEN`, tetapi tidak dijalankan di round ini.
- Workflow GitHub Actions **belum pernah dieksekusi** (tidak ada remote/runner); yang diuji
  adalah skrip yang sama secara lokal.
- Binary rilis: satu platform (host), tanpa code signing/provenance/SBOM.
- Versi tunggal untuk semua paket (tanpa changesets/versioning independen).

## Alternatif yang ditolak

- **Publikasi source-first apa adanya**: konsumen harus punya loader TS sendiri — DX buruk dan
  menyalahi ekspektasi npm; dist JS+d.ts lebih jujur.
- **Bundler (esbuild) alih-alih tsc**: kehilangan `.d.ts`; tsc memberi keduanya sekaligus dan
  sudah terpasang.

## Konsekuensi

- Rilis v1 dapat direproduksi lokal kapan pun; regresi instalasi tertangkap oleh `release:verify`
  sebelum unggah.
- Sisa Phase 5: isolasi level proses untuk plugin; publikasi npm sebenarnya menunggu keputusan
  pemilik (kredensial + nama paket final di registry).
