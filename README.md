# Ramonyx

Framework full-stack TypeScript + runtime eksperimental (Rust + V8), dikembangkan sebagai dua
proyek yang terintegrasi tetapi terpisah. Visi dan keputusan teknis lengkap:
[docs/BLUEPRINT.md](docs/BLUEPRINT.md).

> **Status: Phase 0 — fondasi & RFC.** Belum ada kode yang berjalan. Isi repositori ini adalah
> rencana dan kontrak, bukan fitur yang sudah tersedia.

## Peta dokumen

| Dokumen | Isi |
| --- | --- |
| [`docs/BLUEPRINT.md`](docs/BLUEPRINT.md) | Blueprint teknis: arsitektur, stack, threat model, benchmark, roadmap fase |
| [`docs/PRD.md`](docs/PRD.md) | Persyaratan produk (sebagian masih pertanyaan terbuka) |
| [`docs/architecture.md`](docs/architecture.md) | Ringkasan arsitektur, peta package, kontrak framework ↔ runtime |
| [`docs/adr/`](docs/adr/README.md) | Catatan keputusan arsitektur (ADR) |
| [`docs/api/core-contract.md`](docs/api/core-contract.md) | Kontrak API framework core v0 |
| [`docs/security/threat-model.md`](docs/security/threat-model.md) | Threat model + basis OWASP ASVS |
| [`docs/benchmark-protocol.md`](docs/benchmark-protocol.md) | Protokol benchmark |
| [`docs/coding-standards.md`](docs/coding-standards.md) | Standar kode, dependensi, testing |
| [`docs/roadmap/phase-0-1.md`](docs/roadmap/phase-0-1.md) | Breakdown tugas + exit criteria Phase 0–1 |
| [`AGENTS.md`](AGENTS.md) | Pintu masuk sesi agen |

## Prasyarat (mulai Phase 1)

- Node.js LTS — tersedia di mesin dev (v24).
- pnpm — **belum terpasang di mesin dev**: `corepack enable pnpm` atau `npm i -g pnpm`.
- Rust toolchain — untuk Phase 4+ (sudah terpasang).

## Aturan singkat

- Bahasa: dokumen/narasi internal Bahasa Indonesia; teks yang dilihat publik (README npm,
  docs situs, pesan error) Bahasa Inggris.
- Klaim performa/keamanan hanya dengan bukti yang bisa dijalankan — lihat BLUEPRINT §10 dan
  [`docs/benchmark-protocol.md`](docs/benchmark-protocol.md).
