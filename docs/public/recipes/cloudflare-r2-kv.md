---
recipe: cloudflare-r2-kv
title: Store files in R2 and metadata in KV
summary: Read Cloudflare KV/R2 bindings from env, stream uploads to R2, and keep small metadata/index entries in KV.
when: The app runs on Cloudflare Workers and needs object storage plus a small, fast lookup layer.
files: src/storage.server.ts, src/routes/api/files.ts, src/routes/api/files/[id].ts, wrangler.toml
verify: pnpm test:edge
---

# Store files in R2 and metadata in KV

R2 is object storage for files. KV is a small, globally replicated key-value store for metadata and
cached lookups. They are **Cloudflare bindings**, not npm packages: the Worker receives them through
`env`, and Ramonyx exposes them with `env.getRaw()`.

## Bindings

```toml
# wrangler.toml
[[kv_namespaces]]
binding = "KV_STORE"
id = "your-kv-namespace-id"

[[r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "my-app-files"
```

Create the namespace/bucket with Wrangler, then bind them in the Worker. Bindings are configuration,
not secrets; keep the R2 bucket private unless you deliberately use a public custom domain.

## Adapter

```ts
// src/storage.server.ts — server-only
import { HttpError, type EnvReader } from "ramonyx";

export interface FileStore {
  readonly kv: KVNamespace;
  readonly bucket: R2Bucket;
}

export function fileStore(env: EnvReader): FileStore {
  const kv = env.getRaw?.("KV_STORE") as KVNamespace | undefined;
  const bucket = env.getRaw?.("R2_BUCKET") as R2Bucket | undefined;
  if (kv === undefined || bucket === undefined) {
    // Node/dev tanpa binding: jangan diam-diam memakai memori sebagai pengganti produksi.
    throw new HttpError(503, "Cloudflare KV/R2 binding tidak tersedia");
  }
  return { kv, bucket };
}
```

Add `@cloudflare/workers-types` to the app for `KVNamespace` and `R2Bucket` types. Keep that
dependency in the app, not in `@ramonyx` core; the framework stays platform-neutral.

## Upload

```ts
// src/routes/api/files.ts
import { HttpError, route } from "ramonyx";
import { fileStore } from "../../storage.server.ts";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "application/pdf"]);

export const POST = route({
  handler: async ({ env, request, json }) => {
    const user = await requireUser(request); // authenticate first
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return json({ error: "file wajib" }, 400);
    }
    if (file.size > MAX_BYTES) {
      return json({ error: "file terlalu besar" }, 413);
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return json({ error: "tipe file tidak didukung" }, 415);
    }

    const { kv, bucket } = fileStore(env);
    // Jangan memakai nama file dari klien sebagai key: gunakan ID acak server-side.
    const id = crypto.randomUUID();
    const key = `uploads/${id}`;
    const metadata = {
      owner: user.id,
      name: file.name.slice(0, 200),
      type: file.type,
      size: file.size,
    };

    await Promise.all([
      bucket.put(key, file, {
        httpMetadata: { contentType: file.type },
        customMetadata: {
          owner: user.id,
          name: metadata.name,
          type: file.type,
        },
      }),
      // KV hanya cache/index kecil; R2 tetap sumber kebenaran objek.
      kv.put(`file:${id}`, JSON.stringify(metadata), { expirationTtl: 86_400 }),
    ]);

    return json({ id, ...metadata }, 201);
  },
});
```

`requireUser` is application code. Do not trust `file.name`, `file.type`, or a client-provided key
for authorization. A random object key prevents enumeration and overwrite attacks.

## Download

```ts
// src/routes/api/files/[id].ts
import { HttpError, route } from "ramonyx";
import { fileStore } from "../../../storage.server.ts";

export const GET = route({
  handler: async ({ env, params, request }) => {
    const user = await requireUser(request);
    const { bucket } = fileStore(env);
    const object = await bucket.get(`uploads/${params.id}`);
    if (object === null) {
      throw new HttpError(404, "File tidak ditemukan");
    }
    if (object.customMetadata?.owner !== user.id) {
      throw new HttpError(404, "File tidak ditemukan"); // jangan bocorkan keberadaan file
    }

    return new Response(object.body, {
      headers: {
        "content-type": object.httpMetadata?.contentType ?? "application/octet-stream",
        etag: object.httpEtag,
        "cache-control": "private, max-age=60",
        "x-content-type-options": "nosniff",
      },
    });
  },
});
```

Stream `object.body` directly; do not buffer large files. For media, use R2 range requests and return
`206`/`Content-Range`. If files must be public, use an R2 custom domain/public bucket instead of an
authenticated Worker route, and keep object keys unguessable.

## Verify

```bash
pnpm test:edge
ramonyx check --json
```

`pnpm test:edge` builds the playground edge artifact, runs it in workerd, then starts Miniflare with
real KV and R2 bindings. It writes `smoke=dari-r2-kv`, reads it back through
`GET /api/storage`, and checks missing keys return 404. The route is
[`apps/playground/src/routes/api/storage.ts`](../../../apps/playground/src/routes/api/storage.ts);
the smoke is [`scripts/edge-smoke.ts`](../../../scripts/edge-smoke.ts).

Node development does not provide R2/KV bindings. The adapter returns 503 instead of silently using
process memory; use Miniflare/Wrangler for local binding work.

## Limits and operations

- **KV is eventually consistent.** Do not use it for counters, locks, or authorization decisions.
  Use Durable Objects or D1 for atomic state.
- **KV has small values.** Keep metadata under its value limit; large blobs belong in R2.
- **R2 consistency:** object writes are strongly consistent for reads after write, but listing and
  metadata propagation can still need care. Store ownership in R2 `customMetadata` (as above), not
  only in KV.
- **Range/streaming:** `object.body` is a stream. For video/audio, implement `Range` parsing and
  `bucket.get(key, { range })`; this recipe only serves full objects.
- **Deletes:** delete R2 and KV together, and make deletion idempotent. A failed KV delete must not
  leave an authorization path open; R2 metadata remains authoritative.
- **Presigned URLs:** the R2 binding does not issue S3 presigned URLs. Use a public custom domain,
  or generate signed S3 URLs with separate R2 S3 credentials.
- **Limits:** enforce upload size before `bucket.put`; Workers request/body limits still apply.
  This recipe buffers `FormData` metadata, so for very large uploads use a streaming/multipart
  strategy or direct-to-R2 presigned upload.
- **No local fallback in production:** a missing binding is a configuration error, not a reason to
  write files to the Worker filesystem (which is ephemeral/read-only).
