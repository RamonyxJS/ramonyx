# __APP_NAME__

Aplikasi [Ramonyx](https://github.com/ramonyx/ramonyx) — framework full-stack TypeScript
(Node ≥ 24): halaman **SSR React + hydration** dan route API, dengan konvensi folder
`src/routes`.

## Menjalankan

```bash
pnpm install
pnpm build     # bundel klien (wajib sebelum start)
pnpm start     # http://127.0.0.1:3000
pnpm dev       # mode watch (jalankan `pnpm build` setelah mengubah UI klien)
```

## Struktur

- `src/routes/page.tsx` — halaman (loader + komponen React; `layout.tsx`/`error.tsx` opsional)
- `src/routes/api/halo/[nama].ts` — route API (`export const GET = route({ ... })`)
- `src/routes/middleware.ts` — security headers + CSP nonce + aset `/assets/*`
- `build.ts` — bundel klien (Vite) lewat `@ramonyx/bundler`
- `ramonyx.config.ts` — port/host + strict validation

## Endpoint contoh

- `GET /` — halaman SSR (tombol counter membuktikan hydration)
- `GET /api/halo/dunia` — JSON `{ "halo": "dunia" }`
- `GET /api/rahasia` — contoh `HttpError` (403)
