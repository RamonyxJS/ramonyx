# __APP_NAME__

Aplikasi [Ramonyx](https://github.com/ramonyx/ramonyx) — framework full-stack TypeScript
(Node ≥ 24).

## Menjalankan

```bash
pnpm install   # atau npm install
pnpm start     # http://127.0.0.1:3000
pnpm dev       # mode watch
```

## Endpoint contoh

- `GET /` — halaman HTML sederhana
- `GET /api/halo/[nama]` — JSON `{ "halo": "<nama>" }`
- `GET /api/rahasia` — contoh `HttpError` (403)
