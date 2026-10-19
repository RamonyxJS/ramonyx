# ADR-0072: DX Error — Overlay Dev, Kode Error Stabil, Tautan Docs

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: TODO `p2-error-dx`; rencana komprehensif F5.

## Konteks

Error SSR/loader di dev hanya menghasilkan halaman 500 generik (overlay Vite hanya menangani
error klien), dan pesan error framework tidak punya kode stabil/tautan docs — pengguna (dan
agen) harus menebak. Pesaing berinvestasi di overlay + pesan yang menuntun.

## Keputusan

1. **Overlay dev via detail error** (`errorDetails`, `createPageRoutes`):
   - default **otomatis**: aktif bila `NODE_ENV !== "production"` (dicek tanpa mengasumsikan
     `process` ada — aman di edge);
   - halaman error menerima `error.details = { stack, source }` (`ErrorPageProps`, aditif) dan
     halaman fallback (tanpa `error.tsx`) merender `<pre data-error-stack>` + sumber;
   - produksi tidak pernah menyertakan detail (test kebocoran dipertahankan eksplisit).
2. **Kode error stabil + tautan docs** (`@ramonyx/core`, `errors-docs.ts`): `errorHint(code)`
   menghasilkan sufiks `[kode RMX-…; docs: <url>#<kode>]`; tipe `ErrorCode` membatasi kode yang
   sah. Kode dipasang pada error publik:
   `RMX-CONFIG-1`, `RMX-ROUTES-1..5`, `RMX-BUILD-1/2`, `RMX-EDGE-1`.
3. **Halaman `docs/troubleshooting.md`**: satu heading per kode (anchor persis `#rmx-…` agar
   tautan `docsUrl()` bekerja), penjelasan + perbaikan; terbit otomatis di situs docs.
4. **Bukan** sistem error terpusat: `HttpError` (error aplikasi) tidak dipaksa berkode — kode
   adalah untuk error **framework** yang bisa ditindaklanjuti.

## Bukti

- `packages/ssr/test/pages.test.ts`: dev menampilkan stack + sumber (error page & fallback);
  produksi (`errorDetails: false`) tidak membocorkan; test lama "pesan asli tidak bocor"
  diperbarui menjadi eksplisit produksi.
- `packages/core/test/config.test.ts`: pesan memuat `RMX-CONFIG-1` + tautan troubleshooting.
- `packages/bundler/test/build.test.ts`: boundary error memuat `RMX-BUILD-1`.
- `docs/troubleshooting.md` + validasi link `pnpm docs:validate` (semua tautan relatif hidup).

## Alternatif yang ditolak

- **Overlay JS terpisah di dev server** (menyuntik skrip ke respons 500): menambah protokol
  injeksi + rapuh terhadap dokumen kustom; detail di halaman error (SSR) lebih sederhana dan
  bekerja juga untuk halaman yang dirender ulang action.
- **Kode error di semua error** (termasuk `HttpError` aplikasi): kebisingan tanpa manfaat —
  error aplikasi milik aplikasi.
- **Tautan docs absolut di setiap pesan**: sufiks ringkas `[kode …; docs: …]` dipilih agar pesan
  tetap terbaca; `docsUrl()` diekspor untuk kebutuhan lain.

## Konsekuensi

- Debugging dev langsung menunjuk stack + file; pesan error dapat dicari (kode stabil) dan
  menuntun ke solusi.
- Sisa kandidat: kode untuk error runtime tambahan (cache/edge saat jalan), halaman error bawaan
  bergaya overlay penuh, integrasi "salin stack" tombol.
