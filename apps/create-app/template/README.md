# __APP_NAME__

Aplikasi [Ramonyx](https://github.com/ramonyx/ramonyx) — framework full-stack TypeScript
(Node ≥ 24): halaman **SSR React + hydration** dan route API, dengan konvensi folder
`src/routes`.

## Menjalankan

```bash
npm install
npm run dev     # Vite + HMR + SSR (http://localhost:3000, satu port)
npm run build   # bundel klien (wajib sebelum start produksi)
npm start       # http://127.0.0.1:3000 (NODE_ENV=production otomatis)
```

Semua package manager yang diuji bisa dipakai:

| Manager | Install | Dev |
| --- | --- | --- |
| npm | `npm install` | `npm run dev` |
| pnpm | `pnpm install` | `pnpm dev` |
| Yarn | `yarn` | `yarn dev` |
| Bun | `bun install` | `bun run dev` |

Perintah memakai CLI **`ramonyx`** (`@ramonyx/devtools`) yang terpasang **lokal** di
`node_modules/.bin`. Untuk memanggil CLI di luar package script, gunakan runner package manager:
`npx ramonyx …`, `pnpm exec ramonyx …`, atau `bunx ramonyx …`. `ramonyx …` tanpa runner hanya
tersedia setelah instalasi global.

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
