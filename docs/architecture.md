# Arsitektur Ramonyx

- Status: draft v0 (Phase 0, 2026-10-18). Turunan `docs/BLUEPRINT.md` §2/§5/§6 — jika bertentangan, **blueprint menang**.
- Semua komponen di dokumen ini **belum dibuat**.

## 1. Prinsip yang mengikat

- **Runtime independence** — framework tidak bergantung pada internal runtime tertentu, dan sebaliknya.
- **Secure by default** — validasi runtime di trust boundary; permission berbasis capability (Phase 4+).
- **Performance-conscious** — benchmark sejak awal; ukur dulu, klaim kemudian.
- **Developer-first** — type inference end-to-end, error informatif, toolchain terintegrasi.

## 2. Model layer

``` text
Layer 1 Framework : routing · SSR · server actions · API · client navigation · data loading
Layer 2 Compiler  : TS transform · bundling · route manifest · source maps
Layer 3 Runtime   : JS engine · module loader · permissions · HTTP · file I/O
Layer 4 System    : OS · TCP/TLS · filesystem · process
```

Phase 1–3 hanya menyentuh Layer 1 (+ sebagian Layer 2 di Phase 2); Node.js berperan sebagai
Layer 3 selama runtime sendiri belum ada (Phase 4+, ADR-0001).

## 3. Peta package

| Package | Tanggung jawab | Target fase | Status |
| --- | --- | --- | --- |
| `packages/core` | Request lifecycle, context, middleware, error handling | Phase 1 | belum dibuat |
| `packages/router` | Matching route (statis, parameter; layout menyusul) | Phase 1 | belum dibuat |
| `packages/server` | Wiring HTTP → middleware → router, serve | Phase 1 | belum dibuat |
| `packages/adapter-runtime` | Kontrak runtime + adapter Node + adapter in-memory (test) | Phase 1 | belum dibuat |
| `packages/schema` | Integrasi Standard Schema (ADR-0004) + pemetaan error | Phase 1 | belum dibuat |
| `packages/testing` | `createTestServer`, fixture app, helper | Phase 1 | belum dibuat |
| `packages/react` | Adapter UI React (ADR-0003): SSR + hydration + navigasi client | Phase 2 | selesai |
| `packages/ssr` | Render halaman → HTML (+ streaming) | Phase 2 | SSR selesai (streaming menyusul) |
| `packages/client` | Hydration (kini di `@ramonyx/react/client`) + client navigation | Phase 2 | navigasi menyusul |
| `packages/compiler` | Manifest route (`createRouteManifest`, `loadPageRoutes`, `generateClientEntry`), transformasi & analisis batas server/client | Phase 2 | file routing + halaman + codegen selesai |
| `packages/bundler` | Pembungkus Vite (ADR-0005): build client + dev server (ADR-0009) | Phase 2 | selesai |
| `packages/security` | Header keamanan + CSRF double-submit (ADR-0013) | Phase 3 | selesai (CSP nonce menyusul) |
| `packages/devtools` | CLI, dev server, diagnostics | Phase 2–3 | belum dibuat |
| `apps/playground` | App demo/uji end-to-end | Phase 1 | belum dibuat |
| `apps/docs` | Dokumentasi publik | Phase 2 | belum dibuat |
| `apps/create-app` | CLI scaffolding | Phase 2–3 | belum dibuat |
| `runtime/crates/*` | Host Rust + V8 (runtime-core, module-loader, permissions, net, fs, cli) | Phase 4+ | belum dibuat |
| `benchmarks/*` | Skrip benchmark per area | Phase 1 | belum dibuat |

Status Phase 2 (selesai, 2026-10-18): file routing API + halaman (loader/layout/error), SSR React,
hydration (ADR-0007), client navigation (ADR-0008), dev server HMR (ADR-0009), dan e2e browser +
baseline Web Vitals (ADR-0010) sudah berfungsi. Tersisa: keputusan pemilik + Phase 3 hardening.

Status Phase 1: `core`, `router`, `schema`, `adapter-runtime`, `server`, `testing`, `ramonyx`,
`apps/playground`, dan `benchmarks/http` sudah diimplementasikan (source-first TypeScript via
Node type stripping).

