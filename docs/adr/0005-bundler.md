# ADR-0005: Bundler Awal

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: `docs/BLUEPRINT.md` §6 (catatan compiler), §9 Phase 1–2

## Konteks

Phase 1 hanya menjalankan TypeScript di Node (belum ada bundle client). Bundling baru dibutuhkan
di Phase 2: client bundle, server bundle, route manifest, metadata build. Blueprint: mulai dari
tooling yang ada; compiler khusus hanya jika ada kebutuhan terukur.

## Usulan

1. **Phase 1: tanpa bundler.** Node 22.6+/24 bisa menjalankan TypeScript langsung (type
   stripping) untuk kode erasable — cukup untuk dev/test Phase 1.
2. **Phase 2: Vite** sebagai toolchain awal (dev server + HMR + pipeline plugin) — plugin untuk
   transformasi route dan analisis batas server/client; dibungkus boundary adapter agar bisa
   diganti (esbuild/Rollup sebagai detail internal Vite).
3. Versi Vite + TypeScript dipin dan diuji integrasinya di CI.

## Alternatif

- **esbuild langsung** — cepat, tapi pipeline plugin kurang kaya untuk transformasi framework.
- **Rollup langsung** — tanpa dev server/HMR bawaan.
- **Rspack/Turbopack** — ekosistem plugin berbeda; belum terbukti untuk kebutuhan ini.
- **Compiler sendiri** — ditolak sesuai Blueprint §6.

## Konsekuensi

- `packages/bundler` menjadi pembungkus tipis di atas Vite, bukan implementasi bundler baru.
- Kebutuhan transform khas framework (route, server/client boundary) wajib dinyatakan sebagai
  plugin dengan test tersendiri.
- Terealisasi Phase 1: paket source-first (`.ts` dijalankan Node type stripping), tanpa bundler;
  Vite menyusul di Phase 2.
- JSX app code (Phase 2) tidak didukung type stripping → loader dev/test sendiri, lihat ADR-0006.
