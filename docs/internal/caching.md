# Caching Data (Revalidasi) — ISR-lite

Ramonyx menyediakan cache **data loader** per halaman: TTL + stale-while-revalidate +
invalidasi on-demand dari action/API route. Keputusan desain: ADR-0066.

- Status: tersedia sejak 0.2.0 (ADR-0066).
- Prinsip: yang di-cache adalah **data**, bukan HTML — HTML memuat nonce CSP per request
  (ADR-0014), sehingga men-cache HTML akan memakai ulang nonce (tidak aman).

## Mulai

```tsx
// src/routes/produk/page.tsx
export const revalidate = 60;              // detik (TTL)
export const cacheTags = ["produk"];       // opsional, untuk invalidasi kelompok

export async function loader() {
  return { produk: await db.produk() };     // data harus JSON-serializable
}
```

Wiring aplikasi (`src/app.ts`):

```ts
import { createCache } from "ramonyx";

const cache = createCache();   // default: store in-memory (ADR-0065)

return createHandler({
  routes: [
    ...createPageRoutes({ pages, renderer, cache }),
    // API route yang butuh invalidasi manual:
    // { method: "POST", path: "/api/revalidate", definition: route({ handler: async () => {
    //     await cache.revalidate({ paths: ["/produk"], tags: ["produk"] });
    //     return Response.json({ ok: true });
    //   } }) },
  ],
});
```

Invalidasi dari **action** (tanpa API route terpisah):

```tsx
export async function action({ revalidate }: PageActionContext) {
  await simpanPerubahan();
  await revalidate?.({ tags: ["produk"] });   // juga memicu hook onInvalidate
  return { message: "Tersimpan." };
}
```

## Semantik

- **Cache hit**: dua GET berturut-turut → loader dipanggil sekali; hook `onLoaderEnd.cached = true`.
- **Stale-while-revalidate**: setelah TTL lewat, permintaan berikutnya **langsung** mendapat data
  lama sementara refresh berjalan di belakang (dedupe per key — tidak stampede).
- **Kunci cache**: `rute + params`. **Query string atau cookie → cache dilewati** (respons yang
  bergantung sesi/filter tidak pernah disajikan dari cache).
- **Invalidasi**: `paths` (path konkret, mis. `/produk/42`) memakai tag internal `path:<path>`;
  `tags` kustom dari `cacheTags`. Pola rute juga bertag `route:<pola>` (invalidasi semua instance).
- **Store**: `createCache({ store })` untuk implementasi eksternal (Redis dll.) — wajib lolos
  `tests/contracts/store.test.ts`.
- **Hook**: `onInvalidate({ paths, tags, reason })` — dipakai observability/plugin.

## Interaksi dengan fitur lain

- **SSG (`ramonyx build --static`)**: prerender berjalan saat build; cache runtime tidak dipakai
  (halaman statis tidak menjalankan loader lagi). Jangan campur asumsi keduanya.
- **Streaming (ADR-0047)**: cache mempercepat loader (fase sebelum render); streaming tetap
  berjalan seperti biasa.
- **Nonce CSP**: karena HTML tidak di-cache, nonce tetap unik per request. Untuk konten publik
  yang ingin di-cache di CDN, gunakan `cacheControl()` (ADR-0055) **tanpa** nonce, atau sajikan
  sebagai statis.

## Batasan (jujur)

- In-memory = per proses; multi-instance tidak berbagi cache (gunakan store eksternal).
- Tidak ada cache per-request query (sengaja; filter = kunci tak terbatas).
- `revalidate` pada halaman ber-cookie diabaikan (dengan aman, bukan error).
- Belum ada: cache komponen/segmen, `revalidateTag` ala Next di luar action, purge CDN.
