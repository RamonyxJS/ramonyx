# Observability

Tiga hal yang disediakan framework (edge-safe, tanpa dependency — ADR-0071):

1. **Trace-id** per request (`traceId()`) — propagasi dari proxy/klien, tampil di request + respons.
2. **Log terstruktur** per request (`requestLogging()`) — method, path, status, durasi, traceId.
3. **Metrik dasar** (`createMetrics()`) — dari hook aplikasi (ADR-0065); snapshot JSON siap
   diekspor (OTel/Prometheus) lewat `createMetricsRoute()`.

## Pemasangan

```ts
// src/app.ts
import { createHandler, createMetrics, createMetricsRoute, requestLogging, traceId } from "@ramonyx/server";
import { mergeHooks } from "ramonyx";

const metrics = createMetrics();
const hooks = mergeHooks(options.hooks, metrics.hooks); // gabung dengan hook plugin

return createHandler({
  routes: [...apiRoutes, createMetricsRoute(metrics), ...pageRoutes],
  middleware: [traceId(), requestLogging(), staticAssets], // urutan: trace → log → aset
  hooks,
});
```

- `traceId({ header? })` — default `x-request-id`; request diganti dengan header terisi sehingga
  **loader/action** dapat membacanya (`request.headers.get("x-request-id")`), dan header yang
  sama ditulis pada respons.
- `requestLogging({ message?, header? })` — memakai `context.log` (logger aplikasi), jadi format
  akhirnya mengikuti logger Anda (JSON di `createConsoleLogger`).
- `createMetricsRoute(metrics, { path? })` — `GET /metrics` (default). **Jangan diekspos publik
  tanpa proteksi** — batasi jaringan/proteksi sendiri.

## Bentuk log (contoh)

```json
{"time":"…","level":"info","message":"request","method":"GET","path":"/produk","status":200,"ms":12,"traceId":"4c1f…"}
```

## Snapshot metrik (contoh)

```json
{
  "requests": { "total": 128, "byStatusClass": { "2xx": 120, "4xx": 7, "5xx": 1 },
                "durationMs": { "sum": 4310, "count": 128, "max": 240 } },
  "loaders":  { "count": 96, "cached": 40, "durationMs": { "sum": 1200, "max": 80 } },
  "renders":  { "count": 90, "streaming": 12, "durationMs": { "sum": 2100, "max": 120 } },
  "invalidations": 3
}
```

## OTel-ready (manual, tanpa dependency)

- **Log**: JSON line sudah membawa `traceId` — kirim ke collector log apa pun (Fluent Bit,
  Vector, OTLP log exporter).
- **Metrik**: `metrics.snapshot()` mengembalikan angka kumulatif — jadwalkan ekspor berkala
  (mis. `setInterval`) ke endpoint OTLP/Prometheus, atau tarik lewat `GET /metrics`.
- **Trace**: `traceId` adalah id korelasi sederhana (bukan W3C `traceparent` penuh). Span OTel
  native belum ada — kandidat bila ada permintaan nyata (tidak dicatat di TODO).

## Dogfood

Playground memasang ketiganya (`apps/playground/src/app.ts`): trace-id di semua respons,
log request lewat logger terstruktur, dan `GET /metrics` — diuji di
`apps/playground/test/app.test.ts`.

## Batasan (jujur)

- In-memory per proses (multi-instance: agregasi di luar, mis. collector).
- Tanpa histogram/percentile (sum/count/max saja) — cukup untuk papan dasar.
- Tanpa tracing terdistribusi native (span/context propagation OTel) — `traceId` sebagai jembatan.
