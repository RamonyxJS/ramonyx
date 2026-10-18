# Kontrak API Framework Core — v0

- Status: **diimplementasikan (Phase 1, 2026-10-18)**. Setiap poin kontrak punya test (daftar §9);
  semantik hasil implementasi dicatat di §10.
- Sumber ide: `docs/BLUEPRINT.md` §4. Contoh di blueprint adalah rancangan; dokumen ini
  merapikannya menjadi kontrak yang bisa diuji.
- Perubahan kontrak = ADR baru + pembaruan dokumen ini.

## 1. Config — `ramonyx.config.ts`

``` ts
// ramonyx.config.ts
import { defineConfig } from "ramonyx";

export default defineConfig({
  app: {
    strictValidation: true, // default v0: true
  },
  server: {
    port: 3000,
    host: "localhost", // opsional
  },
});
```

- Config divalidasi saat load; config tidak valid → error jelas, proses berhenti.
- Field baru hanya ditambah lewat perubahan kontrak (ADR).

## 2. Route HTTP — `src/routes/api/**/*.ts`

Satu file = satu path; export per method (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, ...).

``` ts
// src/routes/api/users/[id].ts
import { route } from "ramonyx";
import { z } from "zod"; // contoh; pustaka apa pun yang memenuhi Standard Schema (ADR-0004)

export const GET = route({
  params: z.object({ id: z.string().uuid() }),
  async handler({ params, json }) {
    const user = await findUser(params.id);
    if (!user) return json({ error: "Not found" }, 404);
    return json({ user });
  },
});
```

Catatan: blueprint §4 mencontohkan `schema.object(...)` bawaan framework; kontrak v0 memilih netral
(Standard Schema, ADR-0004 — masih **Proposed**). Bila ADR-0004 ditolak, contoh blueprint berlaku.

- `route({ params?, query?, body?, output?, handler })` — semua schema opsional kecuali `handler`.
- Handler menerima context: `{ params, query, body, request, env, log, json, text, redirect }`.
- Return: `Response` (helper `json`/`text`/`redirect` atau `new Response`).
- File tanpa export method → error saat startup/dev; method tak dikenal diabaikan dengan warning.
- 404 default untuk path tak dikenal; 405 + header `Allow` untuk method tidak didukung pada path yang ada.

## 3. Error handling

- `HttpError` diekspor framework: `throw new HttpError(403, "Forbidden")` → response status sesuai,
  body JSON aman.
- Error tak tertangkap → `500` dengan body generik (`{ "error": "Internal Server Error" }`);
  stack/detail hanya ke log, **tidak** ke response (di dev boleh lewat log/overlay, bukan body publik).
- Error pada middleware diperlakukan sama; log wajib terisi.

## 4. Validasi schema

- Input (`params`/`query`/`body`) divalidasi **sebelum** handler; gagal → `400` dengan daftar
  `issues` dengan format stabil.
- `output` (jika ada) divalidasi sebelum response dikirim; gagal → `500` + log (indikasi bug app/framework).
- `strictValidation: false` hanya melonggarkan validasi **output**, bukan input.
  (Detail perilaku final dibahas saat implementasi; perubahan = ADR.)

## 5. Middleware — `src/routes/middleware.ts`

``` ts
// src/routes/middleware.ts
import type { Middleware } from "ramonyx";

export default [
  async (ctx, next) => {
    const start = performance.now();
    const res = await next();
    ctx.log.info("request", { ms: performance.now() - start, status: res.status });
    return res;
  },
] satisfies Middleware[];
```

- Dijalankan root → dalam; boleh short-circuit dengan mengembalikan `Response` tanpa `next()`.
- `next()` atau `next(requestBaru)` — request pengganti dipakai lapisan berikutnya & handler
  (`signal` diteruskan; timeout tetap berlaku).
- `next()` dipanggil dua kali dalam satu middleware → 500 (dijaga framework).

- Middleware `src/routes/middleware.ts`: boleh `next()` atau `next(requestBaru)` (mengganti request
  untuk lapisan berikutnya; `signal` diteruskan). Contoh: `cspNonce()` (ADR-0014) menitipkan
  `x-ramonyx-nonce` yang dibaca ssr untuk `nonce` pada payload script.
- Boleh short-circuit dengan mengembalikan `Response` tanpa `next()`.
- Urutan dieksekusi deterministik dan diuji.

## 6. Halaman — `src/routes/**/page.tsx` (diimplementasikan, Phase 2)

- `page.tsx` — default export komponen; `export const metadata = { title }` untuk `<title>`;
  `export async function loader({ params, query, request, env, log })` dijalankan sebelum render,
  hasilnya masuk sebagai prop `data` (contoh: `PageProps<Data>` dari `@ramonyx/react`).
- `layout.tsx` di direktori yang sama atau di atasnya membungkus halaman (root → dalam).
- `error.tsx` terdekat (naik ke root) dirender saat loader/render gagal; menerima
  `{ error: { status, message } }` (`ErrorPageProps`). Status/pesan publik mengikuti `HttpError`.
- Path dari struktur direktori (`users/[id]/page.tsx` → `/users/[id]`); halaman hanya `GET`.
- SSR + hydration via adapter React (`@ramonyx/react`); client navigation (soft navigation,
  ADR-0008) lewat `enableClientNavigation`.
