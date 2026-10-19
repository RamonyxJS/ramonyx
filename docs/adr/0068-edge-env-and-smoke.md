# ADR-0068: Binding Env Platform Edge + Smoke Test di Runtime Nyata (workerd)

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: TODO `p2-edge-env-bindings` + `p2-edge-platform-smoke` (sisa `p0-serverless-adapters`
  dari ADR-0058); rencana komprehensif Fase 4.

## Konteks

ADR-0058 menghasilkan artefak edge dengan kontrak `{ fetch }`, tetapi (a) binding platform
(`env` — KV/secret/var) tidak diteruskan ke handler, dan (b) artefak hanya diuji sebagai fetch
handler di Node — bukan di runtime platform nyata. Keduanya membuat klaim "siap edge" belum
lengkap.

## Keputusan

1. **`EnvReader.getRaw?(name)`** (core, aditif): binding apa adanya (KV namespace, objek
   platform) — `get` tetap untuk string.
2. **`createHandler({ envFromRequest })`** (server, aditif): env per request; fallback ke `env`
   statis bila resolver mengembalikan `undefined`. Dipakai untuk middleware global, middleware
   per-rute, loader, dan action (semuanya lewat konteks yang sama).
3. **Codegen edge** (compiler): entry menyimpan binding per request di `WeakMap` (konkurensi
   aman — tidak ada state global per-request yang bisa tercampur), membuat `EnvReader` per
   request (`get` string + `getRaw`), dan `fetch(request, env)` mengisi map sebelum handler.
4. **Smoke runtime nyata**: `scripts/edge-smoke.ts` (`pnpm test:edge`) membangun artefak
   playground (`dist/edge/index.js`), menjalankannya di **workerd** (runtime yang sama dengan
   Cloudflare Workers, devDependency) dengan binding tiruan (`RAHASIA` text + `KV` json), lalu
   memverifikasi lewat HTTP sungguhan: SSR, API, action POST, `env.get`/`env.getRaw`, middleware
   per-folder, dan 404 HTML. CI menjalankannya sebagai langkah **blocking** setelah e2e.
5. **Robustness**: `buildEdge` menormalkan `appDir`/`outDir` ke absolut (path relatif membuat
   entry Vite tergandakan — bug ditemukan oleh smoke script).

## Bukti

- `packages/server/test/pipeline.test.ts`: `envFromRequest` (fallback statis; `get` + `getRaw`
  per request).
- `apps/create-app/test/create-app.test.ts`: artefak edge hasil `ramonyx build --target edge`
  membaca binding tiruan lewat `fetch(request, env)`.
- `scripts/edge-smoke.ts` + CI: **workerd** menjalankan artefak playground — `EDGE SMOKE OK`
  (SSR, API, action, env binding, middleware, 404).
- `docs/deploy-edge.md` diperbarui (contoh binding + status uji).

## Alternatif yang ditolak

- **Membuat handler per request** (menutup `env` di createHandler): membangun tabel rute tiap
  request — mahal. `envFromRequest` + `WeakMap` menyelesaikannya tanpa biaya itu.
- **Menguji hanya di Node** (fetch handler): tidak membuktikan kompatibilitas runtime platform.
- **wrangler/miniflare**: lebih berat daripada `workerd` langsung; smoke ini tidak butuh fitur
  wrangler (deploy/account).

## Konsekuensi

- P0-4 tuntas: artefak edge + binding env + smoke runtime nyata di CI (menutup dua item lanjutan).
- Deploy nyata ke akun Cloudflare/Vercel/Deno tetap langkah pengguna (dokumentasi + `wrangler.toml`
  contoh) — bukan bagian dari CI repo ini (tidak ada kredensial).
- Sisa kandidat: preset Vercel/Deno Deploy, `waitUntil`/cache API platform, uji `nodejs_compat`
  (tidak diperlukan untuk artefak saat ini).
