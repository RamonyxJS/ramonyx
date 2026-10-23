---
adr: 0009
title: "Dev Server — Vite Front + Proxy Manual + `ssrLoadModule`"
visibility: internal
---

# ADR-0009: Dev Server — Vite Front + Proxy Manual + `ssrLoadModule`

- Status: Superseded by ADR-0083 (2026-10-23)
- Tanggal: 2026-10-18
- Sumber: BLUEPRINT §9 (dev server Phase 2), ADR-0005/0006/0007/0008

## Konteks

Butuh dev server tanpa `pnpm build` manual: transform + HMR dari Vite untuk client, dan SSR yang
ikut segar saat file berubah (Node ESM cache membuat modul halaman lama tetap terpakai setelah
edit).

## Keputusan

- `@ramonyx/bundler.createDevServer`: Vite dev server (root = app, `appType: "custom"`,
  `esbuild.jsx: automatic`) di port 5173; SSR Node tetap di 3000.
- **Proxy manual** (plugin `configureServer` + pre-middleware + `fetch`): request non-Vite
  diteruskan ke SSR; respons dipipe apa adanya. `server.proxy` bawaan Vite **ditolak** karena
  `bypass` mengembalikan 404 (bukan skip) — sudah dicoba dan terbukti mematikan `/@vite/client`.
- **`ModuleImporter`** di compiler: default `nativeImporter`; dev memakai `vite.ssrLoadModule`
  sehingga modul mengikuti module graph (invalidasi saat file berubah). Playground dev memakai
  `reloadManifests: true` — manifest route/halaman dibangun ulang per request.
- Entry client dev = `/.ramonyx/client-entry.ts` + modul ekstra `/@vite/client`
  (`ClientOptions.extraModules`); produksi tetap `/assets/client.js` hasil `buildClient`.
- Watcher `src/routes` → regenerasi entry client + `full-reload` browser.
- Fast-refresh React (plugin-react) **belum** dipakai: perubahan = full reload.

## Alternatif yang ditolak

- `server.middlewareMode` satu port — butuh membelah req/res mentah masuk ke adapter-runtime,
  membuat kontrak runtime jadi Node-spesifik; ditunda.
- `server.proxy` Vite dengan `bypass` — return `false` menjadi 404, bukan "jangan proxy".
- Restart server tiap perubahan file — lambat dan tidak perlu berkat `ssrLoadModule`.

## Konsekuensi

- Dua port saat dev (5173 front, 3000 SSR); script `pnpm dev` mencetak keduanya.
- `pnpm dev` tidak butuh build; produksi = `pnpm build` lalu `pnpm start`.
- Modul framework (workspace) dilayani Vite dari sumber; react/react-dom di-prebundle Vite.
