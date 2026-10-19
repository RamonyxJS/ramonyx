# ADR-0071: Observability — Trace-Id, Log Terstruktur, Metrik (di `@ramonyx/server`)

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: TODO `p2-observability`; rencana komprehensif F5 (memakai `AppHooks` F0).

## Konteks

Produksi butuh visibilitas: korelasi request (trace-id), log terstruktur, dan metrik dasar.
Pesaing menyediakan integrasi (Next.js instrumentation, Nuxt devtools/OTel). Primitif
`AppHooks` (ADR-0065) sudah tersedia, tetapi belum ada helper siap pakai.

## Keputusan

1. **Ditempatkan di `@ramonyx/server`** — **deviasi dari sketsa rencana** (yang menyebut paket
   `@ramonyx/observability`): middleware observability adalah urusan server, sudah edge-safe, dan
   menghindari paket npm ke-15 + churn rilis untuk tiga helper kecil. Bila kelak butuh transport
   OTel native/paket berat, paket terpisah dapat dibuat tanpa mengubah API ini.
2. **`traceId({ header? })`** (Middleware): pakai header masuk bila ada (propagasi), jika tidak
   generate (`crypto.randomUUID`, fallback hex `getRandomValues`); request diganti dengan header
   terisi (loader/action membacanya) + header ditulis pada respons.
3. **`requestLogging({ message?, header? })`** (Middleware): durasi + method/path/status +
   traceId lewat `context.log.info` (format mengikuti logger aplikasi). Trace dibaca dari
   **request** (bukan respons) karena middleware trace membungkus log di luar — bug kecil ini
   ditemukan test dan diperbaiki di sesi yang sama.
4. **`createMetrics()`** → `{ hooks, snapshot() }`: kumpulkan dari `onRequestEnd`
   (total, kelas status, sum/count/max durasi), `onLoaderEnd` (count, cached, durasi),
   `onRenderEnd` (count, streaming, durasi), `onInvalidate`. Snapshot JSON-serializable.
5. **`createMetricsRoute(metrics, { path? })`**: RouteEntry `GET /metrics` — aplikasi memilih
   memasang; peringatan proteksi didokumentasikan.
6. **Dogfood**: playground memasang ketiganya (`traceId` + `requestLogging` menggantikan logger
   tangan; `createMetrics` + `/metrics`), diuji di test playground (header trace + snapshot).
7. **OTel-ready tanpa dependency**: log JSON + `traceId` untuk korelasi; ekspor metrik manual
   (interval/route). Tracing native (span/propagation penuh) dicatat sebagai kandidat.

## Bukti

- `packages/server/test/observability.test.ts`: trace generate/propagasi/header kustom;
  baris log (status 201, path tanpa query, durasi, traceId = respons); metrik (2xx/4xx,
  count, route JSON).
- `apps/playground/test/app.test.ts`: `x-request-id` pada respons halaman + `GET /metrics`
  memuat `requests.total` dan `renders.count` (hook dari render nyata).
- `docs/observability.md` (pemasangan, bentuk log/snapshot, OTel manual, batasan).

## Alternatif yang ditolak

- **Paket baru `@ramonyx/observability`**: belum ada kebutuhan nyata yang memisahkan (transport,
  dependency berat); ditunda sampai ada alasan konkret.
- **Hanya hook tanpa middleware**: trace-id + logging pre-routing tetap dibutuhkan (jalan tanpa
  mengubah `createApp` aplikasi lewat plugin/CLI).
- **Histogram/percentile sekarang**: kompleksitas tanpa konsumen; sum/count/max cukup untuk
  papan dasar, histogram menyusul bila ada permintaan.

## Konsekuensi

- Aplikasi mendapat trace-id + log + metrik dengan ±5 baris wiring; plugin dapat menambah
  middleware yang sama lewat kontrak ADR-0067.
- In-memory per proses (didokumentasikan); agregasi multi-instance di luar.
- Sisa kandidat: OTel tracing native, histogram, ekspor berkala otomatis, `/metrics` terproteksi
  bawaan (mis. hanya loopback).
