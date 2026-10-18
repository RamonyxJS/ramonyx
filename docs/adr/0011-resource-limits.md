# ADR-0011: Resource Limits Secure-by-Default (Body 1 MiB, Timeout 10s)

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: BLUEPRINT §7 (malformed/oversized body, DoS), §9 Phase 3

## Konteks

Sebelumnya body request dibuffer penuh di adapter Node **tanpa batas**, dan handler/loader tidak
punya timeout — satu request bisa menghabiskan memori atau menggantung selamanya (dua baris pertama
threat model).

## Keputusan

- `createHandler` menerima `maxBodyBytes` (default **1 MiB**) dan `timeoutMs` (default **10.000 ms**);
  secure by default, dapat diubah per aplikasi.
- **413** bila header `content-length` melebihi batas (dicek **sebelum routing**) atau pembacaan
  streaming melampaui batas (menangkap content-length bohong / chunked).
- Body dibaca **streaming** dengan hitungan byte (`readBodyText`), bukan `request.text()`;
  adapter Node mengirim body sebagai stream (`Readable.toWeb`), bukan buffer penuh.
- **Timeout**: `Promise.race` + `AbortController`; saat lewat batas → 503
  `{"error":"Service Unavailable"}` + log `warn`, dan `context.request.signal` di-abort sehingga
  handler/loader yang peduli pembatalan bisa berhenti.
- `parseQuery` memakai `Object.defineProperty`: key `__proto__`/`constructor` menjadi properti
  sendiri; prototype objek tidak tersentuh (prototype pollution).

## Alternatif yang ditolak

- Membebankan limit pada adapter Node — kebijakan milik framework; adapter tetap generik (streaming).
- Batas opt-in tanpa default — melanggar prinsip secure-by-default (BLUEPRINT §1).

## Konsekuensi

- Aplikasi dengan payload >1 MiB wajib menaikkan `maxBodyBytes` secara eksplisit (didokumentasikan).
- Timeout 10s berlaku per request, mencakup middleware + loader + render.
- Fuzz/property test (`fast-check`) untuk router matching, query parsing, dan normalisasi schema;
  suite keamanan di `tests/security/`.
