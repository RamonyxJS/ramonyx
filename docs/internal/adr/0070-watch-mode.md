---
adr: 0070
title: "Watch Mode Build (`ramonyx build --watch`)"
visibility: internal
---

# ADR-0070: Watch Mode Build (`ramonyx build --watch`)

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: TODO `p2-watch-mode`; rencana komprehensif F5.

## Konteks

`ramonyx dev` (Vite + HMR) adalah loop pengembangan utama, tetapi ada skenario yang butuh
perilaku produksi-like: menguji build sebelum deploy, atau bekerja tanpa jalur Vite.
Pesaing menyediakan `vite build --watch`/`nuxt build --watch`.

## Keputusan

1. **`ramonyx build --watch`**: memantau `src/**` (recursive `fs.watch`), debounce 200 ms,
   lalu menjalankan ulang putaran build yang sama dengan sekali-jalan:
   - bundel klien (+ aset ber-hash);
   - `--static` → prerender ulang;
   - `--target edge` → bangun ulang artefak edge.
2. **Antrean aman**: build yang sedang berjalan tidak ditumpuk — perubahan selama build
   menandai `dirty` dan dijadwalkan setelahnya (tidak ada dua build paralel).
3. **Error tidak menghentikan watch**: kegagalan build dicetak (`watch: build gagal — …`) dan
   loop tetap menunggu perubahan berikutnya.
4. **Keluar bersih**: SIGINT/SIGTERM menutup watcher + timer lalu keluar (`watch: berhenti`).
5. **Refactor**: putaran build diekstrak ke `buildOnce()` — dipakai sekali-jalan dan watch
   (satu implementasi; `commandBuild` tinggal memilih mode).
6. **Bukan pengganti `ramonyx dev`**: tanpa HMR/reload browser; dokumen perbedaan di USAGE.

## Bukti

- `apps/create-app/test/create-app.test.ts`: spawn CLI `build --watch` pada app hasil scaffold →
  menunggu `watch: memantau` → menyentuh `src/routes/page.tsx` → build kedua terdeteksi
  (`client bundle` bertambah) → SIGTERM bersih.

## Alternatif yang ditolak

- **Memakai `vite build --watch` mentah**: tidak menangani prerender/edge/aset/manifest
  Ramonyx; putaran `buildOnce` yang sama lebih konsisten (dan sudah teruji).
- **Watch + restart server produksi otomatis**: menambah manajemen proses (port, sinyal, PID)
  yang lebih cocok jadi fitur terpisah (`ramonyx start --watch` kandidat); tidak diklaim di sini.
- **Polling berkas**: lebih boros; `fs.watch` recursive didukung Node ≥24 (baseline repo).

## Konsekuensi

- Loop build produksi-like menjadi satu perintah; DX naik tanpa menyentuh jalur dev/HMR.
- Sisa kandidat: `start --watch` (restart server), watch khusus direktori, output ringkas
  berwaktu.
