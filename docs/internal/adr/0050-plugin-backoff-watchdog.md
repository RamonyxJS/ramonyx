---
adr: 0050
title: "Backoff Eksponensial + Health-Check Otomatis (Watchdog) untuk Plugin"
visibility: internal
---

# ADR-0050: Backoff Eksponensial + Health-Check Otomatis (Watchdog) untuk Plugin

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: ADR-0043 (batasan "backoff tetap"), ADR-0044 (batasan "deteksi hanya saat `receive`"),
  BLUEPRINT §9 Phase 5

## Konteks

Supervisi plugin (ADR-0043) memakai backoff **tetap** 100 ms dan menghitung kuota restart sejak
awal hidup plugin; health-check (ADR-0044) hanya dievaluasi di jalur `receive()` sehingga induk
yang tidak sedang membaca pesan tidak pernah mendeteksi plugin yang menggantung.

## Keputusan

- **Backoff eksponensial**: delay restart ke-n = `min(delayMs · 2^n, backoffMaxMs)`
  (default `backoffMaxMs` 30 dtk). `restart: true` → `maxRestarts` 3, `delayMs` 100.
  Fungsi murni `next_backoff` (saturasi, aman overflow) diuji unit.
- **Reset stabil**: generasi yang hidup ≥ `stableAfterMs` (default 60 dtk) dianggap stabil →
  kuota `restarts` di-reset saat generasi itu keluar. Crash-lambat tidak menghabiskan kuota;
  crash-cepat tetap dibatasi backoff.
- **Terminal eksplisit**: status "supervisor menyerah" kini penanda `supervisor_gave_up`
  (bukan `restarts >= maxRestarts`, yang tidak valid lagi setelah reset).
- **Task pembaca latar**: stdout plugin dibaca task sendiri (bukan `receive`) — memperbarui
  `last_activity`, memfilter heartbeat, dan mengantrekan pesan aplikasi
  (batas `MAX_QUEUED_MESSAGES` 4096; kelebihan → buang tertua + `droppedMessages` di stats).
  Batas baris masuk 1 MiB (simetris dengan pesan keluar).
- **Watchdog health-check**: saat `healthCheck` aktif, watchdog mengevaluasi deadline senyap
  berkala (`deadline/4`, min 25 ms) **tanpa** bergantung pada `receive` — membunuh lewat jalur
  yang sama dengan deteksi lama (idempoten per generasi via `hung_killed`), lalu supervisor
  me-restart.
- **Observability**: `plugin.stats()` menambah `nextBackoffMs` + `droppedMessages`; `running`
  kini benar untuk plugin tersupervisi (indikator `pid`, bukan handle `child` yang dipegang
  supervisor — bug laten yang ikut terperbaiki).

## Bukti

- Unit `backoff_eksponensial_terbatas_dan_saturasi`: 50 → 100 → 200 → cap(400) ms; saturasi di
  n=31 (tanpa overflow); `base > max` → max.
- `plugin_watchdog_mendeteksi_tanpa_receive`: generasi 1 senyap tanpa heartbeat → watchdog
  membunuh **tanpa induk memanggil `receive`** → restart generasi 2 (heartbeat) →
  `hangs=1`, `running=true`; pada implementasi lama test ini menggantung.
- `plugin_backoff_reset_setelah_generasi_stabil`: `maxRestarts: 1` + `stableAfterMs: 150` →
  generasi 3 berjalan (hanya mungkin bila kuota di-reset setelah generasi 2 stabil);
  `nextBackoffMs` ≤ cap.
- 10 test plugin lama tetap hijau (supervisi, health-check lama, timeout, permission);
  total **104 test Rust**; clippy/fmt bersih.

## Batasan yang dicatat jujur

- Health-check tetap **kooperatif** (plugin harus memanggil `ramonyx.heartbeat()`); watchdog
  hanya membuat deteksinya otomatis — plugin yang idle panjang tanpa heartbeat tetap bisa
  dianggap hang (pilih `deadlineMs` sesuai ritme pekerjaan).
- Antrean pesan dibatasi 4096; induk yang tidak pernah membaca akan **kehilangan pesan tertua**
  (terhitung di `droppedMessages`) — bukan backpressure ke plugin.
- Run-away CPU (spin tanpa senyap) tetap di luar cakupan deteksi ini — gunakan `maxCpuMs`
  (ADR-0038).
- `hangs` = jumlah pembunuhan health-check, bukan jumlah insiden unik.

## Alternatif yang ditolak

- **Ping/pong otomatis di bootstrap JS**: memperluas protokol & mengubah semantik `receive`
  (pull → push); watchdog berbasis heartbeat yang sudah ada cukup.
- **Backpressure nyata saat antrean penuh** (blokir pipe): memperumit reader latar dan
  berisiko deadlock induk ↔ anak; drop tertua + hitungan lebih sederhana dan teramati.
- **Reset kuota berbasis waktu sejak restart terakhir**: gagal membedakan generasi yang
  benar-benar sehat dari yang baru bangun.

## Konsekuensi

- Plugin latar: crash-cepat dibatasi backoff membesar, crash-lambat pulih sekuota penuh,
  dan hang terdeteksi walau induk sibuk.
- Sisa Phase 5: sandbox OS (seccomp/namespace), evaluasi `--strict` bench, hosting dokumentasi.