Peta ini rambu, bukan larangan: jangan memecah paket lebih halus sebelum batas tanggung jawabnya
jelas (BLUEPRINT §5 aturan 5). Nama scope npm masih keputusan terbuka (§8).

## 4. Aturan dependency

1. Framework core tidak bergantung pada detail internal runtime.
2. Runtime tidak bergantung pada full-stack framework.
3. Compiler menghasilkan artefak eksplisit: client bundle, server bundle, route manifest, metadata build.
4. FFI adalah boundary yang diaudit: `unsafe` dibatasi, invarian didokumentasikan.
5. Hindari memecah semua fitur menjadi package terpisah sebelum batas tanggung jawab jelas.

Konsekuensi operasional yang ditegakkan lint: hanya `packages/adapter-runtime`, `packages/compiler`
(build-time), dan `packages/security` (guard SSRF) yang boleh mengimpor `node:*`; paket runtime lain
hanya memakai kontrak §5. Tooling dev (test/benchmark/playground) bebas.

App code ber-JSX dijalankan lewat loader dev `tools/register.mjs` (esbuild, JSX automatic —
ADR-0006); paket framework sendiri tetap tanpa JSX agar bisa berjalan di Node murni.

## 5. Kontrak framework ↔ adapter-runtime (draft v0)

Prinsip:

- Tipe boundary memakai **standar web** (`Request`/`Response`, streams) — dapat diimplementasi
  Node sekarang, dan runtime Rust nanti.
- Adapter **in-memory wajib** ada sejak Phase 1 → framework dapat diuji tanpa server nyata dan
  tanpa runtime sendiri.
- Kemampuan fs/network/permission **belum masuk v0** — muncul saat runtime sendiri (Phase 4+),
  sebagai capability eksplisit.

``` ts
// Kandidat lokasi: packages/adapter-runtime/src/types.ts — rancangan, akan berevolusi.
export type FetchHandler = (request: Request) => Promise<Response>;

export interface RuntimeHost {
  readonly name: string; // "node" | "memory" | "ramonyx"
  serve(handler: FetchHandler, options: { port: number; host?: string }): Promise<RunningServer>;
  env: { get(name: string): string | undefined };
}

export interface RunningServer {
  readonly url: string;
  close(): Promise<void>;
}
```

Status: diimplementasikan (Phase 1) di `packages/adapter-runtime` — `RuntimeHost` + adapter
`memory` (test) dan `node`. Perubahan kontrak dicatat sebagai ADR bila signifikan.

## 6. Alur request (target)

``` text
Phase 1 : HTTP → adapter-runtime (Node) → server → middleware → router → handler → Response
Phase 2 : Request → router → loader → render (adapter React) → HTML stream → Response
```

## 7. Batas MVP (Phase 1)

**Masuk MVP:** config `ramonyx.config.ts`; routing HTTP statis + parameter; endpoint `api/`;
context; middleware; error handling; validasi schema input/output; adapter Node + in-memory;
demo app; integration tests; baseline benchmark.

**Keluar dari MVP (fase lain):** SSR/hydration/navigasi client (Phase 2); dev server/HMR
(Phase 2); security hardening, fuzz, load test (Phase 3); runtime Rust/V8 (Phase 4+);
server actions & fitur lanjutan (setelah baseline stabil, BLUEPRINT §11). ORM, package manager,
dan renderer UI sendiri tidak direncanakan.

## 8. Keputusan terbuka

| Topik | Status | Lokasi |
| --- | --- | --- |
| Topologi rilis & versioning | belum diputuskan | setelah Phase 4 |

Diputuskan pemilik 2026-10-18: lisensi **MIT**, scope **`@ramonyx/*`**, browser matrix evergreen
(2 versi terakhir, ES2022), rekonsiliasi PRD — lihat ADR-0018.

## 9. Menguji framework tanpa runtime sendiri

In-memory adapter (§5) + `createTestServer` (`packages/testing`) menjalankan integration test di
Node tanpa port nyata. Browser test (hydration) baru relevan di Phase 2. Runtime Rust nanti cukup
memenuhi kontrak §5 + compatibility suite — tanpa perubahan `core`.
