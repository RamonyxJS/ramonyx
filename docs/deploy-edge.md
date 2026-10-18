# Deploy Edge / Serverless

Ramonyx dapat membangun artefak **fetch handler** standar untuk platform edge/serverless
(Cloudflare Workers, Deno Deploy, Vercel Edge, runtime fetch lain) — ADR-0058.

```bash
ramonyx build              # bundle klien → dist/client (aset statis)
ramonyx build --target edge  # bundle server → dist/edge/index.js (satu berkas ESM)
```

Artefak `dist/edge/index.js` mengekspor kontrak platform:

```js
export default { fetch(request, env, ctx) { ... } };  // → Response
```

## Cloudflare Workers (contoh)

`wrangler.toml`:

```toml
name = "aplikasi-ramonyx"
main = "dist/edge/index.js"
compatibility_date = "2026-10-01"

[assets]
directory = "dist/client"
binding = "ASSETS"
```

```bash
ramonyx build && ramonyx build --target edge
npx wrangler deploy
```

Aset statis (`/assets/client-<hash>.js`) disajikan platform lewat `[assets]` — di edge,
`serveStatic` (host Node) tidak dipakai; `src/routes/middleware.ts` tetap **edge-safe**
(tanpa `node:*`) dan ikut dibundel.

## Jaminan & batasan (jujur)

- **Tanpa `node:*`**: build gagal dengan pesan jelas bila ada API Node yang lolos ke bundel.
  `guardedFetch` (`@ramonyx/security/ssrf`) hanya untuk Node — di edge tidak tersedia.
- **Tanpa filesystem**: manifest rute dibangun saat build (impor statis) — bukan dibaca saat
  runtime.
- **`process.env.NODE_ENV` di-define** sebagai `"production"` (runtime edge tidak punya
  `process`).
- **Belum diteruskan**: binding `env` platform ke handler (menyusul — item TODO
  `p2-edge-env-bindings`); SSR streaming berjalan (Web Streams) tetapi dukungan `waitUntil`/
  cache API platform belum dibungkus.
- **Status uji**: artefak diuji sebagai fetch handler di CI (SSR + API + action + 404);
  deploy ke platform nyata belum diuji otomatis (dicatat di TODO `p2-edge-platform-smoke`).
