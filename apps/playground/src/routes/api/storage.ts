import { type EnvReader, HttpError, route } from "ramonyx";

// Demo binding Cloudflare KV + R2 (ADR-0068). Di Node binding tidak tersedia → 503.
// Tipe struktural menjaga paket edge-safe tetap tanpa @cloudflare/workers-types.
interface KVNamespaceLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { readonly expirationTtl?: number }): Promise<void>;
}

interface R2ObjectLike {
  readonly size?: number;
  readonly httpEtag?: string;
  text(): Promise<string>;
}

interface R2BucketLike {
  get(key: string): Promise<R2ObjectLike | null>;
  put(
    key: string,
    value: string,
    options?: { readonly httpMetadata?: { readonly contentType?: string } },
  ): Promise<unknown>;
}

function bindings(env: EnvReader): { kv: KVNamespaceLike; bucket: R2BucketLike } {
  const kv = env.getRaw?.("KV_STORE") as KVNamespaceLike | undefined;
  const bucket = env.getRaw?.("R2_BUCKET") as R2BucketLike | undefined;
  if (kv === undefined || bucket === undefined) {
    throw new HttpError(503, "Binding KV_STORE/R2_BUCKET tidak tersedia");
  }
  return { kv, bucket };
}

function keyFrom(value: unknown): string {
  const key = String(value ?? "demo").trim();
  if (key.length === 0 || key.length > 100) {
    throw new HttpError(400, "key wajib 1–100 karakter");
  }
  return key;
}

export const GET = route({
  handler: async ({ env, request, json }) => {
    const key = keyFrom(new URL(request.url).searchParams.get("key"));
    const { kv, bucket } = bindings(env);
    const [kvValue, object] = await Promise.all([kv.get(key), bucket.get(key)]);
    if (kvValue === null && object === null) {
      return json({ error: "Not Found" }, 404);
    }
    return json({
      key,
      kv: kvValue,
      r2: object === null ? null : await object.text(),
      size: object?.size ?? null,
      etag: object?.httpEtag ?? null,
    });
  },
});

export const POST = route({
  handler: async ({ env, request, json }) => {
    const body = (await request.json()) as { key?: unknown; value?: unknown };
    const key = keyFrom(body.key);
    const value = String(body.value ?? "");
    if (value.length > 1024) {
      return json({ error: "value maksimal 1024 karakter" }, 400);
    }
    const { kv, bucket } = bindings(env);
    await Promise.all([
      kv.put(key, value, { expirationTtl: 3600 }),
      bucket.put(key, value, { httpMetadata: { contentType: "text/plain; charset=utf-8" } }),
    ]);
    return json({ ok: true, key }, 201);
  },
});
