# ADR-0038: Kuota CPU (Per-Thread) + RSS Proses — Menutup Gap Memori Eksternal

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: ADR-0033 (batasan yang dicatat), BLUEPRINT §9 (Phase 5: resource isolation)

## Konteks

ADR-0033 mencatat dua gap yang belum tertutup:

1. **Kuota heap hanya heap V8** — memori eksternal (`ArrayBuffer`/`Uint8Array` besar) tidak
   dihitung; program dapat membanjiri memori lewat alokasi eksternal.
2. **Tidak ada kuota CPU** — `--timeout-ms` adalah wall-clock, sehingga program yang menunggu
   I/O (atau tidur) memakan kuota yang sama dengan program yang berputar.

## Keputusan

### Kuota CPU **per-thread** (`--max-cpu-ms`)

- Engine mencatat TID thread pembuatnya (`libc::gettid`; `JsRuntime` tidak `Send`, jadi engine
  selalu dipakai di thread yang sama).
- Guard mem-polling `/proc/self/task/<tid>/stat` (utime+stime, USER_HZ=100) tiap **25 ms**;
  melebihi kuota → `terminate_execution()` + alasan `kuota CPU N ms terlampaui (CPU thread
  engine M ms)`.
- Per-thread dipilih setelah temuan test: kuota **proses** tercemar thread GC/kompilasi V8 dan
  pekerjaan proses lain (test paralel) — program yang hanya `sleep` bisa kena kuota. Per-thread
  membuat "menunggu I/O tidak memakan kuota" benar-benar berlaku, sekaligus mengecualikan thread
  GC V8 (biaya internal, bukan biaya program).

### Kuota RSS **proses** (`--max-rss-mb`) — menutup gap memori eksternal

- Guard mem-polling `/proc/self/statm` tiap 25 ms; melebihi → terminasi dengan alasan
  `kuota RSS N MiB terlampaui (RSS proses M MiB; termasuk memori eksternal V8)`.
- RSS menghitung **halaman resident** — alokasi `mmap` yang tidak disentuh tidak dihitung
  (temuan test: `new Uint8Array(1MB)` tanpa `fill` tidak menaikkan RSS; guard menguji memori
  yang disentuh).
- Sifat yang dicatat: kuota ini **proses-wide** (mencakup worker/isolate lain dan biaya V8) —
  memang disengaja sebagai pagar host, bukan atribusi per-engine.

### Umum

- Keduanya **Linux-only**; di platform lain engine menolak konfigurasi dengan pesan jelas.
- Keduanya **diwarisi worker** dari induk (pelindung proses yang sama).
- Guard berhenti & di-join saat eksekusi selesai (infrastruktur `Watchdog` yang sama).

## Bukti

- `kuota_cpu_menghentikan_loop_tak_berujung` (spin → error "kuota CPU", < 5 s).
- `kuota_cpu_bukan_wall_clock` (`sleep(1200)` dengan kuota 300 ms CPU → **lulus**).
- `kuota_rss_menangkap_memori_eksternal` (ArrayBuffer 1 MiB disentuh berulang → terminasi
  "kuota RSS"; memori eksternal yang tidak dilihat kuota heap).
- CLI: test integrasi `--max-cpu-ms 300` pada loop → exit 1 dengan pesan kuota CPU; smoke
  manual untuk RSS (`--max-rss-mb 64` → pesan RSS).
- 90 test Rust total; lint/typecheck/clippy/fmt bersih.

## Batasan yang dicatat jujur

- **Bukan sandbox**: guard adalah pagar DoS level host; isolasi keamanan tetap mengandalkan
  permission + (kelak) isolasi proses.
- **Window polling 25 ms**: alokasi tunggal yang sangat besar (mis. 8 GiB sekaligus) dapat
  menabrak OOM OS sebelum poll pertama — sama-sama kerasnya dengan perilaku runtime lain, tetapi
  dicatat.
- RSS proses termasuk semua worker/isolate di proses yang sama (dokumentasi, bukan bug).
- Untuk produksi, **cgroup/container limits** tetap lapisan yang lebih tepat; kuota ini adalah
  pertahanan dalam-runtime.

## Alternatif yang ditolak

- **`getrusage(RUSAGE_THREAD)` dari guard**: guard thread ≠ thread engine, jadi mengukur thread
  yang salah; `/proc/self/task/<tid>/stat` mengukur thread target dengan benar tanpa dependency
  berat.
- **Kuota CPU proses** (versi pertama implementasi): terbukti tercemar GC/pekerjaan lain lewat
  test — dipindahkan ke per-thread.

## Konsekuensi

- Gap resource-limits ADR-0033 **tertutup pada level praktis**: memori eksternal kini punya
  pagar (RSS) dan CPU punya kuota yang benar-benar CPU (bukan wall-clock).
- Sisa Phase 5: isolasi level proses untuk plugin, release pipeline.
