// Session primitif (ADR-0062): cookie bertanda tangan berisi JSON — cukup untuk sesi ringan
// (edge-safe, Web Crypto). Untuk data besar/rahasia, gunakan store eksternal + simpan id saja.

import {
  type CookieOptions,
  expireCookie,
  parseCookies,
  serializeCookie,
  signValue,
  verifyValue,
} from "./cookies.ts";

export interface SessionOptions {
  /** Nama cookie; default `ramonyx_session`. */
  readonly cookieName?: string;
  /** Secret HMAC (wajib; dari env/binding, jangan hard-code). */
  readonly secret: string;
  /** Umur sesi (detik); default 7 hari. */
  readonly maxAgeSeconds?: number;
  /** Atribut cookie tambahan (mis. `domain`, `secure: false` untuk dev HTTP). */
  readonly cookie?: CookieOptions;
}

export interface SessionData {
  readonly [key: string]: unknown;
}

export interface Session {
  /** Baca sesi dari request; `null` bila tidak ada/tanda tangan tidak valid. */
  read(request: Request): Promise<SessionData | null>;
  /** Nilai `Set-Cookie` untuk menyimpan sesi (mis. dipakai action). */
  commit(data: SessionData, options?: { maxAgeSeconds?: number }): Promise<string>;
  /** Nilai `Set-Cookie` untuk menghapus sesi (logout). */
  clear(): string;
}

const DEFAULT_COOKIE_NAME = "ramonyx_session";
const DEFAULT_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

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

  return {
    async read(request: Request): Promise<SessionData | null> {
      const raw = parseCookies(request.headers.get("cookie"))[cookieName];
      const verified = await verifyValue(raw, options.secret);
      if (verified === null) {
        return null;
      }
      try {
        const parsed = JSON.parse(verified) as unknown;
        return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
          ? (parsed as SessionData)
          : null;
      } catch {
        return null;
      }
    },

    async commit(data: SessionData, commitOptions = {}): Promise<string> {
      const signed = await signValue(JSON.stringify(data), options.secret);
      return serializeCookie(cookieName, signed, {
        ...cookieOptions,
        maxAge: commitOptions.maxAgeSeconds ?? maxAgeSeconds,
      });
    },

    clear(): string {
      return expireCookie(cookieName, cookieOptions);
    },
  };
}
