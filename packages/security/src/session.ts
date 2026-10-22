// Session primitif (ADR-0062): cookie bertanda tangan. Mode default menyimpan JSON langsung
// di cookie; mode store menyimpan data di server dan cookie hanya berisi ID sesi bertanda tangan,
// sehingga rotasi/revocation tersedia. Semua implementasi edge-safe (Web Crypto).

import {
  type CookieOptions,
  expireCookie,
  parseCookies,
  serializeCookie,
  signValue,
  verifyValue,
} from "./cookies.ts";
import { randomHex } from "./random.ts";

export interface SessionData {
  readonly [key: string]: unknown;
}

export interface StoredSession {
  readonly data: SessionData;
  /** Unix epoch milliseconds. */
  readonly expiresAt: number;
}

/** Store sesi server-side; implementasi dapat memakai KV/Redis/database. */
export interface SessionStore {
  get(id: string): Promise<StoredSession | null>;
  set(id: string, session: StoredSession): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface MemorySessionStoreOptions {
  /** Sumber waktu untuk test; default `Date.now`. */
  readonly now?: () => number;
  /** Batas entri (anti memory-DoS); default 10.000. */
  readonly maxEntries?: number;
}

/** Store in-memory untuk development/test; produksi multi-instance perlu store bersama. */
export function createMemorySessionStore(options: MemorySessionStoreOptions = {}): SessionStore {
  const now = options.now ?? (() => Date.now());
  const maxEntries = options.maxEntries ?? 10_000;
  const entries = new Map<string, StoredSession>();

  const prune = (timestamp: number): void => {
    for (const [id, entry] of entries) {
      if (entry.expiresAt <= timestamp) {
        entries.delete(id);
      }
    }
    while (entries.size > maxEntries) {
      const oldest = entries.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      entries.delete(oldest);
    }
  };

  return {
    async get(id) {
      const entry = entries.get(id);
      if (entry === undefined) {
        return null;
      }
      if (entry.expiresAt <= now()) {
        entries.delete(id);
        return null;
      }
      return entry;
    },
    async set(id, session) {
      entries.set(id, session);
      prune(now());
    },
    async delete(id) {
      entries.delete(id);
    },
  };
}

export interface SessionOptions {
  /** Nama cookie; default `ramonyx_session`. */
  readonly cookieName?: string;
  /** Secret HMAC (wajib; dari env/binding, jangan hard-code). */
  readonly secret: string;
  /** Umur sesi (detik); default 7 hari. */
  readonly maxAgeSeconds?: number;
  /** Atribut cookie tambahan (mis. `domain`, `secure: false` untuk dev HTTP). */
  readonly cookie?: CookieOptions;
  /** Store server-side; bila diisi, cookie hanya membawa ID sesi bertanda tangan. */
  readonly store?: SessionStore;
  /** Sumber waktu untuk test; default `Date.now`. */
  readonly now?: () => number;
}

export interface Session {
  /** Baca sesi dari request; `null` bila tidak ada/tanda tangan tidak valid/kedaluwarsa. */
  read(request: Request): Promise<SessionData | null>;
  /** Nilai `Set-Cookie` untuk menyimpan sesi baru (mis. dipakai action). */
  commit(data: SessionData, options?: { maxAgeSeconds?: number }): Promise<string>;
  /**
   * Rotasi ID sesi (fixation protection). Data lama dipakai bila `data` tidak diberikan.
   * Tanpa store, ini hanya menandatangani ulang data karena tidak ada ID server-side.
   */
  rotate(
    request: Request,
    data?: SessionData,
    options?: { maxAgeSeconds?: number },
  ): Promise<string>;
  /** Hapus sesi di store (bila ada) dan kembalikan `Set-Cookie` kedaluwarsa. */
  revoke(request: Request): Promise<string>;
  /** Nilai `Set-Cookie` untuk menghapus cookie (tanpa store, ini cukup). */
  clear(): string;
}

const DEFAULT_COOKIE_NAME = "ramonyx_session";
const DEFAULT_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

interface SignedPayload {
  readonly [key: string]: unknown;
}

/**
 * Sesi cookie bertanda tangan (HMAC-SHA256). JSON di-encode → ditandatangani → cookie.
 *
 * ```ts
 * const session = createSession({ secret: env.get("SESSION_SECRET")! });
 * // action:
 * return { redirect: "/" } dengan headers Set-Cookie dari `await session.commit({ user: "rina" })`
 * ```
 */
export function createSession(options: SessionOptions): Session {
  const cookieName = options.cookieName ?? DEFAULT_COOKIE_NAME;
  const maxAgeSeconds = options.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS;
  const cookieOptions: CookieOptions = { ...options.cookie };
  const now = options.now ?? (() => Date.now());
  const store = options.store;

  const readPayload = async (request: Request): Promise<SignedPayload | null> => {
    const raw = parseCookies(request.headers.get("cookie"))[cookieName];
    const verified = await verifyValue(raw, options.secret);
    if (verified === null) {
      return null;
    }
    try {
      const parsed = JSON.parse(verified) as unknown;
      return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
        ? (parsed as SignedPayload)
        : null;
    } catch {
      return null;
    }
  };

  const readStoreId = async (request: Request): Promise<string | null> => {
    if (store === undefined) {
      return null;
    }
    const payload = await readPayload(request);
    return typeof payload?.sid === "string" ? payload.sid : null;
  };

  const commit = async (
    data: SessionData,
    commitOptions: { maxAgeSeconds?: number } = {},
  ): Promise<string> => {
    const ttlSeconds = commitOptions.maxAgeSeconds ?? maxAgeSeconds;
    let payload: SessionData;
    if (store === undefined) {
      payload = data;
    } else {
      const sid = randomHex(32);
      await store.set(sid, { data, expiresAt: now() + ttlSeconds * 1_000 });
      payload = { sid };
    }
    const signed = await signValue(JSON.stringify(payload), options.secret);
    return serializeCookie(cookieName, signed, { ...cookieOptions, maxAge: ttlSeconds });
  };

  return {
    async read(request: Request): Promise<SessionData | null> {
      const payload = await readPayload(request);
      if (payload === null) {
        return null;
      }
      if (store === undefined) {
        return payload as SessionData;
      }
      const sid = typeof payload.sid === "string" ? payload.sid : null;
      if (sid === null) {
        return null;
      }
      return (await store.get(sid))?.data ?? null;
    },

    commit,

    async rotate(request, data, rotateOptions = {}) {
      if (store === undefined) {
        const next = data ?? (await this.read(request)) ?? {};
        return commit(next, rotateOptions);
      }
      const oldSid = await readStoreId(request);
      let next = data;
      if (oldSid !== null) {
        const previous = await store.get(oldSid);
        if (next === undefined && previous !== null) {
          next = previous.data;
        }
        await store.delete(oldSid);
      }
      return commit(next ?? {}, rotateOptions);
    },

    async revoke(request) {
      if (store !== undefined) {
        const sid = await readStoreId(request);
        if (sid !== null) {
          await store.delete(sid);
        }
      }
      return expireCookie(cookieName, cookieOptions);
    },

    clear(): string {
      return expireCookie(cookieName, cookieOptions);
    },
  };
}
