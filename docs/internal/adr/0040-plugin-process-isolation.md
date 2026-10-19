---
adr: 0040
title: "Isolasi Level Proses untuk Plugin (`ramonyx.spawn`)"
visibility: internal
---

# ADR-0040: Isolasi Level Proses untuk Plugin (`ramonyx.spawn`)

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: BLUEPRINT §5 ("isolasi plugin di level proses/OS") & §9 (Phase 5), ADR-0034 (worker)
- **Diperbarui ADR-0051**: sandbox OS (Landlock) kini tersedia sebagai opsi opt-in —
  batasan "tanpa sandbox OS" di bawah sudah tidak berlaku (isolation namespace/PID tetap belum).

## Konteks

Worker (ADR-0034) adalah **thread** di proses yang sama: cukup untuk isolasi heap/eksekusi dan
kuota, tetapi crash fatal V8 (mis. OOM native) tetap menjatuhkan seluruh proses. Blueprint
meminta isolasi plugin di level proses/OS.

## Keputusan

### Proses terpisah, satu prototype yang sama

- `ramonyx.spawn(entry, options)` menjalankan **proses** `ramonyx-runtime run <entry> --plugin`
  (binari yang sama) — induk dan plugin berbagi kode, tetapi **alamat memori, heap V8, dan
  crash boundary berbeda**.
- Protokol: **JSON per baris** di stdin/stdout anak; **log anak ke stderr** sehingga stdout
  anak murni kanal protokol.
- API induk: `{ id, send, receive, kill }`; `kill()` men-SIGKILL dan mengembalikan exit code
  (`null` bila dihentikan sinyal). Di sisi plugin: `ramonyx.parent.send/receive` yang **sama**
  dengan worker, plus `ramonyx.exit(code)` untuk menyelesaikan diri.

### API `ramonyx.parent` terpadu

- `op_parent_send/op_parent_receive` merutekan: kanal worker (thread) bila ada, selain itu
  jembatan stdio — **hanya aktif dengan flag `--plugin`** (program biasa tidak boleh membaca
  stdin host tanpa sengaja).
- Efek: kode plugin/worker memakai API yang identik; test worker lama lulus tanpa perubahan.

### Batas kapabilitas & kuota (anti-eskalasi)

- Permission plugin = **irisan permission induk** dengan yang diminta (resolver yang sama
  dengan worker; `allow.read/write/net/env` → flag `--allow-*`).
- Kuota diteruskan sebagai flag: `maxHeapMb`/`maxCpuMs`/`maxRssMb` (default mewarisi induk),
  `timeoutMs`, dan `--tls-ca` bila induk memilikinya.
- Batas 8 plugin aktif, pesan ≤ 1 MiB, `kill_on_drop(true)` (anak ikut mati bila induk
  berhenti mendadak).

### Penemuan binari

- `RAMONYX_RUNTIME_BIN` → `current_exe` (bila bernama `ramonyx-runtime`) → sibling
  `target/<profil>/ramonyx-runtime` (dipakai test). **Embedder yang menyematkan engine wajib
  mengatur `RAMONYX_RUNTIME_BIN`** — dicatat jelas di pesan error.

## Bukti

- 5 test integrasi (`tests/plugin_process.rs`): roundtrip pesan + selesai (`receive` → null);
  **`exit(7)` plugin tidak menjatuhkan induk** + exit code terbaca; **kill proses yang
  menggantung** (< 3 s, `send` berikutnya error); **irisan permission** (induk allow-all +
  izin baca → lolos; induk deny-all + minta baca → ditolak); **timeout kuota** → plugin berhenti
  dengan exit 1.
- Test CLI: mode `--plugin` — stdout hanya protokol (`{"balas":42}` tanpa log), log terstruktur
  di stderr.
- 96 test Rust total; lint/typecheck/clippy/fmt bersih.

## Batasan yang dicatat jujur

- Ini **isolasi crash & kapabilitas**, bukan sandbox adversarial: plugin menjalankan binari
  runtime yang sama dan mewarisi stderr induk; eksploitasi kernel/OS di luar cakupan.
- Protokol JSON per baris (tanpa biner/framing besar); tanpa restart supervision/health-check;
  tanpa namespace/seccomp (lapisan produksi tetap container/cgroup).
- Kuota CPU/RSS anak hanya berlaku di Linux (flag-nya; sama seperti ADR-0038).
- Belum ada `wait()` terpisah untuk exit code di luar `kill()`.

## Alternatif yang ditolak

- **Hanya worker thread** (status quo): tidak menjawab crash fatal V8 — inti kebutuhan.
- **Daemon soket terpisah** sebagai host plugin: protokol & lifecycle jauh lebih berat untuk
  value yang sama di tahap ini.
- **Proses via container/orchestrator**: urusan deployment, bukan runtime.

## Konsekuensi

- Item **isolasi level proses** pada Phase 5 selesai; sisa Phase 5 hanya publikasi npm
  sebenarnya (butuh kredensial) — keputusan pemilik.
- Plugin tak tepercaya dapat dijalankan tanpa membahayakan kestabilan induk, dengan kapabilitas
  eksplisit dan kuota yang bisa dimatikan (`kill`).
