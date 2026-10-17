# ADR-0001: Strategi Runtime — Node.js Baseline + Rust/V8 Eksperimental

- Status: Accepted
- Tanggal: 2026-10-18
- Sumber: `docs/BLUEPRINT.md` §3, §9, §11

## Konteks

Framework butuh runtime; membangun runtime sendiri (engine JS, module loader, I/O, permission
model) adalah proyek besar dan tidak boleh memblokir produk utama. V8 dapat di-embed; Rust dapat
menjadi host.

## Keputusan

1. Framework MVP dan V1 berjalan di **Node.js** sebagai runtime baseline/referensi.
2. Runtime sendiri dikembangkan di repositori yang sama (`runtime/`), host **Rust** + engine
   **V8**, mulai Phase 4 (alpha) dan Phase 5 (beta). Tidak diklaim production-ready sebelum
   compatibility, security, stability, dan operational testing lolos.
3. Framework mengakses runtime hanya lewat kontrak `adapter-runtime`
   (lihat `docs/architecture.md` §5), bukan API internal Node.
4. Membuat parser/GC/JIT/engine JS sendiri **tidak masuk roadmap awal**.

## Alternatif yang ditolak

- **QuickJS sebagai engine utama** — bahan eksperimen kecil; throughput/ekosistem belum terukur
  untuk production (Blueprint Opsi B).
- **Engine JS sendiri** — proyek riset bahasa tersendiri, bukan prasyarat framework (Opsi C).
- **Mengembangkan runtime lebih dulu** — memblokir produk utama tanpa manfaat langsung.

## Konsekuensi

- Dua permukaan uji: framework diuji tanpa runtime sendiri; runtime diuji tanpa framework.
- FFI (Rust↔V8) menjadi boundary yang diaudit: `unsafe` dibatasi, invarian didokumentasikan.
- Runtime menambah biaya pemeliharaan (build, upgrade engine, binding) — diterima secara sadar.

## Cara membuktikan

- Phase 1–2: demo app berjalan di Node + integration/browser tests (Blueprint §9).
- Phase 4: framework demo yang sama berjalan di runtime alpha dan lulus subset compatibility tests.
