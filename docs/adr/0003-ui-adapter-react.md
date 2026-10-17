# ADR-0003: Adapter UI Pertama — React

- Status: Accepted (keputusan pemilik, 2026-10-18)
- Tanggal: 2026-10-18
- Sumber: `docs/BLUEPRINT.md` §4, §6

## Konteks

Blueprint menetapkan frontend sebagai "adapter UI pluggable" dan melarang membangun sistem
reactive UI/renderer sendiri. Contoh `layout.tsx`/`page.tsx` di §4 memakai model JSX. MVP butuh
satu target konkret agar kontrak render/SSR/hydration dapat diuji.

## Keputusan

- **React** adalah adapter UI pertama (SSR, hydration, client navigation).
- Adapter tetap pluggable: core berbicara lewat interface adapter (render halaman → HTML,
  hydrate + navigasi di client), bukan terikat React.
- React hidup di package adapter (`packages/react` atau package setara — posisi final ditentukan
  di `docs/architecture.md`), bukan di `core`.

## Alternatif yang ditolak

- **HTML minimal/vanilla dulu** — menunda target hydration/navigasi yang justru inti Phase 2;
  berisiko pekerjaan ganda.
- **Renderer sendiri** — dilarang Blueprint §4.
- Adapter lain (Vue/Svelte/Solid, dsb.) tetap mungkin sebagai adapter berikutnya; bukan scope MVP.

## Konsekuensi

- `react`/`react-dom` menjadi peer dependency adapter; versinya dipin dan diuji.
- Streaming SSR (Phase 2) memakai API render streaming React.
- Interface adapter wajib netral-UI agar adapter kedua tidak menuntut perubahan core.

## Cara membuktikan

- Phase 2: browser test demo app — hydration dan navigasi tanpa full reload; output SSR sesuai.
