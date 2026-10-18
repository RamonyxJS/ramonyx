# ADR-0060: Prefetch Halaman Klien (Hover/Focus/Viewport)

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: TODO `p1-prefetch` (analisis kesenjangan §3: "soft navigation — belum ada prefetch
  saat hover/viewport")

## Konteks

Soft navigation (ADR-0008) baru mulai fetch saat tautan diklik, sehingga navigasi selalu
menunggu satu round-trip penuh; framework pesaing memuat halaman tujuan lebih awal
(Next `Link` prefetch default, SvelteKit preload saat hover, Nuxt `NuxtLink` prefetch).

## Keputusan

1. **Prefetch di klien** (`@ramonyx/react/client`, tanpa API baru bagi pengguna):
   - pemicu: `pointerover` (hover), `focusin` (keyboard), dan `IntersectionObserver`
     (viewport, `rootMargin: 200px`) untuk tautan same-origin yang dapat dinavigasi;
   - pengamatan ulang setelah setiap swap (soft navigation) — tautan baru ikut teramati.
2. **Cache prefetch in-memory**: maksimum 8 entri (LRU sederhana), TTL 30 detik, maksimum 2
   request bersamaan, dedupe per URL. Navigasi memakai HTML cache bila masih segar (tanpa
   request), lalu menghapus entri tersebut (sekali pakai).
3. **Permintaan prefetch bertanda** `x-ramonyx-prefetch: 1` (observability; dapat dipakai
   server untuk menyesuaikan perilaku/analitik di masa depan).
4. **Batas**: hanya respons HTML 2xx yang di-cache; kegagalan diabaikan senyap (prefetch adalah
   optimisasi, bukan jaminan). `dispose()` membersihkan listener, observer, dan cache.

## Bukti

- E2E `apps/playground/e2e/prefetch.spec.ts`: respons prefetch (`x-ramonyx-prefetch`) selesai
  sebelum klik; setelah klik, **nol** request navigasi (`x-ramonyx-nav`) untuk URL yang
  sudah di-prefetch — cache benar-benar dipakai, dan halaman tetap dirender/hydrate.

## Alternatif yang ditolak

- **Prefetch semua tautan saat load**: membanjiri server (banyak tautan) dan memboroskan
  bandwidth mobile — dipilih pemicu hover/focus/viewport dengan batas konkurensi.
- **Cache tanpa TTL**: HTML bisa basi (data berubah); TTL + sekali-pakai membatasi risiko.
- **Prefetch data JSON terpisah**: kontrak saat ini berbasis HTML penuh (paritas SSR); tidak
  ada jalur data kedua yang perlu dijaga.

## Konsekuensi

- Navigasi terasa instan pada tautan yang sudah di-hover/di-viewport; server menerima beban
  prefetch (dibatasi 2 konkuren).
- Sisa kandidat: `priority`/`prefetch={false}` per tautan (opt-out), prefetch sadar-auth,
  integrasi dengan revalidasi (p1-revalidate).
