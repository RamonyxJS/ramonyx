# ADR-0010: Browser E2E — Playwright + Baseline Web Vitals

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: BLUEPRINT §8 (Web Vitals) dan §9 (browser test Phase 2), ADR-0007/0008/0009

## Konteks

Fitur browser (hydration, soft navigation, halaman error) selama ini diverifikasi manual via
chrome-devtools MCP. Butuh test otomatis yang jalan di CI, plus cara mengambil baseline Web Vitals
sesuai protokol benchmark §8.

## Keputusan

- **Playwright** (`@playwright/test`) sebagai runner e2e; config di root `playwright.config.ts`,
  spec di `apps/playground/e2e/`.
- Target uji: **build produksi** (`pnpm start`, port 3000) lewat `webServer` Playwright;
  script `pnpm test:e2e` = `pnpm build && playwright test`.
- Cakupan v0: SSR + hydration (counter), soft navigation + back/forward dengan sentinel
  (bukti tanpa full reload), halaman error 404/400, dan baseline Web Vitals.
- Browser: CI memakai `pnpm exec playwright install --with-deps chromium`; lokal boleh
  `PLAYWRIGHT_EXECUTABLE_PATH` ke Chrome yang sudah ada (mesin dev: chrome-for-testing)
  agar tidak mengunduh browser Playwright.
- **Baseline Web Vitals** ditulis sebagai artefak `benchmarks/results/phase2-web-vitals.json`
  (LCP/CLS/FCP/TTFB dari `PerformanceObserver`) — tanpa klaim threshold; threshold per workload
  menyusul sesuai protokol §8.

## Alternatif yang ditolak

- Puppeteer mentah — tanpa runner, assertion, dan integrasi CI.
- Vitest browser mode — menambah runner kedua; jalur Node sudah `node --test`.
- Menetapkan assertion threshold Web Vitals sekarang — belum ada baseline workload; berisiko
  flake dan melanggar aturan klaim (BLUEPRINT §10).

## Konsekuensi

- CI menambah langkah install chromium + e2e (lebih lambat, tetapi menutup gap browser otomatis).
- Artefak vitals ditimpa tiap run lokal; versi ter-commit menjadi baseline historis.
- e2e menguji build produksi; jalur dev (Vite) tetap diverifikasi manual/chrome-devtools.
