# ADR-0020: Engine JavaScript — V8 via `deno_core`

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: ADR-0001 (Rust + V8), ADR-0019 (R0), BLUEPRINT §3 (spike sebelum dependency)

## Konteks

R0 selesai tanpa engine. Untuk R1 dibutuhkan eksekusi JavaScript. Opsi: `rusty_v8` mentah
(binding V8 langsung), `deno_core` (runtime core Deno yang membungkus V8, menyediakan ops/extension
dan prebuilt binary), atau engine lain (QuickJS).

## Keputusan

- **`deno_core` v0.412** sebagai jalur embed V8:
  - spike build berhasil di mesin dev (±2m31s, memakai binary V8 prebuilt — tidak membangun V8 dari
    nol), clippy bersih, dan eksekusi script + `console.log` lewat op berjalan;
  - versi dipin di `Cargo.toml` crate `js-engine`; upgrade diperlakukan sebagai perubahan besar.
- **`js-engine` (R1-lite)**: `Engine::new()/execute()` menjalankan **script JS** (bukan ESM import),
  `console.*` dipetakan ke ops (`op_log`/`op_log_error`), error V8 dikembalikan apa adanya.
- **CLI `run`**: `.js/.cjs` dieksekusi; `.mjs` dijalankan sebagai script dengan peringatan
  `esm.module_loader_pending`; `.ts/.tsx` hanya divalidasi + dicatat `transform.not_implemented`
  (transform TS dan module loader = sisa R1). Semua jujur dilaporkan di log terstruktur.
- `rusty_v8` mentah ditolak sebagai langkah awal (biaya FFI/link & upgrade lebih tinggi tanpa
  manfaat untuk R1); dapat dipertimbangkan kembali bila `deno_core` menghambat.

## Alternatif yang ditolak

- **QuickJS** — throughput/ekosistem belum terukur untuk target (Blueprint Opsi B); tetap catatan.
- **rusty_v8 langsung** — kontrol penuh, tetapi seluruh plumbing runtime (ops, snapshot, error)
  menjadi pekerjaan kita sendiri lebih awal dari kebutuhan.
- **Menunda engine** — R1 tidak bisa dimulai tanpa eksekusi JS; spike sudah membuktikan kelayakan.

## Konsekuensi

- Rantai dependency V8/deno_core besar; build pertama lambat (~2,5 menit, cache `target/` penting;
  CI memakai `Swatinem/rust-cache`).
- Deno APIs (permission, ops) milik deno_core — kita **tidak** mengeksposnya langsung; runtime kita
  hanya memakai subset eksekusi script sampai module loader/permission sendiri (R1–R3) dibangun.
- Kompatibilitas npm/ESM penuh belum ada — jangan diklaim (target jangka panjang BLUEPRINT §10).
