// Kontrak state terdistribusi (ADR-0065): cache, rate limit, dan sink observability.
// Adapter in-memory menjadi referensi perilaku; adapter eksternal memenuhi antarmuka yang sama.

import type { KeyValueStore } from "./store.ts";

/** Cache data memakai kontrak KeyValueStore (TTL + tag + invalidasi). */
export type CacheStore = KeyValueStore;

/** Counter rate limit; wajib atomik di adapter terdistribusi. */
export type RateLimitStore = {
  readonly increment: NonNullable<KeyValueStore["increment"]>;
};

export type ObservabilityAttribute = string | number | boolean | undefined;

export interface ObservabilityEvent {
  readonly name: string;
  readonly attributes?: Readonly<Record<string, ObservabilityAttribute>>;
  /** Unix epoch milliseconds; diisi sink default. */
  readonly timestamp?: number;
}

/**
 * Sink metrik/log. Kontrak: cepat dan tidak boleh menggagalkan request. `createMetrics` menelan
 * error/rejection agar backend observability yang down tidak mematikan trafik.
 */
export interface ObservabilitySink {
  record(event: ObservabilityEvent): void | Promise<void>;
}

export interface MemoryObservabilitySink extends ObservabilitySink {
  events(): readonly ObservabilityEvent[];
  clear(): void;
}

export interface MemoryObservabilitySinkOptions {
  /** Batas event yang disimpan; default 1.000 (anti memory-DoS). */
  readonly maxEvents?: number;
  /** Sumber waktu; default `Date.now`. */
  readonly now?: () => number;
}

/** Sink in-memory untuk test/dev; event dibatasi agar tidak tumbuh tanpa batas. */
export function createMemoryObservabilitySink(
  options: MemoryObservabilitySinkOptions = {},
): MemoryObservabilitySink {
  const maxEvents = Math.max(1, Math.floor(options.maxEvents ?? 1_000));
  const now = options.now ?? (() => Date.now());
  let entries: ObservabilityEvent[] = [];
  return {
    record(event) {
      entries.push({ ...event, timestamp: event.timestamp ?? now() });
      if (entries.length > maxEvents) {
        entries = entries.slice(entries.length - maxEvents);
      }
    },
    events() {
      return entries;
    },
    clear() {
      entries = [];
    },
  };
}

/** Sink JSON-lines: satu objek per baris, cocok untuk stdout collector/OTel agent. */
export function createJsonObservabilitySink(
  write: (line: string) => void,
  options: { readonly now?: () => number } = {},
): ObservabilitySink {
  const now = options.now ?? (() => Date.now());
  return {
    record(event) {
      write(
        `${JSON.stringify({
          timestamp: event.timestamp ?? now(),
          name: event.name,
          ...(event.attributes === undefined ? {} : { attributes: event.attributes }),
        })}\n`,
      );
    },
  };
}
