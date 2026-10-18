# ADR-0008: Client Navigation — Soft Navigation (Fetch HTML → Swap → Re-hydrate)

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: BLUEPRINT §4 (navigasi tanpa full-page reload), ADR-0007 (hydration)

## Konteks

Setelah hydration, klik link masih memicu full page reload. Loader berjalan **server-side** dan data
halaman datang bersama HTML. Pilihan: SPA router + endpoint data, endpoint payload parsial, atau
fetch HTML penuh per navigasi.

## Keputusan

- **Soft navigation**: klik link same-origin (bukan modifier-click, bukan `target`/`download`,
  bukan hash-only) dicegat; fetch HTML dengan header `x-ramonyx-nav: 1`. Bila respons HTML OK:
  - ambil isi `#ramonyx-root` + payload `#ramonyx-payload` dari dokumen hasil fetch,
  - `unmount()` root lama → tukar `innerHTML` → `hydrateRoot` ulang,
  - `document.title` diperbarui, `history.pushState`, scroll ke atas.
- **Fallback** ke `location.assign` bila respons bukan HTML/gagal, payload/komponen tidak ada,
  atau fetch error. `popstate` (back/forward) juga soft-navigation.
- Script payload kini ber-`id="ramonyx-payload"` (kontrak ekstraksi; lihat core-contract §6).
- Script **tidak** dieksekusi ulang saat swap — hanya innerHTML container yang diambil, jadi
  bundle client tetap satu kali load.
- Navigasi yang sedang berjalan dibatalkan otomatis (`AbortController`) saat navigasi baru datang.

## Alternatif yang ditolak

- SPA router + endpoint JSON per halaman — menduplikasi sumber data; loader tetap server-side (Phase 2).
- Swap tanpa re-hydrate — kehilangan interaktivitas React setelah navigasi.
- View Transitions API — nice-to-have; menyusul setelah baseline.

## Konsekuensi

- Halaman error (tanpa payload) jatuh ke full navigation — konsisten dengan ADR-0007.
- Hanya `document.title` yang diperbarui; meta/head lain menyusul bila diperlukan.
- Setiap navigasi mengambil satu HTML penuh (belum streaming/partial payload).
