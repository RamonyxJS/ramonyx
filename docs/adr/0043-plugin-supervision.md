# ADR-0043: Supervisi Restart untuk Plugin (`restart` pada `ramonyx.spawn`)

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: ADR-0040 (batasan "tanpa restart supervision"), BLUEPRINT §9 (Phase 5 lanjutan)

## Konteks

Plugin proses (ADR-0040) mengisolasi crash, tetapi setelah plugin mati induk harus menangani
sendiri: tidak ada pengawasan, tanpa restart otomatis, tanpa observability. Untuk workload
latar (worker pemroses, agent, dsb.) ini memaksa kode induk menulis loop supervisi manual.

## Keputusan

- Opsi baru pada `ramonyx.spawn(entry, { restart })`:
  - `true` → default **3 restart, backoff 100 ms**; `false`/absen → tanpa supervisi;
  - `{ maxRestarts, delayMs }` → eksplisit.
- **Task supervisor** (tokio) dibuat saat supervisi aktif: menunggu proses anak, dan:
  - exit `0` → selesai normal, **tidak** di-restart;
  - exit non-zero/sinyal → **restart otomatis** setelah `delayMs`, sampai `maxRestarts`;
  - batas habis / `kill` → supervisor berhenti (terminal).
- State plugin dipindah ke `Arc<Mutex<PluginState>>` yang dibagi induk ↔ supervisor
  (child/pid/stdin/stdout diganti per generasi; `Notify` memberi sinyal perubahan generasi).
- `receive()` **melintasi restart**: EOF satu generasi → tunggu sinyal supervisor (dengan
  backstop 250 ms) → lanjut membaca generasi baru; terminal → `null`. **Mode tanpa supervisi
  mempertahankan perilaku lama** (EOF = selesai).
- `send()` menunggu singkat (≤ 2 s) bila sedang antar-generasi agar pesan tidak hilang.
- `kill()` menghentikan supervisi (flag `stopped` + SIGKILL lewat child/pid) dan mengembalikan
  exit code (poll `last_exit`); exit karena sinyal → `null`.
- `plugin.stats()` → `{ restarts, running, stopped, lastExit }` (observability).

## Bukti

- `plugin_supervisi_restart_otomatis`: plugin crash sekali (`exit(3)` pada generasi 1, via marker
  berkas) → `receive()` menerima pesan **generasi 2**; `stats` → `restarts=1`, `lastExit=0`,
  `stopped=true`.
- `plugin_supervisi_batas_restart_dihormati`: plugin selalu `exit(4)` dengan `maxRestarts: 2` →
  `receive()` `null`, `restarts=2`, `lastExit=4`.
- `plugin_supervisi_kill_menghentikan_tanpa_respawn`: runaway + `restart: true` → `kill()` →
  `stats.stopped=true`, `restarts=0` (tidak ada respawn), `receive()` `null`.
- 8/8 test plugin (5 lama tetap lulus); smoke CLI: crash sekali → `PESAN {"generasi":2}` +
  `STATS {"restarts":1,...,"lastExit":0}`.
- 99 test Rust total; clippy/fmt bersih.

## Temuan saat implementasi

1. **Regresi mode non-supervisi**: setelah refactor `receive` menunggu generasi berikutnya, tiga
   test lama menggantung — tanpa supervisor tidak ada yang mereap child, sehingga EOF harus
   tetap berarti "selesai" di mode tanpa supervisi. Diperbaiki + dikunci test lama.
2. **`lastExit` tidak muncul** karena `StatsEnvelope` perlu `#[serde(rename_all = "camelCase")]`
   (ketangkap test batas restart sebelum commit).
3. **Balapan kill vs exit normal**: SIGKILL dapat mendahului exit `0` sehingga kill mengembalikan
   `null`; test diselaraskan (beri waktu reap) dan sifat ini didokumentasikan.

## Batasan yang dicatat jujur

- Backoff **tetap** (belum eksponensial) dan **tanpa health-check/ping** — restart hanya ketika
  proses benar-benar mati (hang tidak terdeteksi; gunakan `timeoutMs` kuota).
- State plugin **hilang** saat restart: plugin harus idempoten/menyimpan progres sendiri
  (marker berkas pada test adalah contoh).
- Spesifikasi spawn (permission/kuota) identik untuk setiap generasi; tidak ada eskalasi.
- Batas 8 plugin aktif dan cap pesan 1 MiB tetap berlaku.

## Alternatif yang ditolak

- **Loop supervisi di kode JS induk** (status quo): setiap aplikasi menulis ulang logika yang
  sama, rawan race dengan `receive`.
- **Supervisor sebagai proses terpisah (init-style)**: kompleksitas proses tambahan untuk nilai
  yang sama di tahap alpha.
- **Restart pada exit 0 juga**: menyalahi makna "selesai"; plugin yang ingin daemon harus
  mengulang sendiri atau memakai `restart` dengan keluar non-zero.

## Konsekuensi

- Workload plugin latar dapat bertahan dari crash tanpa loop manual, dengan observability
  (`stats`) dan penghentian deterministik (`kill`).
- Sisa kandidat lanjutan: sandbox OS (seccomp/namespace), health-check/heartbeat, backoff
  eksponensial.
