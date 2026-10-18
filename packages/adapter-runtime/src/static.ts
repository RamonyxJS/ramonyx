// Middleware aset statis untuk runtime Node (ADR-0055): ETag + 304, Cache-Control
// (immutable untuk aset ber-fingerprint), guard traversal. Bagian dari dasar HTTP produksi.

import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import type { Middleware } from "@ramonyx/core";

const CONTENT_TYPES: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".xml": "application/xml",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".wasm": "application/wasm",
  ".webmanifest": "application/manifest+json",
  ".pdf": "application/pdf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
};

export interface ServeStaticOptions {
  /** Direktori akar aset (absolut). */
  readonly dir: string;
  /** Prefix URL yang dilayani; default `/assets/`. */
  readonly prefix?: string;
  /** `true` → `cache-control: public, max-age=31536000, immutable` (aset ber-fingerprint). */
  readonly immutable?: boolean;
  /** `max-age` (detik) bila `immutable` false; default 0 → `no-cache` (revalidasi via ETag). */
  readonly maxAgeSeconds?: number;
  /** Header tambahan untuk semua respons aset. */
  readonly headers?: Readonly<Record<string, string>>;
}

function normalizePrefix(prefix: string): string {
  const withLeading = prefix.startsWith("/") ? prefix : `/${prefix}`;
  return withLeading.endsWith("/") ? withLeading : `${withLeading}/`;
}

/** Perbandingan ETag lemah (abaikan `W/`). */
function etagMatches(header: string, etag: string): boolean {
  const target = etag.replace(/^W\//, "");
  return header
    .split(",")
    .map((part) => part.trim().replace(/^W\//, ""))
    .some((candidate) => candidate === "*" || candidate === target);
}

/**
 * Melayani berkas statis dari `dir` pada `prefix` — GET/HEAD saja.
 *
 * - ETag lemah dari ukuran+waktu modifikasi; `if-none-match` cocok → **304**.
 * - `immutable: true` untuk aset ber-fingerprint (`client-<hash>.js`); selain itu `no-cache`
 *   sehingga cache revalidasi murah via 304.
 * - Path traversal ditolak (hasil resolve wajib di dalam `dir`); berkas/segmen berawalan `.`
 *   tidak dilayani. Tidak ada berkas → `next()` (rute lain tetap dicoba).
 */
export function serveStatic(options: ServeStaticOptions): Middleware {
  const prefix = normalizePrefix(options.prefix ?? "/assets");
  const cacheControl =
    options.immutable === true
      ? "public, max-age=31536000, immutable"
      : options.maxAgeSeconds !== undefined && options.maxAgeSeconds > 0
        ? `public, max-age=${Math.floor(options.maxAgeSeconds)}`
        : "no-cache";

  return async (context, next) => {
    const method = context.request.method.toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      return next();
    }

    let pathname: string;
    try {
      pathname = new URL(context.request.url).pathname;
    } catch {
      return next();
    }
    if (!pathname.startsWith(prefix)) {
      return next();
    }

    let relativePath: string;
    try {
      relativePath = decodeURIComponent(pathname.slice(prefix.length));
    } catch {
      return next();
    }
    if (
      relativePath.length === 0 ||
      relativePath.includes("\0") ||
      relativePath.split("/").some((segment) => segment.startsWith("."))
    ) {
      return next();
    }

    const filePath = resolve(options.dir, relativePath);
    if (!filePath.startsWith(options.dir + sep)) {
      return next();
    }

    let info: Awaited<ReturnType<typeof stat>>;
    try {
      info = await stat(filePath);
    } catch {
      return next();
    }
    if (!info.isFile()) {
      return next();
    }

    const etag = `W/"${info.size.toString(16)}-${Math.round(info.mtimeMs).toString(16)}"`;
    const headers: Record<string, string> = {
      "content-type": CONTENT_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream",
      "cache-control": cacheControl,
      etag,
      ...options.headers,
    };

    const ifNoneMatch = context.request.headers.get("if-none-match");
    if (ifNoneMatch !== null && etagMatches(ifNoneMatch, etag)) {
      return new Response(null, { status: 304, headers });
    }
    if (method === "HEAD") {
      return new Response(null, { status: 200, headers });
    }

    return new Response(await readFile(filePath), { headers });
  };
}
