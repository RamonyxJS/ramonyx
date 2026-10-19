# Tutorial: Aplikasi Pertama (end-to-end)

Dari nol sampai deploy: routing, loader, API + validasi, form (server action), lalu tiga jalur
deploy (Node, statis, edge). Semua perintah di halaman ini dipakai di test repo (scaffold,
build, static, edge) — bukan contoh yang belum diverifikasi.

## 0. Prasyarat

- Node ≥ 24, pnpm (atau npm).

## 1. Scaffold

```bash
pnpm create ramonyx-app aplikasi-saya
cd aplikasi-saya
pnpm install
pnpm dev        # Vite :5173 (HMR) → SSR :3000
```

Buka http://localhost:5173 — halaman SSR dengan counter yang ter-hydrate dan form action.

Struktur:

```
src/app.ts              createApp() — wiring handler (API + halaman + middleware)
src/server.ts           (opsional) entry server kustom — dipakai CLI bila ada (ADR-0076)
src/routes/             file routing
  page.tsx              halaman "/" (loader + action + komponen)
  layout.tsx            layout root
  [...slug]/page.tsx    halaman 404 (metadata.status = 404)
  middleware.ts         middleware per-folder (root = semua rute)
  api/halo/[nama].ts    route API dinamis
ramonyx.config.ts       port/host (opsional)
```

## 2. Halaman + loader

`src/routes/page.tsx` — halaman adalah modul isomorfik: `loader` berjalan di server, komponen
di-render server lalu di-hydrate di browser.

```tsx
import type { PageProps } from "@ramonyx/react";

export const metadata = { title: "Beranda", description: "Aplikasi pertama saya" };

export async function loader() {
  return { pesan: "Halo dari server" };
}

export default function Beranda({ data }: PageProps<{ pesan: string }>) {
  return <h1>{data.pesan}</h1>;
}
```

Data loader harus JSON-serializable (ikut payload hydration). Untuk data dari filesystem/db,
gunakan modul `*.server.ts` — bundle klien menerima stub yang melempar bila dipanggil di browser
(ADR-0063).

## 3. Route API + validasi

`src/routes/api/halo/[nama].ts`:

```ts
import { HttpError, route } from "ramonyx";

export const GET = route({
  handler: ({ params }) => {
    const nama = String(params.nama);
    if (nama.length < 2) throw new HttpError(400, "Nama minimal 2 karakter");
    return Response.json({ halo: nama });
  },
});
```

Uji: `curl http://localhost:3000/api/halo/dunia`.

## 4. Form dengan server action (progressive enhancement)

Tambahkan di halaman:

```tsx
import type { PageActionContext } from "ramonyx";

export async function action({ formData }: PageActionContext) {
  const nama = String(formData.get("nama") ?? "").trim();
  if (nama.length < 2) return { errors: { nama: "Nama minimal 2 karakter" } };
  return { message: `Halo, ${nama}!` };
}
```

```tsx
<form method="post">
  <input name="nama" />
  <button type="submit">Kirim</button>
</form>
{action?.errors?.nama && <p role="alert">{action.errors.nama}</p>}
{action?.message && <p role="status">{action.message}</p>}
```

- Tanpa JavaScript: POST native → HTML dirender ulang (berfungsi penuh).
- Dengan JavaScript: submit diintersepsi, tanpa reload.
- Sesi/login: lihat [Sesi & Cookie](security/sessions.md) — `createSession` dari
  `@ramonyx/security`, `set-cookie` lewat hasil action.

## 5. Produksi (Node)

```bash
pnpm build        # bundel klien → dist/client (ber-hash + manifest)
pnpm start        # NODE_ENV=production, SSR :3000
```

Server standalone sudah membawa kompresi (brotli/gzip), ETag/304 untuk aset, dan batas aman
(body 1 MiB → 413, timeout 10 dtk → 503, concurrency 100 → 503).

## 6. Deploy statis (SSG)

```bash
pnpm exec ramonyx build --static   # → dist/static (HTML per rute + 404.html + aset)
```

Rute statis diprerender; rute dinamis dienumerasi lewat `getStaticPaths` di halaman:

```ts
export function getStaticPaths() {
  return [{ slug: "satu" }, { slug: "dua" }];
}
```

Upload `dist/static` ke GitHub Pages/Netlify/S3. Sitemap + robots: `createSeoRoutes` dari
`@ramonyx/ssr` (ADR-0059) — ditambahkan otomatis di template (`src/app.ts`).

## 7. Deploy edge/serverless

```bash
pnpm exec ramonyx build --target edge   # → dist/edge/index.js (kontrak { fetch })
```

Detail + contoh `wrangler.toml`: [Deploy Edge](deploy-edge.md).

## 8. Verifikasi

```bash
pnpm exec ramonyx doctor      # diagnostik konfigurasi
pnpm exec tsc --noEmit        # tipe (jika memakai TS langsung)
```

Langkah berikutnya: [Arsitektur](architecture.md) · [Kontrak API](api/core-contract.md) ·
[Keamanan](security/threat-model.md) · [Contoh form & sesi di playground](https://github.com/RamonyxJS/ramonyx/tree/main/apps/playground).