- Hydration (ADR-0007): payload inline `window.__RAMONYX__ = { path, params, data }` +
  `<script type="module" src="/assets/client.js">`; container `#ramonyx-root`; **`data` loader wajib
  JSON-serializable**; halaman error dirender server saja (tidak di-hydrate).

## 7. Kompatibilitas & versi

- Kontrak v0 berlaku sampai ada ADR yang menggantikannya; perubahan breaking butuh catatan migrasi.
- Paket mengikuti semver setelah publikasi pertama (topologi rilis masih keputusan terbuka).

## 8. Non-goal v0

Server actions, streaming SSR, caching/ISR, websocket, upload file besar, middleware per-folder,
route groups. Dievaluasi setelah baseline (Phase 2+).

## 9. Test yang lahir dari kontrak (Phase 1)

1. Config: default, override, config invalid → error jelas.
2. Router: match statis, parameter, 404, 405 + `Allow`.
3. Validasi: params/query/body invalid → 400 `issues`; output invalid → 500 + log; diuji dengan
   2 implementasi schema berbeda (ADR-0004).
4. Middleware: urutan, short-circuit, error di middleware → 500 aman.
5. Error: `HttpError` → status + body; error tak dikenal → 500 tanpa bocor; log terisi.
6. Adapter: in-memory serve; Node adapter smoke test.
7. Tipe: contoh penggunaan kontrak di-compile dengan `tsc` strict (type test).

## 10. Catatan implementasi (Phase 1)

- Handler menerima **nilai hasil validasi schema** (output `~standard`): transform dan strip key
  tak dikenal sudah diterapkan sebelum handler (contoh: zod men-strip query key di luar schema).
- Query berulang (`?tag=a&tag=b`) menjadi array; trailing slash dinormalisasi; route statis menang
  atas parameter.
- 405 menyertakan header `Allow`; body error selalu JSON aman (detail internal tidak bocor).
- `HttpError`: 4xx terbuka secara default; 5xx selalu `{"error":"Internal Server Error"}`.
- `strictValidation=false` hanya melonggarkan validasi output; input tetap ketat.
- File routing: `createRouteManifest` (`@ramonyx/compiler`) memindai `src/routes/api/**` —
  `index.ts` = direktori, `[id]` = parameter, prefix `_` diabaikan, file tanpa ekspor method =
  error saat startup.
- Paket Phase 1: `@ramonyx/{core,router,schema,adapter-runtime,server,testing}` + meta `ramonyx`.
- Phase 2 (SSR): `loadPageRoutes` (`@ramonyx/compiler`) → `createPageRoutes` (`@ramonyx/ssr`) →
  `RouteEntry` dengan handler HTML; error tak dikenal → 500 generik + log, `HttpError` → status.
- JSX app code dijalankan lewat `node --import ./tools/register.mjs` (loader esbuild; ADR-0006).
- Hydration (Phase 2): `generateClientEntry` (`@ramonyx/compiler`) → Vite (`@ramonyx/bundler`) →
  `hydrateAll` (`@ramonyx/react/client`); diverifikasi di browser nyata (counter interaktif,
  tanpa mismatch) — test otomatis browser menyusul.
- Client navigation (ADR-0008): klik link same-origin → fetch HTML (`x-ramonyx-nav: 1`) → swap
  `#ramonyx-root` + re-hydrate + `pushState`; `popstate` ikut soft-nav; fallback full navigation.
  Diverifikasi browser: 3 navigasi maju + 2 back tanpa reload (sentinel bertahan).
- Dev server (ADR-0009): Vite di 5173 (transform + HMR) dengan proxy manual ke SSR di 3000;
  manifest/halaman dimuat ulang via `ssrLoadModule` + `reloadManifests` → edit file berlaku
  tanpa restart; watcher `src/routes` meregenerasi entry + full-reload.
- Browser e2e (ADR-0010): Playwright terhadap build produksi — `apps/playground/e2e/` (hydration,
  soft navigation + back/forward, error 404/400, baseline Web Vitals).
- Hardening (Phase 3, ADR-0011/0012): `maxBodyBytes` default 1 MiB → **413** (dicek via
  content-length sebelum routing + streaming byte-count); `timeoutMs` default 10s → **503** +
  `request.signal` abort; `maxConcurrent` default 100 → **503 + `Retry-After: 1`** (load shedding);
  body dibaca streaming; `parseQuery` aman untuk `__proto__`.
- Paket `@ramonyx/security` (ADR-0013/0014/0015): `securityHeaders()`
  (nosniff/referrer/frame-options; CSP opt-in), `cspNonce()` (CSP dengan nonce per request,
  nonce dibaca ssr dari `NONCE_HEADER`), `csrfProtection()` (double-submit cookie + header
  `x-csrf-token` → 403 bila salah), `guardedFetch()` (proteksi SSRF: alamat privat ditolak,
  redirect divalidasi per hop, `allowHosts` untuk API internal).
- Output limit SSR (ADR-0015): `createPageRoutes({ maxDocumentBytes })` default 2 MiB → 500 + log.
