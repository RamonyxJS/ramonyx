# ADR-0034: Isolasi Worker + Kuota (Isolate Terpisah per Worker)

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: BLUEPRINT §9 (Phase 5: "Resource isolation"), ADR-0023 (permission), ADR-0033 (kuota)

## Konteks

Phase 5 membutuhkan isolasi: menjalankan pekerjaan tak tepercaya tanpa (a) mengunci atau
menjatuhkan aplikasi induk, (b) mendapatkan kapabilitas lebih besar dari yang diberikan, dan
(c) melampaui kuota memori/waktu. Model Deno/Node adalah *worker* — eksekusi terpisah dengan
kanal pesan.

## Keputusan

- **Satu worker = thread OS + tokio runtime + isolate V8 sendiri** (`Engine` penuh), dibuat di
  thread baru; induk memegang `v8::IsolateHandle` (thread-safe) untuk kill switch.
- **Kanal pesan JSON** dua arah lewat `tokio::sync::mpsc` (unbounded, **batas 1 MiB per pesan**).
  API asimetris yang jelas:
  - induk: `const w = await ramonyx.worker(entry, options)` → `w.send(value)`,
    `w.receive()` (**`null` = worker selesai/dihentikan**), `w.terminate()`;
  - worker: `ramonyx.parent.send(value)` / `ramonyx.parent.receive()`.
- **Permission = irisan (anti-eskalasi)**: worker tidak pernah lebih longgar dari induk
  (`Permission::intersect`; daftar kosong → `Deny`). Default worker **deny-all** —
  `allow: { read: true|[…] , net, write, env }` bersifat permintaan, bukan hak.
- **Kuota per worker** dari ADR-0033: `maxHeapMb` (default mengikuti induk), `timeoutMs`
  (watchdog `terminate_execution`). Batas **8 worker aktif** per proses (guard fork bomb).
- **Kill switch**: `terminate()` men-set flag `closed` + `notify_waiters()` (membangunkan
  `receive()` yang pending, termasuk di sisi worker), memanggil `IsolateHandle::terminate_execution()`,
  lalu menutup kedua arah channel. Idempoten.

## Temuan implementasi

- `deno_core` menolak modul **"main" kedua** dalam satu runtime → test skenario berganda memakai
  engine terpisah; worker sendiri selalu runtime baru (tidak masalah).
- `#[op2]` tidak menerima `Option<String>` sebagai return `#[serde]` → dipakai amplop
  `WorkerMessage { text: Option<String> }`.
- `Permission::intersect` menormalkan daftar kosong hasil irisan menjadi `Deny` (bukan `Allow([])`)
  agar label/`get()` tetap jujur.

## Bukti

- Unit: irisan permission worker (induk allow-all/daftar/deny).
- Engine: **ping-pong + selesai** (`receive()` → `null` setelah worker keluar) · **default
  deny-all + intersection** (worker tanpa `allow` → baca ditolak; dengan `allow.read=[dir]` di
  bawah induk allow-all → lolos) · **anti-eskalasi** (induk deny-all + worker minta `read: true`
  → tetap ditolak) · **terminate runaway** (loop `for(;;)` → `terminate()` < 3 s, `receive()`
  `null`, `send` berikutnya error "sudah berhenti") · **timeout worker** (300 ms → berakhir).
- Smoke CLI: worker tanpa flag permission apa pun menjawab `{"hasil":42,"dari":"worker"}` lalu
  `null` (selesai).
- 75 test Rust total; lint/typecheck/clippy/fmt bersih.

## Batasan yang dicatat jujur

- Pesan **JSON saja** (bukan structured clone/transferables); tidak ada `SharedArrayBuffer`.
- Worker adalah **thread dalam proses yang sama** — bukan isolasi proses/OS; bug memori native
  di V8 tetap dapat menjatuhkan seluruh proses. Isolasi proses untuk plugin dicatat sebagai
  pekerjaan lanjutan (BLUEPRINT §5).
- Tidak ada pool/antrean worker, kuota CPU, atau pembatasan jumlah thread per worker (V8 membuat
  thread platformnya sendiri).
- Pemuatan modul worker tidak melewati permission `read` (sama seperti entry utama — pemuat modul
  bukan API fs).

## Alternatif yang ditolak

- **Isolasi proses per worker** — benar untuk plugin, tapi berat (startup ±3× lebih lambat,
  serialisasi lewat pipe); thread+isolate memberi isolasi *heap/eksekusi* dengan biaya rendah,
  dan jalur proses tetap terbuka untuk plugin di iterasi berikutnya.
- **Worker pool bawaan** — kebutuhan belum terbukti; batas 8 worker + API eksplisit lebih jujur.

## Konsekuensi

- Aplikasi dapat memindahkan pekerjaan berisiko (parse, komputasi, render) ke worker dengan kuota
  dan tanpa hak istimewa; kill switch memberi jalur recovery tanpa restart proses.
- Phase 5 sisa: kuota CPU/memori eksternal, isolasi proses untuk plugin, profiling (R4), rilis.
