# __APP_NAME__

Aplikasi [Ramonyx](https://github.com/ramonyx/ramonyx) — framework full-stack TypeScript
(Node ≥ 24): halaman **SSR React + hydration** dan route API, dengan konvensi folder
`src/routes`.

## Menjalankan

```bash
pnpm install
pnpm dev       # Vite + HMR (http://localhost:5173) → SSR :3000
pnpm build     # bundel klien (wajib sebelum start produksi)
pnpm start     # http://127.0.0.1:3000 (NODE_ENV=production otomatis)
```

Perintah memakai CLI **`ramonyx`** (`@ramonyx/devtools`): `ramonyx dev|build|start|doctor`.

## Struktur

- `src/app.ts` — mengekspor `createApp(options?)` (dipakai CLI)
- `src/routes/page.tsx` — halaman (loader + komponen React; `layout.tsx`/`error.tsx` opsional)
- `src/routes/api/halo/[nama].ts` — route API (`export const GET = route({ ... })`)
- `src/routes/middleware.ts` — security headers + CSP nonce + aset `/assets/*`
- `ramonyx.config.ts` — port/host + strict validation

## Endpoint contoh

- `GET /` — halaman SSR (tombol counter membuktikan hydration)
- `GET /api/halo/dunia` — JSON `{ "halo": "dunia" }`
- `GET /api/rahasia` — contoh `HttpError` (403)
