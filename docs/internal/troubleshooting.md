# Troubleshooting — Kode Error

Setiap pesan error publik framework menyertakan **kode stabil** + tautan ke halaman ini
(`[kode RMX-…; docs: …]` — ADR-0072). Cari kode Anda di bawah.

## Cara membaca

- **Dev**: halaman error SSR/loader menampilkan **stack + file sumber** (overlay DX) — otomatis
  saat `NODE_ENV !== "production"` (dapat dipaksa dengan `createPageRoutes({ errorDetails })`).
- **Produksi**: detail tidak pernah disertakan; hanya status + pesan publik.

### RMX-CONFIG-1

Konfigurasi `ramonyx.config.ts` tidak valid. Pesan menyebut field-nya; perbaiki tipe/nilai:

- `app.strictValidation` → boolean.
- `server.port` → integer 0–65535.
- `server.host` → string non-kosong.

### RMX-ROUTES-1

Direktori route (`src/routes`) tidak bisa dibaca. Periksa path `--app` dan izin berkas.

### RMX-ROUTES-2

`page.tsx`/`layout.tsx`/`error.tsx` tidak punya **default export**. Ekspor komponen:

```tsx
export default function Halaman() { return <h1>Halo</h1>; }
```

### RMX-ROUTES-3

`middleware.ts` bukan array fungsi. Bentuk yang benar:

```ts
export default [securityHeaders()] satisfies Middleware[];
```

### RMX-ROUTES-4

File route API tidak mengekspor method HTTP. Ekspor salah satu:

```ts
export const GET = route({ handler: () => Response.json({ ok: true }) });
```

### RMX-ROUTES-5

Ekspor method API bukan definisi route valid (butuh objek dengan `handler`). Bungkus dengan
`route({ handler })` dari `ramonyx`.

### RMX-BUILD-1

**Batas server/client dilanggar**: modul yang masuk bundle klien (page/layout) mengimpor `node:*`.
Pindahkan kode server ke modul `*.server.ts` dan impor hanya dari loader/action/route API
(ADR-0063). Pesan menyebut file + modulnya.

### RMX-BUILD-2

Bundel klien memuat API server lewat **impor transitif** (modul non-`*.server.ts`). Pisahkan
modul server (`*.server.ts`) dan impor hanya dari loader/action/route API.

### RMX-EDGE-1

Bundel edge memuat `node:*`. Runtime edge tidak menyediakannya — periksa middleware/plugin
(harus edge-safe, ADR-0058/0067); `guardedFetch` hanya untuk Node (`@ramonyx/security/ssrf`).

## Masih buntu?

- Cek `features.json` (status + batasan fitur): https://ramonyxjs.github.io/ramonyx/machine/features.json
- Cari di dokumentasi: [arsitektur](architecture.md) · [kontrak API](api/core-contract.md) ·
  [caching](caching.md) · [aset](assets.md) · [plugin](plugins.md)
- Laporkan issue (sertakan kode + langkah reproduksi): https://github.com/RamonyxJS/ramonyx/issues
