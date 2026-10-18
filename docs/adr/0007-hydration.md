# ADR-0007: Hydration — Payload Inline + Satu Bundle Client + `hydrateRoot`

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: BLUEPRINT §4 (hydration & client navigation), ADR-0003 (React), ADR-0005 (Vite)

## Konteks

SSR sudah berjalan (HTML penuh dari layout + halaman + loader). Interaktivitas menuntut client
memuat pohon React yang sama dan hydrate di atas markup server.

## Keputusan

- **Satu bundle client** dibangun Vite lewat `@ramonyx/bundler` (`dist/client/client.js`,
  disajikan sebagai `/assets/client.js`). Code splitting menyusul.
- **Entry digenerate** `@ramonyx/compiler` (`generateClientEntry`): registry `path halaman →
  { page, layouts }` dengan impor relatif ke file sumber; hasil di `apps/<app>/.ramonyx/`.
- **Payload inline** sebelum bundle: `<script>window.__RAMONYX__={path,params,data}</script>`
  (JSON; `<` di-escape `\u003c`), lalu `<script type="module" src="/assets/client.js">`.
- **Container**: `<div id="ramonyx-root">` (konstanta `RAMONYX_MOUNT_ID`); tree hydrate =
  layout berantai membungkus halaman, sama persis dengan SSR.
- **Halaman error tidak di-hydrate** (render server saja) agar tidak mismatch: props-nya
  `error`, bukan `data`.
- **Loader data wajib JSON-serializable** (mitra kontrak publik untuk hydration).

## Alternatif yang ditolak

- Bundle per halaman — registry & build lebih rumit; optimasi menyusul setelah baseline.
- Islands/RSC — di luar scope MVP.
- Endpoint JSON terpisah untuk payload — satu request tambahan tanpa manfaat sekarang.

## Konsekuensi

- `pnpm build` wajib dijalankan sebelum halaman interaktif disajikan (aset statis dari
  `dist/client/`; dev server/HMR menyusul di item Phase 2 berikutnya).
- Perubahan bentuk payload = perubahan kontrak (dicatat di `docs/api/core-contract.md` §6).
- Bundle memuat semua halaman → ukuran membesar; code splitting dievaluasi berikutnya.
