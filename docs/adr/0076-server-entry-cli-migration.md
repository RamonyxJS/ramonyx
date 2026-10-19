# ADR-0076: Konvensi `src/server.ts` + Migrasi Playground/Docs ke CLI

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: TODO `p2-cli-migration` (kandidat lama: "Migrasi playground & docs ke CLI"); rencana
  komprehensif F5.

## Konteks

Repo menjalankan aplikasi sendiri lewat entry kustom (`apps/playground/src/{main,dev}.ts`,
`apps/docs/src/main.ts` + `build.ts`) dengan duplikasi logika CLI (port/host, plugin, manifest).
Dogfooding CLI berarti aplikasi nyata repo memakai jalur yang sama dengan pengguna — tetapi
playground butuh hal spesifik (logger, cache, streaming, instrumentasi memori) yang tidak
tersedia lewat `createApp(options)` standar.

## Keputusan

1. **Konvensi `src/server.ts` (opsional)** — ADR ini:
   - `ramonyx dev|start` memakai `src/server.ts` bila ada; jika tidak, `src/app.ts` (perilaku
     lama).
   - Kontrak: `export function createHandler(options)` → `FetchHandler`, dengan opsi yang sama
     yang CLI teruskan ke `createApp` (`clientScript`, `clientModules`, `importer`,
     `reloadManifests`, `hooks`, `streaming`).
   - CLI tetap pemilik host: port/host dari config, plugin dimuat & dibungkus CLI
     (`withMiddleware`) — `server.ts` **tidak** memuat plugin sendiri (tidak ada duplikasi).
2. **`app.streaming` masuk tipe config** (`AppConfig`, divalidasi boolean, `RMX-CONFIG-1`):
   CLI meneruskan ke `createPageRoutes` — streaming tidak lagi butuh entry kustom.
3. **Migrasi**:
   - Playground: `src/server.ts` (logger, `createCache()`, interval `RAMONYX_MEMORY_LOG`);
     `src/main.ts`, `src/dev.ts`, `build.ts` **dihapus**; config `app.streaming: true`.
   - Docs: `src/server.ts` (meneruskan `hooks`); `src/main.ts`, `build.ts` dihapus; ekspor
     statis (`export.ts`) tetap (ADR-0052 — bukan fitur CLI).
   - Skrip root (`build`/`dev`/`start`/`docs`) dan `benchmarks/security/abuse.ts` (spawn server)
     memakai CLI; test docs memakai `ramonyx build`.
4. **Uji konvensi**: test create-app men-spawn `ramonyx start --port 0` pada app dengan
   `src/server.ts` kustom → header khusus entry terbaca (CLI benar-benar memakai entry itu).

## Bukti

- `apps/create-app/test/create-app.test.ts`: konvensi `src/server.ts` (spawn CLI + probe header).
- `apps/playground/test/app.test.ts` + e2e 11/11 + `pnpm bench:security` (spawn CLI) hijau —
  playground berjalan lewat `ramonyx start` dengan streaming dari config + plugin dari config.
- `apps/docs/test/docs.test.ts` build via `ramonyx build`; ekspor statis tetap hijau.
- `packages/core/test/config.test.ts`: `app.streaming` validasi.

## Alternatif yang ditolak

- **Memaksa `createApp(options)` menangani semua kebutuhan playground** (logger/cache via opsi
  CLI): memperbesar permukaan opsi CLI untuk kasus aplikasi-spesifik; `src/server.ts` lebih
  jujur (kode aplikasi tinggal di aplikasi).
- **Menghapus ekspor statis docs demi CLI**: ekspor bukan fitur CLI (ADR-0052); tetap.
- **Mempertahankan entry lama sebagai fallback**: dua jalur dogfood = CLI tidak benar-benar
  diuji oleh aplikasi repo; dihapus (informasi historis tetap di IMPLEMENTATION_STATUS).

## Konsekuensi

- Dogfooding nyata: bug CLI (mis. streaming/plugin) kini tertangkap e2e/bench repo.
- Aplikasi pengguna dengan kebutuhan khusus punya jalur resmi (`src/server.ts`) tanpa
  menduplikasi host.
- Sisa kandidat: `ramonyx dev` untuk docs (saat ini dev docs lewat CLI ✓ sudah), watch mode
  server (`start --watch`), dokumen migrasi untuk proyek lama.
