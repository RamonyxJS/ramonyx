# Observability

Three edge-safe primitives, built on the existing middleware + hook system (no dependency):

1. **Trace id** per request (`traceId()`) — propagated or generated, readable in loaders/actions.
2. **Structured request logs** (`requestLogging()`) — method, path, status, duration, trace id.
3. **Metrics** (`createMetrics()`) — counters/latencies from app hooks, exposed as JSON.

## Wiring

```ts
// src/app.ts
import { createMetrics, createMetricsRoute, requestLogging, traceId } from "@ramonyx/server";
import { mergeHooks } from "ramonyx";

const metrics = createMetrics();

const handler = createHandler({
  routes: [
    ...apiRoutes,
    createMetricsRoute(metrics),   // GET /metrics
    ...createPageRoutes({ pages, renderer, hooks: mergeHooks(appHooks, metrics.hooks) }),
  ],
  middleware: [traceId(), requestLogging()],
  hooks: mergeHooks(appHooks, metrics.hooks),
});
```

Order matters: `traceId()` must run before `requestLogging()` so the log line carries the id.

## Trace id

- Uses the incoming `x-request-id` header when present (proxy/client propagation), otherwise
  generates one (UUID, with a `getRandomValues` fallback).
- Rewrites the request with the header set, so loaders/actions can read it; sets the same header on
  the response.

```ts
// inside a loader
const id = request.headers.get("x-request-id");
```

Custom header name: `traceId({ header: "x-trace-id" })`.

## Structured logs

```ts
requestLogging();                    // message "request"
requestLogging({ message: "http" }); // custom message
```

`requestLogging()` emits one `info` line per request through the app logger:

```json
{"level":"info","message":"request","method":"GET","path":"/","status":200,"ms":12,"traceId":"…"}
```

Ship it to any collector (Fluent Bit, Vector, OTLP log exporter). Secrets/PII must not be logged —
the framework only emits method/path/status/duration/trace id.

## Metrics

`createMetrics()` returns `{ hooks, snapshot() }`:

```json
{
  "requests": { "total": 120, "byStatusClass": { "2xx": 118, "5xx": 2 },
                "durationMs": { "sum": 1840, "count": 120, "max": 210 } },
  "loaders": { "count": 80, "cached": 42, "durationMs": { "sum": 620, "max": 90 } },
  "renders": { "count": 118, "streaming": 110, "durationMs": { "sum": 980, "max": 140 } },
  "invalidations": 3
}
```

- `createMetricsRoute(metrics, { path: "/metrics" })` serves the snapshot as JSON.
- Schedule `metrics.snapshot()` exports to OTLP/Prometheus from your platform, or pull `/metrics`.
- Counters are cumulative since process start (per instance).
- Pass an `ObservabilitySink` to `createMetrics({ sink })` for JSON-lines or an OTel adapter; see
  [State & Adapters](state-and-adapters.md). A failing sink is isolated from requests.

## Notes & limitations

- `traceId` is a correlation id, not a full W3C `traceparent`; native OpenTelemetry spans are not
  built in (candidate if there is demand).
- Metrics are process-local: multi-instance deployments should scrape each instance or aggregate in
  your platform.
- The hooks are zero-cost when unused; the helpers are edge-safe (no `node:*`).
