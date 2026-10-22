// Password hashing (PBKDF2-HMAC-SHA256, Web Crypto) — edge-safe, tanpa dependensi Node.
// Format: `pbkdf2-sha256$<iterations>$<salt-base64url>$<hash-base64url>`.

import { timingSafeEqual } from "./random.ts";

const encoder = new TextEncoder();
const DEFAULT_ITERATIONS = 210_000;
const DEFAULT_SALT_BYTES = 16;
const HASH_BYTES = 32;
const ALGORITHM = "pbkdf2-sha256";

export interface PasswordHashOptions {
  /** Iterasi PBKDF2; default 210.000. */
  readonly iterations?: number;
  /** Panjang salt; default 16 byte. */
  readonly saltBytes?: number;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
  try {
    const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = new Uint8Array(new ArrayBuffer(binary.length));
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

async function derive(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    HASH_BYTES * 8,
  );
  return new Uint8Array(bits);
}

/** Hash password dengan salt acak; hasilnya dapat disimpan di database. */
export async function hashPassword(
  password: string,
  options: PasswordHashOptions = {},
): Promise<string> {
  const iterations = options.iterations ?? DEFAULT_ITERATIONS;
  const saltBytes = options.saltBytes ?? DEFAULT_SALT_BYTES;
  if (!Number.isInteger(iterations) || iterations < 1) {
    throw new Error("iterations harus bilangan bulat >= 1");
  }
  if (!Number.isInteger(saltBytes) || saltBytes < 8) {
    throw new Error("saltBytes minimal 8");
  }
  const salt = new Uint8Array(saltBytes);
  crypto.getRandomValues(salt);
  const hash = await derive(password, salt, iterations);
  return `${ALGORITHM}$${iterations}$${toBase64Url(salt)}$${toBase64Url(hash)}`;
}

/** Verifikasi password terhadap hash tersimpan; malformed hash selalu false. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== ALGORITHM) {
    return false;
  }
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1) {
    return false;
  }
  const salt = fromBase64Url(parts[2] ?? "");
  const expected = parts[3] ?? "";
  if (salt === null || expected.length === 0) {
    return false;
  }
  try {
    const actual = toBase64Url(await derive(password, salt, iterations));
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
