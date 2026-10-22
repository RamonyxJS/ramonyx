# State & Adapters

Ramonyx separates **state contracts** from implementations. The default implementations are
in-memory so a new app starts without infrastructure; production can swap in a shared store without
changing application code.

## Contracts

| Contract | Used by | Required behavior |
| --- | --- | --- |
| `KeyValueStore` / `CacheStore` | loader cache, revalidation | `get`, `set` with TTL/tags, `delete`, `invalidateTags`; optional atomic `take` and `increment` |
| `SessionStore` | `createSession({ store })` | `get`, `set`, `delete`; expiry is enforced by the store/cookie |
| `RateLimitStore` | `rateLimit({ store })` | atomic `increment(key, { windowSeconds })` |
| `ObservabilitySink` | `createMetrics({ sink })` | `record(event)`; must be fast and must not make requests fail |

In-memory references:

```ts
import {
  createMemoryStore,
  createMemoryObservabilitySink,
} from "ramonyx";
import { createMemorySessionStore } from "@ramonyx/security";

const store = createMemoryStore();                 // CacheStore + RateLimitStore
const sessions = createMemorySessionStore();       // SessionStore
const sink = createMemoryObservabilitySink();      // ObservabilitySink
```

The shared `KeyValueStore` contract is covered by `tests/contracts/store.contract.ts`; the
session/rate-limit/user/token adapters add their own focused tests.

## Lifetimes and failure modes

- **In-memory defaults are per process.** Multi-instance deployments must use a shared adapter;
  otherwise sessions, rate limits, and cache invalidation diverge between instances.
- **TTL is owned by the store.** Framework entries carry an absolute `expiresAt` where relevant,
  but adapters must honor `ttlSeconds`. Clock skew between application and store shifts expiry.
- **Atomic operations are explicit.** `increment` must be atomic for rate limiting; `take` must be
  atomic for one-time tokens. `createAuthTokens` uses `take` when available and documents the
  best-effort fallback for older adapters.
- **Fail fast, do not silently fall back.** A store outage should surface as an error, not switch
  to process-local state (which would silently weaken sessions/limits). The observability sink is
  the exception: `createMetrics` swallows sink errors so a collector outage cannot break traffic.
- **No automatic retries for non-idempotent operations.** Retrying an increment can over-count;
  retries/timeouts belong to the adapter with operation-aware semantics.
- **Cache tags are indexes.** `invalidateTags` must remove matching entries and their index
  references, otherwise deleted data remains reachable by the next tag invalidation.

## Observability sink

```ts
import { createJsonObservabilitySink } from "ramonyx";
import { createMetrics } from "@ramonyx/server";

const metrics = createMetrics({
  sink: createJsonObservabilitySink((line) => process.stdout.write(line)),
});
```

Events are `request.end`, `loader.end`, `render.end`, and `cache.invalidate`, with primitive
attributes (path, status, duration, cached, streaming, invalidation reason/tags). JSON-lines is
directly consumable by OTel/Fluent Bit/Vector agents; an OTel SDK exporter can implement the same
`ObservabilitySink` interface.

Sinks should enqueue or write non-blocking. Hooks are synchronous and must stay cheap; do not call
a remote collector inline.

## Wiring a shared adapter

```ts
import { createCache } from "ramonyx";
import {
  createKeyValueSessionStore,
  createKeyValueUserStore,
  rateLimit,
} from "@ramonyx/security";

const cache = createCache({ store });                       // KeyValueStore
const session = createSession({ secret, store: createKeyValueSessionStore(store) });
const users = createKeyValueUserStore(store);
const limiter = rateLimit({ limit: 60, windowMs: 60_000, store });
```

`store` is any object satisfying `KeyValueStore`. Redis/KV adapters still need to provide TTL,
atomic increment, atomic take, tag indexes, reconnect behavior, and deployment-specific failure
handling; those production adapters are tracked separately from the in-memory contract.

## Defaults in examples

The playground and templates keep the in-memory adapters, so `pnpm dev` and `pnpm build` work
without Redis or a database. Opt in to shared adapters only when the deployment is multi-instance.
