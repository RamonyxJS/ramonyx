# ADR-0027: Web Platform Basics (`web_shim`) untuk Runtime

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: BLUEPRINT §3 (R2: I/O runtime; R1 package compat), menuju compatibility suite Phase 4

## Konteks

Framework core berbicara dalam tipe standar web (`URL`, `Request`, `Response`, `Headers`,
`TextEncoder`). Runtime (deno_core) **tidak menyediakannya**: `URL`, `URLSearchParams`,
`TextEncoder/Decoder`, `Headers`, `Request`, `Response`, `fetch` semuanya `undefined`
(diverifikasi empiris). Tanpa lapisan ini, compatibility suite tidak mungkin dimulai.

## Keputusan

- **`web_shim` (JS, dijalankan saat engine dibuat, sebelum bootstrap)**: implementasi minimal
  yang terkontrol dan teruji:
  - `TextEncoder`/`TextDecoder` — UTF-8 penuh (surrogate pair, multibyte, penggantian `\ufffd`);
  - `URL`/`URLSearchParams` — subset: absolut + relatif (base), `protocol/host/hostname/port/
    pathname/search/hash/origin/href`, `get/getAll/set/append/delete/has/entries/toString`;
  - `Headers` (case-insensitive, append gabung koma, `getSetCookie` dasar), `Response`
    (`json`/`text`/`clone`, `ok`), `Request` (url/method/headers/body/signal, `text`/`json`);
  - `setTimeout`/`clearTimeout` berbasis `op_sleep`.
- **Pola pemasangan `globalThis.X = globalThis.X ?? ShimX`** — implementasi native/deno_web ke
  depan dapat menggantikan tanpa mengubah kode aplikasi.
- Percobaan dependency ditolak dengan alasan dicatat: `deno_url` **deprecated** (hanya stub
  "use deno_web instead"), `deno_web` 0.290 menarik blob store/broadcast/compression +
  ops yang mengharapkan `deno_permissions` state — terlalu berat untuk slice ini.

## Batasan yang dicatat jujur

- **Belum**: `fetch`, `ReadableStream` (`Request.body`/`Response.body` = `null`), `structuredClone`,
  `atob`/`btoa`, `setInterval`, URL normalization penuh (dot-segments, kasus `%` ekstrem).
- `AbortController` tetap polyfill (ADR-0024); `getSetCookie` memakai pemisahan koma sederhana.
- Ini **shim**, bukan implementasi spec penuh — jangan diklaim sebagai WHATWG lengkap.

## Alternatif yang ditolak

- `deno_url` — deprecated/stub; `deno_web` — terlalu berat & butuh state permission asing.
- Polyfill pihak ketiga (npm) — menambah dependency runtime + rantai CJS.

## Konsekuensi

- Framework core (router/schema/server subset) kini punya prasyarat tipe standar web untuk
  dijalankan di runtime → compatibility suite bisa dimulai (item berikutnya).
- Diverifikasi: test `web_shim_dasar` (UTF-8 multibyte, URL+search params, Headers
  case-insensitive, Response clone/json, Request method/body, setTimeout) + smoke CLI.

## Berikutnya

1. Compatibility test pertama: jalankan paket framework (router → server pipeline) di runtime.
2. `fetch` client + `ReadableStream` (untuk ssr/security penuh).
3. Interop CommonJS (react/deno_ast ecosystem) — prasyarat SSR di runtime.
