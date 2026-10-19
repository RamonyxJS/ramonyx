# Arsitektur Ramonyx

- Status: **berlaku** (diperbarui 2026-10-18; Phase 0–4 selesai, Phase 5 praktis tuntas, **0.1.1 terbit**). Turunan `docs/BLUEPRINT.md` §2/§5/§6 — jika bertentangan, **blueprint menang**.
- Komponen di dokumen ini **sudah dibuat** kecuali yang ditandai lain di kolom Status.

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

Phase 1–3 menyentuh Layer 1 (+ Layer 2 di Phase 2); Node.js tetap baseline produksi sebagai
Layer 3, dan runtime Rust/V8 sendiri juga sudah ada (Phase 4 selesai — eksperimental, ADR-0019 dst).

## 3. Peta package

| Package | Tanggung jawab | Target fase | Status |
| --- | --- | --- | --- |
| `packages/core` | Request lifecycle, context, middleware, error handling | Phase 1 | selesai |
| `packages/router` | Matching route (statis, parameter, 404/405) | Phase 1 | selesai |
| `packages/server` | Wiring HTTP → middleware → router, serve (+ limits/rate limit) | Phase 1 | selesai |
| `packages/adapter-runtime` | Kontrak runtime + adapter Node + adapter in-memory (test) | Phase 1 | selesai |
| `packages/schema` | Integrasi Standard Schema (ADR-0004) + pemetaan error | Phase 1 | selesai |
| `packages/testing` | `createTestServer`, fixture app, helper | Phase 1 | selesai |
| `packages/react` | Adapter UI React (ADR-0003): SSR (sinkron + stream) + hydration + navigasi client | Phase 2 | selesai |
| `packages/ssr` | Render halaman → HTML (+ streaming Node, ADR-0047) | Phase 2 | selesai |
| `packages/client` | Tidak dibuat terpisah — hydration + navigasi client ada di `@ramonyx/react/client` (ADR-0007/0008) | — | digabung |
| `packages/compiler` | Manifest route (`createRouteManifest`, `loadPageRoutes`, `generateClientEntry`), transformasi + loader `register` | Phase 2 | file routing + halaman + codegen selesai (analisis batas server/client **belum**) |
| `packages/bundler` | Pembungkus Vite (ADR-0005): build client + dev server (ADR-0009) | Phase 2 | selesai |
| `packages/security` | Header keamanan + CSP nonce + CSRF + rate limit + SSRF guard | Phase 3 | selesai (ADR-0013–0017) |
| `packages/devtools` | CLI `ramonyx` (dev/build/start/doctor), dev server, diagnostics | Phase 2–3 | **v1 selesai** (ADR-0053) |
| `packages/mcp-docs-server` | MCP docs server (stdio): tools agen di atas machine layer + docs (ADR-0078) | Phase 5+ | selesai (paket ke-15) |
| `apps/playground` | App demo/uji end-to-end (SSR streaming + security) | Phase 1 | selesai |
| `apps/docs` | Dokumentasi publik (SSG ekspor + hosting) | Phase 2 | selesai (ADR-0052) |
| `apps/create-app` | CLI scaffolding (konvensi CLI devtools) | Phase 2–3 | selesai (ADR-0041/0053) |
| `runtime/crates/*` | Host Rust + V8 (runtime-core, cli, js-engine) | Phase 4 | selesai (eksperimental): V8/deno_core, ESM+TS, HTTP streaming, permission deny-all, worker/plugin + sandbox Landlock (ADR-0019–0051) |
| `benchmarks/*` | Skrip benchmark per area | Phase 1 | selesai (HTTP/SSR/security/startup — ADR-0045/0048) |

Status Phase 1–3: **selesai** — file routing API + halaman (loader/layout/error), SSR React +
**streaming** (ADR-0047), hydration (ADR-0007), client navigation (ADR-0008), dev server HMR
(ADR-0009), e2e browser + baseline Web Vitals (ADR-0010), hardening keamanan penuh
(limits/rate limit/security headers/CSRF/SSRF — ADR-0011–0017). Keputusan pemilik selesai
(ADR-0018); CLI devtools v1 (ADR-0053); situs docs di-host (ADR-0052).

Peta ini rambu, bukan larangan: jangan memecah paket lebih halus sebelum batas tanggung jawabnya
jelas (BLUEPRINT §5 aturan 5). Scope npm `@ramonyx/*` + meta `ramonyx` (ADR-0018); 0.1.1 terbit.

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

## 5. Kontrak framework ↔ adapter-runtime (v0 — diimplementasikan)

Prinsip:

- Tipe boundary memakai **standar web** (`Request`/`Response`, streams) — dapat diimplementasi
  Node sekarang, dan runtime Rust nanti.
- Adapter **in-memory wajib** ada sejak Phase 1 → framework dapat diuji tanpa server nyata dan
  tanpa runtime sendiri.
- Kemampuan fs/network/permission adalah **capability runtime** (Phase 4, ADR-0023 — deny-all
  default); kontrak web di atas tetap sama di Node maupun runtime Rust.

``` ts
// Diimplementasikan di packages/adapter-runtime/src/types.ts.
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
Phase 1 (berjalan): HTTP → adapter-runtime (Node) → server → middleware → router → handler → Response
Phase 2 (berjalan): Request → router → loader → render (adapter React) → HTML stream → Response
```

## 7. Batas MVP (Phase 1 — historis; semuanya sudah selesai, lihat roadmap)

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
| Topologi rilis & versioning | **diputuskan**: versi tunggal (`Cargo.toml`) + dist-tag alpha/beta/rc/latest (ADR-0039/0049); terbit 0.1.1 | — |

Diputuskan pemilik 2026-10-18: lisensi **MIT**, scope **`@ramonyx/*`**, browser matrix evergreen
(2 versi terakhir, ES2022), rekonsiliasi PRD — lihat ADR-0018.

## 9. Menguji framework tanpa runtime sendiri

In-memory adapter (§5) + `createTestServer` (`packages/testing`) menjalankan integration test di
Node tanpa port nyata. Browser test (hydration) baru relevan di Phase 2. Runtime Rust nanti cukup
memenuhi kontrak §5 + compatibility suite — tanpa perubahan `core`.
