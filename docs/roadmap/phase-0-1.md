# Roadmap Phase 0–1

- Status per 2026-10-18. Sumber: `docs/BLUEPRINT.md` §9 dan §12.

## Phase 0 — Foundation & RFC

Exit criteria: keputusan arsitektur terdokumentasi dan dapat diuji.

- [x] Bootstrap repo (README, `.gitignore`, git `main`)
- [x] ADR-0001 strategi runtime (Accepted)
- [x] ADR-0002 baseline tooling & CI (Accepted)
- [x] ADR-0003 adapter UI React (Accepted — keputusan pemilik)
- [ ] ADR-0004 kontrak schema — **Proposed**, menunggu keputusan pemilik
- [ ] ADR-0005 bundler awal — **Proposed**, menunggu keputusan pemilik
- [x] `docs/architecture.md` (peta package, batas, kontrak runtime draft)
- [x] `docs/api/core-contract.md` v0
- [x] `docs/security/threat-model.md`
- [x] `docs/benchmark-protocol.md`
- [x] `docs/coding-standards.md`
- [ ] Keputusan terbuka: scope npm & lisensi; matrix browser; rekonsiliasi PRD (template "mobile",
      metrik docs 90%, forum/support)
- [ ] Review pemilik atas dokumen Phase 0 (khususnya kontrak API v0 + ADR Proposed)

Setelah semua tertutup → Phase 1. **Jangan mulai scaffold Phase 1 sebelum kontrak inti & ADR
diterima.**

## Phase 1 — Framework MVP

Exit criteria: demo app berjalan di Node.js, integration test lulus, baseline performa tercatat.

1. Prasyarat: pasang pnpm (`corepack enable pnpm`); pin Node LTS.
2. Scaffold workspace: root `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`;
   `apps/playground` + `packages/{core,router,server,schema,adapter-runtime,testing}`.
3. CI awal dengan urutan wajib: lint → typecheck → test → build → security checks.
4. `adapter-runtime`: kontrak + adapter in-memory + adapter Node (serve).
5. `core`: context, lifecycle, middleware, error handling + `HttpError`.
6. `router`: route statis + parameter + 404/405.
7. `schema`: integrasi Standard Schema (jika ADR-0004 diterima) + pemetaan error; uji 2 implementasi.
8. `server`: wiring HTTP → middleware → router → handler; loader config `ramonyx.config.ts`.
9. `testing`: `createTestServer` + helper fixture.
10. Demo app di `apps/playground` sesuai kontrak; integration tests.
11. Benchmark baseline (autocannon, routing + middleware minimal) + artefak sesuai protokol.
12. Sinkronisasi dokumen: kontrak ↔ implementasi.

Catatan risiko:
- Interface `RuntimeHost` akan bergerak saat implementasi — perubahan signifikan dicatat ADR.
- Jangan menambah fitur di luar kontrak v0 (server actions, SSR, dev server) di Phase 1.

## Phase 2–5 (ringkas — detail di BLUEPRINT §9)

- **Phase 2:** file routing, adapter React, SSR + loader + error boundary, dev server/HMR, browser tests.
- **Phase 3:** fuzzing, abuse-case, load test, resource limits, dependency audit, security regression suite.
- **Phase 4:** runtime alpha (Rust + V8): executable, module loader, permission & API sistem dasar.
- **Phase 5:** runtime beta: HTTP/streaming/shutdown/cancellation, isolasi, profiling, compatibility suite, rilis.
