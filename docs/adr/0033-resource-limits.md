# ADR-0033: Resource Limits — Kuota Heap, Watchdog Timeout, Pencabutan Permission

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: BLUEPRINT §9 (Phase 5: "Resource isolation"), ADR-0023 (permission model)

## Konteks

Runtime yang menjalankan kode tak tepercaya butuh pagar sumber daya di level host — bukan hanya
permission (apa yang boleh diakses), tetapi juga **seberapa banyak** (memori, waktu). Tanpa ini,
satu loop tak berujung atau alokasi liar bisa menjatuhkan proses (DoS).

## Keputusan

### Kuota heap (`--max-heap-mb <MiB>`)

- Diterapkan via `v8::CreateParams::heap_limits(initial, max)` → `RuntimeOptions::create_params`
  (initial = `max/4` dijepit 2–16 MiB).
- **Near-heap-limit callback**: mencatat alasan ("batas heap V8 (N MiB) terlampaui"), memanggil
  `IsolateHandle::terminate_execution()`, lalu mengembalikan `current_limit + 16 MiB` sebagai
  **ruang unwind**. Tanpa ruang itu, V8 menempuh jalur OOM fatal (abort proses) sebelum flag
  terminasi sempat diproses — terverifikasi empiris.
- Hasil evaluasi dipetakan menjadi error jelas: `program dihentikan: batas heap V8 (16 MiB)
  terlampaui (limit saat ini 10 MiB)`; CLI keluar dengan kode 1, bukan crash.

### Watchdog timeout (`--timeout-ms <ms>`)

- Thread watchdog memegang `IsolateHandle` (thread-safe) dan men-`terminate_execution()` V8 bila
  batas waktu wall-clock terlampaui. `Drop` pada `Watchdog` mengirim sinyal batal + `join`, jadi
  eksekusi normal tidak meninggalkan thread menggantung.
- Berlaku untuk `execute` (script) dan `execute_module` (aplikasi).
- Error: `program dihentikan: timeout 300 ms terlampaui` (terminasi V8 tidak dapat ditangkap JS).

### Pencabutan permission (`ramonyx.permissions`)

- `ramonyx.permissions.get()` → `{ read, write, net, env }` (label `deny`/`allow-all`/`allow[...]`).
- `ramonyx.permissions.revoke("read"|"write"|"net"|"env")` → menetapkan `Deny`; **hanya bisa
  mengurangi** — kode JS tidak dapat memberi dirinya izin baru.
- Op fs/env/net memeriksa permission **saat dipanggil**, jadi pencabutan langsung berlaku untuk
  penggunaan kapabilitas berikutnya. Server yang sudah listening tetap melayani (menutup listener
  bukan bagian kontrak `revoke` — sama seperti model Deno).

### Wiring

- `EngineOptions { max_heap_mb, timeout }` diekspos lewat flag CLI; log `runtime.limits`
  mencatat kuota yang aktif.

## Bukti

- Unit: `timeout_menghentikan_loop_tak_berujung` (300 ms, error memuat "timeout"),
  `batas_heap_menghasilkan_error_jelas_tanpa_abort` (16 MiB, pesan "batas heap V8"),
  `permissions_get_dan_revoke` (revoke net → fetch ditolak `--allow-net`; revoke read → baca
  ditolak; jenis tak dikenal → error; snapshot awal benar).
- Smoke CLI: `while (true) {}` + `--timeout-ms 300` → `program dihentikan: timeout 300 ms
  terlampaui`, exit 1 · alokasi bertahap + `--max-heap-mb 16` → `batas heap V8 (16 MiB)`
  terlampaui, exit 1.
- 69 test Rust total; lint/typecheck/clippy/fmt bersih.

## Batasan yang dicatat jujur

- Kuota heap hanya mencakup **heap V8**: memori eksternal (data `ArrayBuffer`/`Uint8Array` besar)
  **tidak** dihitung — program yang membanjiri buffer eksternal belum dibatasi.
  > **Diperbarui (ADR-0038):** praktis tertutup — **kuota RSS proses** (`--max-rss-mb`)
  > menangkap memori eksternal, dan **kuota CPU per-thread** (`--max-cpu-ms`) menambah pagar
  > CPU yang berbeda dari timeout wall-clock.
- Satu alokasi **raksasa tunggal** (mis. `new Array(1 << 20)` per iterasi) masih dapat menabrak
  jalur OOM fatal V8 sebelum terminasi diproses; pola bertahap ditangani dengan benar.
- `--timeout-ms` adalah batas **wall-clock**, bukan kuota CPU; kode yang menunggu I/O (sleep)
  ikut terhitung.
- Tidak ada kuota CPU per op / isolasi worker — item Phase 5 lanjutan.

## Alternatif yang ditolak

- **Tanpa callback (hanya `heap_limits`)**: V8 abort proses saat limit terlewati — UX buruk dan
  tidak dapat diuji; callback + terminasi memberi error yang bisa ditangani host.
- **Monitor heap dari thread terpisah** (polling statistik): kalah cepat dari alokasi ketat dan
  menambah balapan; callback V8 berada tepat di jalur yang benar.

## Konsekuensi

- Runtime punya jalur DoS dasar: memori terbatas, waktu terbatas, kapabilitas dapat dicabut —
  prasyarat untuk isolasi worker/kuota penuh di Phase 5 berikutnya.
- Batas eksternal-memory dan kuota CPU dicatat sebagai pekerjaan lanjutan (bukan klaim).
