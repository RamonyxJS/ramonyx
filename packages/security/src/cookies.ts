// Cookie helper (ADR-0062): parse/serialize + tanda tangan HMAC (Web Crypto, edge-safe).
//
// Nilai yang ditandatangani TIDAK dienkripsi — jangan menaruh rahasia di cookie sesi.

const encoder = new TextEncoder();

export interface CookieOptions {
  readonly path?: string;
  readonly maxAge?: number;
  readonly httpOnly?: boolean;
  readonly secure?: boolean;
  readonly sameSite?: "strict" | "lax" | "none";
  /** Domain cookie (opsional; default host-only). */
  readonly domain?: string;
}

/** Default aman untuk cookie sesi. */
export const DEFAULT_COOKIE_OPTIONS: Required<Omit<CookieOptions, "maxAge" | "domain">> = {
  path: "/",
  httpOnly: true,
  secure: true,
  sameSite: "lax",
};

/** Parse header `Cookie` → peta nama→nilai (first-wins, nilai di-decode). */
export function parseCookies(header: string | null | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (header === null || header === undefined || header.length === 0) {
    return result;
  }
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index <= 0) {
      continue;
    }
    const name = part.slice(0, index).trim();
    if (name.length === 0 || name in result) {
      continue;
    }
    const raw = part.slice(index + 1).trim();
    try {
      result[name] = decodeURIComponent(raw);
    } catch {
      result[name] = raw;
    }
  }
  return result;
}

/** Serialisasi `Set-Cookie` (satu pasang nama=nilai + atribut). */
export function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  const path = options.path ?? DEFAULT_COOKIE_OPTIONS.path;
  const httpOnly = options.httpOnly ?? DEFAULT_COOKIE_OPTIONS.httpOnly;
  const secure = options.secure ?? DEFAULT_COOKIE_OPTIONS.secure;
  const sameSite = options.sameSite ?? DEFAULT_COOKIE_OPTIONS.sameSite;
  parts.push(`Path=${path}`);
  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  }
  if (options.domain !== undefined) {
    parts.push(`Domain=${options.domain}`);
  }
  if (httpOnly) {
    parts.push("HttpOnly");
  }
  if (secure) {
    parts.push("Secure");
  }
  parts.push(`SameSite=${sameSite.charAt(0).toUpperCase()}${sameSite.slice(1)}`);
  return parts.join("; ");
}

/** Cookie kedaluwarsa (untuk logout) dengan atribut yang sama. */
export function expireCookie(name: string, options: CookieOptions = {}): string {
  return serializeCookie(name, "", { ...options, maxAge: 0 });
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/**
 * Tanda tangani nilai: `<nilai>.<tanda-tangan base64url>` (HMAC-SHA256).
 * Nilai boleh memuat titik (pemisah memakai titik terakhir).
 */
export async function signValue(value: string, secret: string): Promise<string> {
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(value));
  return `${value}.${toBase64Url(new Uint8Array(signature))}`;
}

/** Verifikasi nilai bertanda tangan; `null` bila tanda tangan tidak cocok/format salah. */
export async function verifyValue(
  signed: string | null | undefined,
  secret: string,
): Promise<string | null> {
  if (signed === null || signed === undefined) {
    return null;
  }
  const index = signed.lastIndexOf(".");
  if (index <= 0 || index === signed.length - 1) {
    return null;
  }
  const value = signed.slice(0, index);
  const signature = signed.slice(index + 1);
  let raw: Uint8Array<ArrayBuffer>;
  try {
    const base64 = signature.replaceAll("-", "+").replaceAll("_", "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const binary = atob(padded);
    raw = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      raw[index] = binary.charCodeAt(index);
    }
  } catch {
    return null;
  }
  const valid = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret),
    raw,
    encoder.encode(value),
  );
  return valid ? value : null;
}
