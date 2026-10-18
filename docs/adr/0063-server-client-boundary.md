# ADR-0063: Batas Server/Client — Konvensi `*.server.ts` + Penegakan Build

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: TODO `p1-boundary-lint` (analisis kesenjangan §3: "Penegakan otomatis batas
  server/client: belum"; utang yang diakui di audit dokumentasi)

## Konteks

Modul halaman (`page.tsx`) bersifat **isomorfik**: dipakai SSR dan masuk bundle klien untuk
hydration. Karena itu, impor `node:*` di modul halaman merusak bundle klien (Vite menggantinya
dengan shim `__vite-browser-external` yang kosong) — bug keamanan/korupsi yang dulu tidak
terdeteksi saat build. Sebelumnya kebocoran hanya ditemukan bila diuji di browser.

## Keputusan

1. **Konvensi `*.server.ts`**: modul server (fs/db/rahasia) diberi akhiran `.server.ts`.
   Halaman boleh mengimpornya (dipakai `loader`/`action` yang berjalan di server).
2. **Stub poison-pill di bundle klien** (plugin Vite `ramonyx-server-only`, dipakai
   `buildClient` **dan** dev server): impor `*.server.ts` dari modul klien diresolusi ke modul
   virtual berisi stub untuk setiap ekspor (nama diparse dari sumber) yang **melempar** dengan
   pesan jelas bila dipanggil di browser. Implementasi/API server tidak ikut ke klien.
3. **Penegakan dua lapis**:
   - **Pre-check**: modul yang masuk bundle klien (page/layout) dilarang mengimpor `node:*`
     langsung → error build menyebut file + modul;
   - **Post-build**: output bundle dipindai untuk shim `__vite-browser-external` dan `node:*`
     (impor transitif lewat modul non-`.server.ts`) → error build dengan daftar pelanggaran.
4. **Dokumentasi + aturan agen**: `rules.json` (`client-server-boundary`) diperbarui — konvensi,
   contoh benar/salah, penegakan; `docs/architecture.md`/`core-contract` menyebut pola ini di
   catatan implementasi.

## Bukti

- `packages/bundler/test/build.test.ts`: fixture halaman → `data.server.ts` (memakai `node:fs`)
  **build sukses** dan bundle memuat pesan stub; fixture halaman → `node:fs` langsung
  **build ditolak** dengan pesan `Batas server/client dilanggar`.
- Playground/docs/template tetap hijau (tidak ada impor server dari modul klien).
- Suite penuh + e2e hijau setelah perubahan.

## Alternatif yang ditolak

- **Hanya dokumentasi/konvensi tanpa penegakan**: masalah yang sama akan terulang (kelas bug yang
  tidak terlihat sampai runtime browser). Ditolak.
- **Memisahkan loader ke file server (pola Remix/`+page.server.ts`)**: perubahan model halaman
  besar (dua file per rute); stub poison-pill memberi keamanan serupa tanpa membelah modul.
- **Menghapus ekspor server dari bundle klien (tree-shake manual)**: rapuh terhadap pola impor;
  stub per ekspor deterministik dan pesannya menuntun.

## Konsekuensi

- Pola aman untuk data server: `import { db } from "./db.server.ts"` di halaman; pemanggilan dari
  kode klien gagal cepat dengan pesan yang menunjuk file.
- Build klien menambah dua pemeriksaan ringan (scan file halaman + scan output).
- Sisa kandidat: lint statis (Biome plugin) untuk konvensi, stub untuk `#server` virtual module,
  peringatan dev saat stub benar-benar dipanggil.
