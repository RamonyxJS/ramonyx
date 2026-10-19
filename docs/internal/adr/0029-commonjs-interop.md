---
adr: 0029
title: "Interop CommonJS v1 — Graf `require` Statis + Demo SSR React"
visibility: internal
---

# ADR-0029: Interop CommonJS v1 — Graf `require` Statis + Demo SSR React

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: ADR-0021/0026/0027/0028, BLUEPRINT §9 (exit criteria Phase 4: "framework demo berjalan
  di runtime alpha")

## Konteks

Setelah compatibility suite v1 (ADR-0028) pipeline framework ESM berjalan di runtime, hambatan
berikutnya adalah **ekosistem nyata**: `react` dan `react-dom` (dan banyak paket lain) dikirim
sebagai **CommonJS**. Tanpa interop CJS, "framework demo berjalan di runtime" tidak dapat
mencakup SSR React — bagian penting dari demo framework.

Runtime ini ESM-first; loader tidak punya mekanisme `require` sinkron seperti Node, dan
`deno_core` tidak menyediakan resolusi modul sinkron.

## Keputusan

**Pemindaian graf statis di Rust + eksekusi wrapper CJS di V8.**

1. Loader mendeteksi file CJS: `.cjs`, atau `.js` yang `package.json` terdekatnya bukan
   `"type": "module"` (aturan sama dengan Node; tanpa `package.json` → CJS).
2. **Seluruh graf `require()` statis dipindai lebih dulu di Rust** (`cjs.rs`): literal string
   (komentar dimask, string dilewati saat pemindaian), resolusi relative + bare
   (`node_modules`), JSON, dedupe per path kanonik. Pemindaian *best-effort*: specifier yang
   tidak bisa di-resolve tidak menggagalkan build graf, melainkan dicatat sebagai error dengan
   alasan (dilempar saat `require` dieksekusi).
3. Graf di-embed ke **satu modul ESM sintetis**: sumber tiap modul + peta `require` diserialkan
   sebagai JSON; di dalam mesin, `require` **sinkron** dilayani dari record yang sudah ada di
   memori (tanpa I/O di JS). Wrapper CJS klasik dijalankan lewat
   `new Function("exports","require","module","__filename","__dirname","process","global", …)`.
4. **Named export heuristik** untuk konsumen ESM: `exports.NAME =`, `exports["NAME"] =`,
   `module.exports = { ... }` (termasuk shorthand), dan rantai
   `module.exports = require("./x")` diikuti rekursif. `export default` selalu tersedia.
5. **`process` minimal** per konteks CJS: `env.NODE_ENV = "production"` (build produksi
   deterministik), `platform`/`arch`, `cwd()`, `argv`, `nextTick` (microtask), `emitWarning`,
   `on/once/off/removeListener` no-op.
6. **Cache modul global per realm** (`globalThis.__ramonyxCjsCache`): modul CJS yang sama hanya
   dieksekusi sekali, termasuk yang diimpor lewat ESM *dan* `require` dari graf lain (semantik
   sedekat mungkin dengan cache modul Node).
7. Syarat yang ditemukan saat implementasi (keduanya diperbaiki di putaran ini):
   - **Isolate V8 harus dibuat di dalam konteks tokio** (`tokio.enter()` di `Engine::with_options`):
     V8 dapat memposting *delayed task* kapan saja (mis. GC memory reducer); `deno_core`
     men-`abort()` proses bila isolate terdaftar tanpa handle tokio. Bug laten ini ketangkap
     oleh beban SSR.
   - **`MessageChannel` ditambahkan ke `web_shim`** (ADR-0027): scheduler React memakai pola
     `port1.onmessage = fn; port2.postMessage(null)`; pengiriman melalui microtask.

## Bukti

- Unit `cjs.rs` (4): pemindai mengabaikan komentar/string, named export dasar, object literal +
  shorthand, deteksi CJS mengikuti `package.json`.
- Engine (3): interop dasar (reexport + JSON + shebang + require di komentar), branch
  `process.env.NODE_ENV` + rantai reexport (named export ikut), pesan error jelas untuk modul
  bawaan Node (`fs`) dan `require` dinamis.
- **Compatibility: SSR React** (`tests/compatibility/fixtures/react-ssr.mjs`): `react` +
  `react-dom/server.browser` (bundle CJS produksi, graf 7 modul) → `renderToString` +
  `renderToStaticMarkup` berjalan; diverifikasi test integrasi Rust.
- Smoke CLI: `ramonyx-runtime-cli run` fixture SSR (deny-all default) mencetak HTML.

## Batasan yang dicatat jujur (belum didukung)

- `require` **dinamis** (specifier non-literal) — error jelas saat runtime.
- `require()` modul **ESM/TypeScript** (Node 22+ mendukung sebagian; runtime ini belum).
- **Modul bawaan Node** (`fs`, `path`, `stream`, …) — error jelas dengan nama modulnya.
- `require.resolve`, `Object.defineProperty(exports, …)` sebagai sumber named export,
  `exports.__esModule` interop khusus, dan loader ekstensi `.node`.
- Interop ini **subset**, bukan klaim "runtime menjalankan semua paket npm".

## Alternatif yang ditolak

- **`deno_ast` walk penuh untuk `require`**: akurat, tetapi menambah kompleksitas besar untuk
  kebutuhan saat ini; pemindai string-state (komentar/string) + unit test dianggap cukup untuk
  subset v1. Parser penuh dapat menggantikan pemindai tanpa mengubah arsitektur graf.
- **Require asinkron** (mengubah semantik CJS) — tidak kompatibel dengan kode nyata.
- **Menolak CJS** sampai runtime "lebih matang" — memblokir demo SSR dan ekosistem mayoritas.

## Konsekuensi

- Ukuran modul sintetis ∝ ukuran graf (react SSR ≈ 450 KB sumber); dibaca sekali, tidak ada I/O
  saat modul berjalan.
- Pemuatan pertama modul CJS lebih lambat (baca + embed) — wajar untuk startup, dioptimalkan di
  R4 bila perlu.
- Exit criteria Phase 4 bergerak: **pipeline framework ✅ dan demo SSR React ✅ berjalan di
  runtime**; compatibility lebih luas menunggu `fetch`/`ReadableStream`, streaming request, dan
  worker/kuota.
