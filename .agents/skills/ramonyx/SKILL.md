---
name: ramonyx
description: Menulis atau mengubah aplikasi Ramonyx (file routing, SSR React, loader, API route, keamanan, CLI). Gunakan saat proyek memakai paket ramonyx/@ramonyx/* atau saat diminta men-scaffold/mengembangkan/deploy aplikasi Ramonyx.
---

# Skill: menulis aplikasi di atas Ramonyx

Sumber fakta (selalu rujuk, jangan mengarang):

- Status fitur + batasan: `docs/machine/features.json` (atau `https://ramonyxjs.github.io/ramonyx/machine/features.json`)
- Aturan + contoh benar/salah: `docs/machine/rules.json`
- Indeks keputusan: `docs/machine/adrs.json` · API/CLI: `docs/machine/api.json`, `docs/machine/cli.json`
- Teks lengkap untuk agen: `docs/machine/llms.txt` dan `docs/machine/llms-full.txt`

## Fakta minimum

- Node ≥24; aplikasi adalah proyek ESM TypeScript. Scaffold: `npx create-ramonyx-app <dir>` atau `pnpm create:app <dir>`.
- Konvensi: `src/app.ts` mengekspor `createApp(options?)` → FetchHandler; halaman di `src/routes` (`page.tsx`, `layout.tsx`, `error.tsx`); API di `src/routes/api/*.ts` (satu file boleh mengekspor beberapa method: `GET`, `POST`, …).
- Loader: ekspor `load` dari `page.tsx`; hasilnya **harus JSON-serializable** (ikut payload hydration).
- CLI: `ramonyx dev` (Vite+HMR → SSR), `ramonyx build` (bundel klien → `dist/client`), `ramonyx start` (produksi, `NODE_ENV=production`), `ramonyx doctor`.
- Produksi WAJIB `ramonyx start`/`NODE_ENV=production`; tanpa build, `/assets/client.js` 404.
- Keamanan bawaan: batas body 1 MiB→413, timeout 10s→503, concurrency 100→503; headers/CSRF/CSP/rate-limit lewat `@ramonyx/security`. Jangan menonaktifkan tanpa alasan.
- Middleware saat ini **app-level** (array di `createApp`/`createHandler`) — belum ada `middleware.ts` per folder.
- Belum ada: server actions/forms helper, SSG first-class, i18n, image/font optimization, ISR. Jangan mengarang API ini — cek `features.json`.

## Aturan yang paling mudah dilanggar

1. Impor relatif memakai ekstensi eksplisit (`./x.ts`, `./x.tsx`).
2. JSX hanya di file `.tsx` yang dijalankan lewat loader/CLI (`ramonyx dev`), bukan `node file.tsx`.
3. Data loader JSON-serializable.
4. Modul yang masuk bundle client tidak boleh mengimpor API server (`node:*`, rahasia).
5. Halaman error tidak di-hydrate — jangan mengandalkan interaktivitas di sana.
6. Streaming SSR memakai `react-dom/server.edge` (bukan `.browser`).

Kontribusi ke repo Ramonyx sendiri (bukan aplikasi): baca `AGENTS.md`.
