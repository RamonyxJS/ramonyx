# AGENTS.md — Ramonyx

Rencana proyek: framework full-stack TypeScript + runtime eksperimental (Rust + V8) —
dua proyek yang terintegrasi tetapi terpisah. Repositori saat ini hanya berisi dokumen
(keadaan per 18 Okt 2026: hanya `docs/`, tanpa kode, manifest, lockfile, test, CI, atau git).
Jangan mengarang perintah build/test — periksa dulu apa yang benar-benar ada.

## Baca dulu, berurutan

1. `docs/BLUEPRINT.md` — sumber kebenaran teknis: arsitektur, batas komponen, stack, threat model, benchmark, roadmap.
2. `docs/PRD.md` — level produk. Bagian "Pertanyaan Terbuka" belum diputuskan; jangan perlakukan sebagai keputusan.

## Jebakan yang paling mudah kena

- **Blueprint adalah rencana, bukan implementasi.** Pohon monorepo §5, API contoh (`defineConfig`,
  `route`, `schema`), konvensi `src/routes/`, dan nama paket hanyalah rancangan — dokumennya
  sendiri menyatakan itu. Jangan merujuk seolah fasilitas tersebut sudah ada.
- **Nama proyek: `ramonyx` (final).** Dipakai untuk framework dan folder monorepo; contoh kode
  dan pohon di blueprint memakai nama ini.
- **Disiplin klaim (§10).** Pisahkan fakta, hipotesis desain, dan klaim yang belum terbukti.
  Jangan menulis klaim performa/keamanan ("lebih cepat dari ...", "production-ready", "aman")
  tanpa bukti yang bisa dijalankan.
- **Bahasa.** Narasi/dokumen internal berbahasa Indonesia (ikut dua dokumen yang ada); teks yang
  dilihat publik (README, docs situs, pesan error, landing) berbahasa Inggris.
- **Jangan lompat fase.** Ikuti urutan §9: Phase 0–3 (framework di runtime yang ada) lebih dulu;
  runtime Rust + V8 baru Phase 4–5. Jangan membangun runtime sebelum framework core berjalan.

## Batas arsitektur yang harus dijaga

- Framework core tidak bergantung pada internal runtime, dan sebaliknya; keduanya harus dapat diuji terpisah.
- Runtime MVP = Node.js. Runtime sendiri = host Rust + engine V8 (bukan menulis engine JS dari nol; itu di luar roadmap awal).
- Compiler menghasilkan artefak eksplisit: client bundle, server bundle, route manifest, metadata build.
- FFI adalah batas yang diaudit: minimalkan `unsafe`, dokumentasikan invariant.
- Jangan bangun sistem reactive UI, compiler frontend, ORM, dan package manager sekaligus; UI lewat adapter
  yang dapat diganti. Mulai dari compiler/bundler yang ada, pin versi compiler.
- Keamanan: validasi schema runtime di trust boundary; permission berbasis capability yang eksplisit
  (kapan diperiksa, bagaimana dicabut, apa yang terjadi saat ditolak). JS context terpisah bukan sandbox;
  isolasi plugin tidak tepercaya harus di level proses/OS. SSR butuh timeout, kanselasi, dan limit output.

## Baseline teknis (blueprint §6)

TypeScript strict · pnpm workspaces · host runtime Rust · engine V8 · test: unit + integrasi + property-based + fuzz ·
CI: lint → typecheck → test → build → security checks · observability: log terstruktur, metrics, tracing.

## Benchmark (blueprint §8)

Kondisi hardware/OS/versi yang sama, warm-up + beberapa ulangan, laporkan distribusi (p95/p99), bukan rata-rata;
simpan hasil sebagai artefak CI. Angka target di §8 adalah target eksperimen, bukan hasil.

## Langkah berikutnya (blueprint §12)

Pecah blueprint menjadi `architecture.md`, ADR pilihan runtime, kontrak API framework core, dan breakdown tugas Phase 0–1.
