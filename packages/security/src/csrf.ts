import type { Middleware } from "@ramonyx/core";
import { randomHex, timingSafeEqual } from "./random.ts";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export interface CsrfOptions {
  /** Default "ramonyx-csrf". Sengaja bukan HttpOnly agar JS klien bisa membacanya (double-submit). */
  readonly cookieName?: string;
  /** Nama header pembawa token untuk method tidak aman (default "x-csrf-token"). */
  readonly headerName?: string;
  /** Nama field form untuk alur tanpa JS (default "_csrf"). */
  readonly fieldName?: string;
  /** Panjang token dalam byte (default 32 → 64 hex). */
  readonly tokenBytes?: number;
  /** Tambahkan atribut `Secure` pada cookie (aktifkan di produksi HTTPS). */
  readonly secure?: boolean;
  /**
   * Batas body formulir yang dipindai untuk fallback `_csrf` (default 1 MiB).
   * Header token tidak membaca body; naikkan hanya bila form no-JS memang lebih besar.
   */
  readonly maxFormBytes?: number;
}

/** Header internal berisi token aktif yang dapat dibaca loader SSR untuk field form. */
export const CSRF_REQUEST_HEADER = "x-ramonyx-csrf-token";

function readCookie(header: string | null, name: string): string | undefined {
  if (header === null) {
    return undefined;
  }
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) {
      return rest.join("=");
    }
  }
  return undefined;
}

/**
 * Proteksi CSRF pola double-submit cookie:
 * - method aman (GET/HEAD/OPTIONS): kirim cookie token bila belum ada;
 * - method tidak aman (POST/PUT/PATCH/DELETE): wajib cookie + header (`x-csrf-token`) cocok,
 *   jika tidak → 403.
 *
 * Form tanpa JS memakai field body `_csrf`; middleware membaca clone body sebelum handler.
 */
export function csrfProtection(options: CsrfOptions = {}): Middleware {
  const cookieName = options.cookieName ?? "ramonyx-csrf";
  const headerName = (options.headerName ?? "x-csrf-token").toLowerCase();
  const fieldName = options.fieldName ?? "_csrf";
  const tokenBytes = options.tokenBytes ?? 32;
  const maxFormBytes = options.maxFormBytes ?? 1_048_576;

  type FormToken = { readonly token: string; readonly tooLarge: boolean };

  const readFormToken = async (request: Request): Promise<FormToken> => {
    const type = (request.headers.get("content-type") ?? "").toLowerCase();
    if (
      !type.includes("application/x-www-form-urlencoded") &&
      !type.includes("multipart/form-data")
    ) {
      return { token: "", tooLarge: false };
    }
    const declared = request.headers.get("content-length");
    if (declared !== null) {
      const length = Number(declared);
      if (Number.isFinite(length) && length > maxFormBytes) {
        return { token: "", tooLarge: true };
      }
    }

    const body = request.clone().body;
    if (body === null) {
      return { token: "", tooLarge: false };
    }
    const reader = body.getReader();
    const chunks: ArrayBuffer[] = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value === undefined) continue;
        total += value.byteLength;
        if (total > maxFormBytes) {
          // Jangan await cancel: tee pada body streaming dapat menunggu cabang lain.
          void reader.cancel().catch(() => undefined);
          return { token: "", tooLarge: true };
        }
        chunks.push(new Uint8Array(value).buffer);
      }
      const form = await new Response(new Blob(chunks, { type })).formData();
      const value = form.get(fieldName);
      return { token: typeof value === "string" ? value : "", tooLarge: false };
    } catch {
      return { token: "", tooLarge: false };
    } finally {
      reader.releaseLock();
    }
  };

  return async (context, next) => {
    const existing = readCookie(context.request.headers.get("cookie"), cookieName);

    if (!SAFE_METHODS.has(context.request.method.toUpperCase())) {
      let supplied = context.request.headers.get(headerName) ?? "";
      if (existing === undefined || !timingSafeEqual(existing, supplied)) {
        // Progressive enhancement: form tanpa JS mengirim token di body, bukan header.
        const formToken = await readFormToken(context.request);
        if (formToken.tooLarge) {
          return new Response(JSON.stringify({ error: "Payload Too Large" }), {
            status: 413,
            headers: { "content-type": "application/json; charset=utf-8" },
          });
        }
        supplied = formToken.token;
      }
      if (existing === undefined || !timingSafeEqual(existing, supplied)) {
        return new Response(JSON.stringify({ error: "CSRF token tidak valid" }), {
          status: 403,
          headers: { "content-type": "application/json; charset=utf-8" },
        });
      }
      // Teruskan token aktif ke loader pada render ulang action (form berikutnya).
      const headers = new Headers(context.request.headers);
      headers.set(CSRF_REQUEST_HEADER, existing);
      return next(new Request(context.request, { headers }));
    }

    const token = existing ?? randomHex(tokenBytes);
    const headers = new Headers(context.request.headers);
    headers.set(CSRF_REQUEST_HEADER, token);
    const response = await next(new Request(context.request, { headers }));
    if (existing === undefined) {
      const attributes = ["Path=/", "SameSite=Lax"];
      if (options.secure === true) {
        attributes.push("Secure");
      }
      response.headers.append("set-cookie", `${cookieName}=${token}; ${attributes.join("; ")}`);
    }
    return response;
  };
}
