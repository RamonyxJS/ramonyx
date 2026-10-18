# ADR-0026: Resolusi `node_modules` (ESM) — Versi 1

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: BLUEPRINT §3 (R1: package compatibility, module resolution), ADR-0021

## Konteks

ADR-0021 menolak bare specifier dengan pesan jelas. Agar runtime bisa memakai dependency npm
(prasyarat compatibility suite), diperlukan resolusi `node_modules`.

## Keputusan

- **Walk-up `node_modules`**: dari direktori modul pengimpor naik ke atas; mendukung scope
  (`@scope/nama`) dan subpath (`paket/sub/ path`).
- **`exports` (versi 1)**: string, kondisi object dengan urutan tetap `import` → `module` →
  `default`, array (pertama yang berhasil), subpath map + wildcard `./*` (satu `*` per kecocokan).
- **Fallback tanpa `exports`**: `module` → `main` → `index.js`; seluruh kandidat melewati fallback
  ekstensi/`index` yang sama dengan impor relatif.
- **CommonJS ditolak dengan pesan jelas** (`.cjs` → "belum didukung"), bukan gagal misterius.
- Package.json invalid / paket hilang / subpath tidak diekspor → pesan yang menyebut penyebab.

## Batasan yang dicatat jujur (bukan klaim kompatibilitas penuh)

- Urutan key kondisi mengikuti daftar prioritas tetap, bukan urutan deklarasi penuh spesifikasi.
- Tanpa self-reference, `imports` (`#…`), conditional `types`, dan `browser` field.
- **CommonJS belum didukung** (tanpa interop `require`/`module.exports`); paket ESM-only saja.
- Resolusi `types`/TS deklarasi tidak relevan untuk eksekusi (transpile tanpa type-check).

## Alternatif yang ditolak

- **Port algoritma Node penuh** — besar dan belum dibutuhkan; v1 menutup mayoritas paket ESM.
- **Memakai resolver deno/npm sebagai proses eksternal** — membuat runtime bergantung pada
  toolchain lain; resolver internal menjaga kemandirian dan teruji hermetik.
- **CJS via `cjs-module-lexer` interop sekarang** — pekerjaan tersendiri; dicatat sebagai sisa.

## Konsekuensi

- `import { x } from "paket"` berfungsi untuk paket ESM dengan `exports`/`module`/`main`.
- Paket CJS (mayoritas ekosistem) masih ditolak → compatibility suite harus memakai paket ESM
  dulu; interop CJS adalah item berikutnya.
- Diverifikasi: 5 unit resolver (kondisi/subpath/wildcard/walk-up/error) + 1 integrasi engine
  (impor paket fixture end-to-end) — **45 test Rust** total.
