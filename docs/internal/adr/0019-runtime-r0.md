---
adr: 0019
title: "Runtime R0 — Workspace Rust, CLI, Konfigurasi, Logging"
visibility: internal
---

# ADR-0019: Runtime R0 — Workspace Rust, CLI, Konfigurasi, Logging

**Pembaruan (2026-10-18):** R0 selesai dan langsung disusul **R1-lite** — spike engine berhasil
(deno_core/V8, lihat ADR-0020), `ramonyx-runtime run file.js` mengeksekusi JavaScript lewat V8.
Sisa R1 yang jujur dicatat: module loader/ESM import dan transform TypeScript.

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: BLUEPRINT §3 (tahapan R0–R4), ADR-0001 (strategi runtime)

## Konteks

Runtime sendiri adalah proyek eksperimental paralel; framework tetap berjalan di Node. Tahap R0
(BLUEPRINT §3): CLI, konfigurasi, entry point, logging — "program minimal bisa dijalankan".

## Keputusan

- **Workspace Cargo di root** (`Cargo.toml`, members `runtime/crates/*`) sesuai pohon BLUEPRINT §5.
- Crate pertama:
  - `runtime-core`: konfigurasi (`ramonyx.runtime.json`), structured logger JSON-lines (stdout/stderr
    dengan filter level), helper versi — **tanpa dependency berat** di R0.
  - `cli`: binary **`ramonyx-runtime`** dengan subcommand `version`, `config`, `run <entry>`.
- **Dependency R0 minimal**: `serde_json` (parsing config + menulis log JSON dengan escaping benar).
  Argumen CLI di-parse manual (jumlah flag kecil) supaya R0 tidak menyeret clap.
- **Engine belum di R0**: `run` memvalidasi entry + memuat konfigurasi + logging terstruktur; eksekusi
  JS menyusul di R1 (`js-engine`). Spike engine (deno_core/rusty_v8) dicoba terpisah dan hasilnya
  dicatat sebelum dijadikan dependency.
- Toolchain dipin: `rust-toolchain.toml` (channel + rustfmt/clippy) agar CI dan mesin dev sama.
- CI Rust: `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test --workspace`.
- Bahasa kode & logging runtime: identifier Inggris (konsisten coding-standards); pesan user-facing Inggris.

## Alternatif yang ditolak

- Menunda seluruh runtime sampai V8 terbukti — R0 tidak butuh engine dan memberi fondasi CLI/observability.
- Memakai clap sekarang — belum ada kebutuhan; tambah saat permukaan CLI membesar.
- Runtime sebagai crate di dalam paket TS — memisahkan toolchain (Cargo vs pnpm) lebih jelas.

## Konsekuensi

- `runtime/` berisi Rust; framework/paket TS tidak boleh bergantung padanya (batas ADR-0001).
- R0 belum menjalankan JavaScript — jangan mengklaim sebaliknya; exit criteria R1 = modul & error
  reporting teruji.
- Binary `ramonyx-runtime` tidak dipublikasikan (privat; publikasi menyusul bersama topologi rilis).
