// Redis adapter untuk kontrak KeyValueStore (Node-only; edge memakai adapter KV lain).
// Reconnect ditangani client Redis; adapter tidak pernah fallback diam-diam ke state lokal.

import type { KeyValueStore, StoreEntry, StoreSetOptions } from "@ramonyx/core";
import { createClient } from "redis";

/** Subset perintah Redis yang dipakai adapter; mudah dibungkus dari ioredis/node-redis. */
export interface RedisClientLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { readonly EX?: number }): Promise<unknown>;
  del(key: string): Promise<number>;
  sAdd(key: string, member: string | string[]): Promise<number>;
  sRem(key: string, member: string | string[]): Promise<number>;
  sMembers(key: string): Promise<string[]>;
  incr(key: string): Promise<number>;
  eval(
    script: string,
    options: { readonly keys: string[]; readonly arguments: string[] },
  ): Promise<unknown>;
}

export interface RedisStoreOptions {
  /** Prefix semua key; default `ramonyx:`. */
  readonly prefix?: string;
  /** Sumber waktu untuk metadata expiresAt; default `Date.now`. */
  readonly now?: () => number;
}

export interface RedisStore extends KeyValueStore {
  readonly take: NonNullable<KeyValueStore["take"]>;
  readonly increment: NonNullable<KeyValueStore["increment"]>;
}

interface Envelope {
  readonly value: unknown;
  readonly expiresAt: number | null;
  readonly tags: readonly string[];
}

const TAKE_SCRIPT = `
local value = redis.call('GET', KEYS[1])
if value then redis.call('DEL', KEYS[1]) end
return value
`;

const INCREMENT_SCRIPT = `
local value = redis.call('INCR', KEYS[1])
if value == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return value
`;

/**
 * Bangun KeyValueStore dari client Redis. TTL memakai `SET EX`, increment/take memakai Lua
 * atomik, tag disimpan sebagai Redis set. Error Redis diteruskan ke pemanggil (fail-fast).
 */
export function createRedisStore(
  client: RedisClientLike,
  options: RedisStoreOptions = {},
): RedisStore {
  const prefix = options.prefix ?? "ramonyx:";
  const now = options.now ?? (() => Date.now());
  const dataKey = (key: string): string => `${prefix}${key}`;
  const tagKey = (tag: string): string => `${prefix}tag:${tag}`;

  const read = async (key: string): Promise<Envelope | undefined> => {
    const raw = await client.get(dataKey(key));
    if (raw === null) {
      return undefined;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) {
      throw new Error(`nilai Redis tidak valid untuk key ${key}`);
    }
    const entry = parsed as Partial<Envelope>;
    return {
      value: entry.value,
      expiresAt: typeof entry.expiresAt === "number" ? entry.expiresAt : null,
      tags: Array.isArray(entry.tags)
        ? entry.tags.filter((tag): tag is string => typeof tag === "string")
        : [],
    };
  };

  const removeTags = async (key: string, tags: readonly string[]): Promise<void> => {
    await Promise.all(tags.map((tag) => client.sRem(tagKey(tag), dataKey(key))));
  };

  return {
    async get<T>(key: string): Promise<StoreEntry<T> | undefined> {
      const entry = await read(key);
      return entry === undefined
        ? undefined
        : { value: entry.value as T, expiresAt: entry.expiresAt };
    },

    async set<T>(key: string, value: T, setOptions: StoreSetOptions = {}): Promise<void> {
      const old = await read(key);
      if (old !== undefined) {
        await removeTags(key, old.tags);
      }
      if (setOptions.ttlSeconds !== undefined && setOptions.ttlSeconds <= 0) {
        await client.del(dataKey(key));
        return;
      }
      const tags = [...new Set(setOptions.tags ?? [])];
      const envelope: Envelope = {
        value,
        expiresAt:
          setOptions.ttlSeconds === undefined ? null : now() + setOptions.ttlSeconds * 1_000,
        tags,
      };
      const payload = JSON.stringify(envelope);
      if (setOptions.ttlSeconds === undefined) {
        await client.set(dataKey(key), payload);
      } else {
        await client.set(dataKey(key), payload, {
          EX: Math.max(1, Math.ceil(setOptions.ttlSeconds)),
        });
      }
      await Promise.all(tags.map((tag) => client.sAdd(tagKey(tag), dataKey(key))));
    },

    async delete(key: string): Promise<void> {
      const old = await read(key);
      await client.del(dataKey(key));
      if (old !== undefined) {
        await removeTags(key, old.tags);
      }
    },

    async take<T>(key: string): Promise<T | undefined> {
      const raw = (await client.eval(TAKE_SCRIPT, {
        keys: [dataKey(key)],
        arguments: [],
      })) as string | null;
      if (raw === null) {
        return undefined;
      }
      const envelope = JSON.parse(raw) as Envelope;
      await removeTags(key, envelope.tags ?? []);
      return envelope.value as T;
    },

    async invalidateTags(tags: readonly string[]): Promise<number> {
      let removed = 0;
      for (const tag of new Set(tags)) {
        const members = await client.sMembers(tagKey(tag));
        for (const member of members) {
          removed += await client.del(member);
          await client.sRem(tagKey(tag), member);
        }
      }
      return removed;
    },

    async increment(
      key: string,
      incrementOptions: { readonly windowSeconds: number },
    ): Promise<number> {
      const value = await client.eval(INCREMENT_SCRIPT, {
        keys: [dataKey(key)],
        arguments: [String(Math.max(1, Math.ceil(incrementOptions.windowSeconds)))],
      });
      return Number(value);
    },
  };
}

export interface RedisConnectionOptions extends RedisStoreOptions {
  readonly url: string;
  /** Dipanggil untuk error koneksi/reconnect; default tidak mencetak PII. */
  readonly onError?: (error: Error) => void;
}

export interface RedisStoreConnection {
  readonly store: RedisStore;
  readonly client: {
    readonly isOpen: boolean;
    quit(): Promise<unknown>;
  };
  close(): Promise<void>;
}

/**
 * Connect ke Redis dengan reconnect strategy bawaan node-redis. Operasi gagal akan reject;
 * aplikasi harus memutuskan degradasi (mis. 503), bukan memakai state lokal diam-diam.
 */
export async function connectRedisStore(
  options: RedisConnectionOptions,
): Promise<RedisStoreConnection> {
  const client = createClient({
    url: options.url,
    socket: { reconnectStrategy: (retries) => Math.min(1_000, 50 * 2 ** retries) },
  });
  client.on("error", (error: Error) => {
    options.onError?.(error);
  });
  await client.connect();
  return {
    store: createRedisStore(client as unknown as RedisClientLike, options),
    client,
    async close() {
      if (client.isOpen) {
        await client.quit();
      }
    },
  };
}
