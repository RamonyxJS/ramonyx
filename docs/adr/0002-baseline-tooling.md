# ADR-0002: Baseline Tooling, Bahasa, dan CI

- Status: Accepted
- Tanggal: 2026-10-18
- Sumber: `docs/BLUEPRINT.md` §6, §8

## Keputusan

- **Bahasa:** TypeScript `strict` (detail di `docs/coding-standards.md`); ESM untuk semua paket.
- **Monorepo:** pnpm workspaces (`pnpm-workspace.yaml`); lockfile di-commit; versi tool dipin.
- **Testing:** unit + integration; property-based/fuzz untuk router matching, parser, dan
  validasi (Blueprint §6).
- **CI (urutan wajib):** lint → typecheck → test → build → security checks (Blueprint §6).
- **Benchmark:** dijalankan sejak Phase 1; hasil disimpan sebagai artefak CI
  (`docs/benchmark-protocol.md`).
- **Observability:** structured logs, metrics, tracing (Blueprint §6); tanpa data rahasia di log.
- **Compiler:** mulai dari tooling yang ada, pin versi TypeScript/compiler, uji integrasinya;
  compiler khusus hanya jika ada kebutuhan terukur (Blueprint §6).

## Alternatif yang ditolak

- npm/yarn/Bun sebagai package manager monorepo — blueprint menetapkan pnpm workspaces.
- Compiler/bundler sendiri sejak awal — ditolak sesuai Blueprint §6 (lihat ADR-0005).

## Konsekuensi

- Mesin dev butuh Node.js LTS + **pnpm** (belum terpasang secara default; `corepack enable pnpm`
  atau `npm i -g pnpm`). Rust hanya untuk Phase 4+.
- Tidak ada paket CJS baru; publikasi ESM-only sampai ada kebutuhan terukur untuk sebaliknya.
