# ADR-0044: Health-Check Plugin (Heartbeat + Deteksi Senyap)

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: ADR-0043 (batasan "tanpa health-check"), BLUEPRINT §9

## Konteks

Supervisi restart (ADR-0043) hanya bereaksi ketika proses **mati**. Plugin yang **hang**
(loop sinkron di JS) tetap hidup sebagai proses sehingga tidak pernah di-restart — gap yang
dicatat jujur di ADR-0043.

## Keputusan

- Opsi `healthCheck` pada `ramonyx.spawn`: `true` (deadline 5 s) atau `{ deadlineMs }`.
- Plugin mengirim **heartbeat kooperatif**: `ramonyx.heartbeat()` menulis baris protokol
  khusus (`{"__ramonyx":"heartbeat"}`) ke stdout. Baris ini **difilter** `receive()` (bukan
  pesan aplikasi) dan memperbarui stempel aktivitas.
- **Deteksi senyap saat induk membaca**: ketika `receive()` sedang menunggu pesan, tidak ada
  baris (pesan **atau** heartbeat) dalam `deadlineMs` → dianggap hang → proses saat ini
  di-SIGKILL; `stats.hangs` bertambah. Dengan `restart` aktif, supervisor menghidupkan
  generasi baru dan `receive()` melanjutkan ke generasi itu; tanpa supervisi, plugin
  di-reap sendiri dan `receive()` mengembalikan `null` (`stopped=true`).
- Loop heartbeat yang umum: `(async () => { for (;;) { await ramonyx.sleep(100); await
  ramonyx.heartbeat(); } })()` — timer tidak jalan saat JS terblokir, jadi hang sinkron
  otomatis berhenti berdetak (itu justru sinyalnya).

## Bukti

- `plugin_health_check_restart_setelah_hang`: plugin heartbeat + diperintah "hang" (loop
  sinkron) → induk mendeteksi senyap (700 ms), kill, **restart generasi 2**; `stats` →
  `hangs=1`, `restarts=1`.
- `plugin_health_check_tanpa_supervisi_berakhir_null`: tanpa `restart` → `receive()` `null`,
  `stats.hangs=1`, `stopped=true`.
- 10/10 test plugin; smoke CLI: `SIAP-1 {"siap":1}` → hang → `SIAP-2 {"siap":2}` +
  `STATS {"restarts":1,"hangs":1}`.
- 101 test Rust total; clippy/fmt bersih.

## Batasan yang dicatat jujur

- **Kooperatif**: plugin harus memanggil `ramonyx.heartbeat()` secara berkala; plugin yang
  idle lama (tidur panjang tanpa heartbeat) bisa dianggap hang — pilih `deadlineMs` sesuai
  ritme pekerjaan (atau matikan health-check).
- **Deteksi saat induk menunggu**: pengecekan terjadi di jalur `receive()`; jika induk sibuk
  dan tidak membaca, hang baru terdeteksi ketika membaca lagi.
- Heartbeat menambah trafik stdout (satu baris per panggilan) — interval diserahkan ke plugin.
- Tanpa backoff eksponensial (mengikuti ADR-0043).

## Alternatif yang ditolak

- **Heartbeat otomatis dari runtime plugin**: timer JS yang selalu hidup akan menahan event
  loop sehingga proses plugin tidak pernah selesai; mematikan drain event loop demi itu
  mengubah semantik CLI secara luas — tidak sepadan untuk alpha.
- **Auto-pong dari sisi Rust**: menjawab bahkan saat JS hang → tidak mendeteksi apa pun.

## Konsekuensi

- Gap hang pada ADR-0043 tertutup untuk pola supervisi yang umum (induk menunggu pesan),
  dengan biaya kooperatif yang dinyatakan jelas.
- Kandidat lanjutan: health-check otomatis (mis. watchdog per-isolate dengan liveness dari
  V8 interrupt), backoff eksponensial, sandbox OS.
