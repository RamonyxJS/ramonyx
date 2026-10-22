import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
// `node:http`/`node:https`/`node:stream` diimpor **lazy** (di `pinnedFetch`) agar modul ini
// tetap dapat dimuat di runtime subset tanpa API tersebut (validasi SSRF tetap jalan;
// jalur koneksi memberi error jelas) — ADR-0031/0064.

export class SsrfError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SsrfError";
  }
}

export interface GuardedFetchOptions {
  /** Host yang diizinkan melewati pemeriksaan alamat (mis. API internal tepercaya). Cocok persis. */
  readonly allowHosts?: readonly string[];
  /** Skema yang diizinkan (default http/https). */
  readonly allowProtocols?: readonly string[];
  /**
   * Jumlah redirect yang diikuti **dengan validasi ulang tiap hop**. Default 0 = tidak mengikuti:
   * respons 3xx dikembalikan apa adanya untuk diputuskan pemanggil.
   */
  readonly maxRedirects?: number;
  /**
   * Resolver DNS kustom (untuk pengujian atau resolver internal). Default `node:dns`.
   * Hasil resolve **dipatok** (pinning) — koneksi memakai alamat yang divalidasi, bukan
   * resolve ulang oleh klien HTTP (ADR-0031/0064).
   */
  readonly dnsLookup?: (
    hostname: string,
  ) => Promise<readonly { readonly address: string; readonly family: number }[]>;
}

const DEFAULT_PROTOCOLS = ["http:", "https:"];

function isPrivateIPv4(address: string): boolean {
  const parts = address.split(".");
  if (parts.length !== 4) {
    return true;
  }
  for (const part of parts) {
    const value = Number(part);
    if (!Number.isInteger(value) || value < 0 || value > 255) {
      return true;
    }
  }
  const a1 = Number(parts[0]);
  const a2 = Number(parts[1]);
  if (a1 === 0 || a1 === 10 || a1 === 127) return true;
  if (a1 === 100 && a2 >= 64 && a2 <= 127) return true; // CGNAT
  if (a1 === 169 && a2 === 254) return true; // link-local (metadata cloud)
  if (a1 === 172 && a2 >= 16 && a2 <= 31) return true;
  if (a1 === 192 && a2 === 168) return true;
  if (a1 === 198 && (a2 === 18 || a2 === 19)) return true; // benchmark
  if (a1 >= 224) return true; // multicast + reserved
  return false;
}

function isPrivateIPv6(address: string): boolean {
  const lower = address.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (mapped?.[1] !== undefined) {
    return isPrivateIPv4(mapped[1]);
  }
  if (lower === "::" || lower === "::1") {
    return true;
  }
  const firstHextet = Number.parseInt(lower.split(":")[0] || "0", 16);
  if ((firstHextet & 0xfe00) === 0xfc00) return true; // fc00::/7 (ULA)
  if ((firstHextet & 0xffc0) === 0xfe80) return true; // fe80::/10 (link-local)
  if ((firstHextet & 0xff00) === 0xff00) return true; // ff00::/8 (multicast)
  if (lower.startsWith("2001:db8")) return true; // dokumentasi
  return false;
}

function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    return isPrivateIPv4(address);
  }
  if (family === 6) {
    return isPrivateIPv6(address);
  }
  return true; // bukan alamat valid → anggap tidak aman
}

/** Alamat hasil validasi yang akan dipatok ke koneksi (pinning). */
interface Pin {
  readonly address: string;
  readonly family: number;
}

/**
 * Validasi URL + resolve DNS; hasilnya adalah alamat yang **dipatok** untuk koneksi.
 * `null` = host diizinkan lewat `allowHosts` (tanpa pinning; host dianggap tepercaya).
 */
async function resolveAndValidate(url: URL, options: GuardedFetchOptions): Promise<Pin | null> {
  const protocols = options.allowProtocols ?? DEFAULT_PROTOCOLS;
  if (!protocols.includes(url.protocol)) {
    throw new SsrfError(`Protokol tidak diizinkan: ${url.protocol}`);
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const allowHosts = (options.allowHosts ?? []).map((host) => host.toLowerCase());
  if (allowHosts.includes(hostname.toLowerCase())) {
    return null;
  }

  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new SsrfError(`Host tidak diizinkan: ${hostname}`);
  }

  const literalFamily = isIP(hostname);
  if (literalFamily !== 0) {
    if (isPrivateAddress(hostname)) {
      throw new SsrfError(`Alamat tidak diizinkan (privat/loopback): ${hostname}`);
    }
    return { address: hostname, family: literalFamily };
  }

  let addresses: readonly { address: string; family: number }[];
  try {
    addresses =
      options.dnsLookup === undefined
        ? await dnsLookup(hostname, { all: true, verbatim: true })
        : await options.dnsLookup(hostname);
  } catch (error) {
    throw new SsrfError(`Gagal me-resolve ${hostname}`, { cause: error });
  }

  if (addresses.length === 0) {
    throw new SsrfError(`Tidak ada alamat untuk ${hostname}`);
  }
  for (const entry of addresses) {
    if (isPrivateAddress(entry.address)) {
      throw new SsrfError(
        `Host ${hostname} me-resolve ke alamat privat/loopback (${entry.address})`,
      );
    }
  }
  const first = addresses[0];
  if (first === undefined) {
    throw new SsrfError(`Tidak ada alamat untuk ${hostname}`);
  }
  return { address: first.address, family: first.family };
}

function isHttpUrl(value: string): URL | null {
  if (!/^https?:\/\//i.test(value.trim())) {
    return null;
  }
  try {
    return new URL(value.trim());
  } catch {
    return null;
  }
}

/** Validasi URL absolut di field string FormData (tanpa membaca body request asal). */
export async function validateFormDataUrls(
  formData: FormData,
  options: GuardedFetchOptions = {},
): Promise<void> {
  for (const value of formData.values()) {
    if (typeof value !== "string") {
      continue;
    }
    const url = isHttpUrl(value);
    if (url !== null) {
      await resolveAndValidate(url, options);
    }
  }
}

/**
 * Validasi URL pada request multipart/urlencoded melalui clone body (request asli tetap utuh).
 * Berguna sebelum meneruskan form ke `guardedFetch`.
 */
export async function validateRequestFormDataUrls(
  request: Request,
  options: GuardedFetchOptions = {},
): Promise<void> {
  const type = (request.headers.get("content-type") ?? "").toLowerCase();
  if (
    !type.includes("multipart/form-data") &&
    !type.includes("application/x-www-form-urlencoded")
  ) {
    return;
  }
  const formData = await request.clone().formData();
  await validateFormDataUrls(formData, options);
}

function escapePart(value: string): string {
  return value.replace(/["\r\n]/g, "_");
}

/** Serialisasi FormData ke multipart (satu kali; file dibaca per entri). */
async function formDataBody(formData: FormData): Promise<{
  readonly data: Uint8Array;
  readonly contentType: string;
}> {
  const boundary = `----Ramonyx${crypto.randomUUID().replaceAll("-", "")}`;
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  for (const [name, value] of formData.entries()) {
    if (typeof value === "string") {
      chunks.push(
        encoder.encode(
          `--${boundary}\r\nContent-Disposition: form-data; name="${escapePart(name)}"\r\n\r\n${value}\r\n`,
        ),
      );
      continue;
    }
    const filename = value.name.length > 0 ? value.name : "blob";
    chunks.push(
      encoder.encode(
        `--${boundary}\r\nContent-Disposition: form-data; name="${escapePart(name)}"; filename="${escapePart(filename)}"\r\nContent-Type: ${value.type || "application/octet-stream"}\r\n\r\n`,
      ),
    );
    chunks.push(new Uint8Array(await value.arrayBuffer()));
    chunks.push(encoder.encode("\r\n"));
  }
  chunks.push(encoder.encode(`--${boundary}--\r\n`));
  const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const data = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { data, contentType: `multipart/form-data; boundary=${boundary}` };
}

function collectHeaders(init: RequestInit): Headers {
  return new Headers(init.headers);
}

/** Body `RequestInit` → data yang bisa dikirim `node:http` (stream/string/bytes). */
async function toNodeBody(
  body: RequestInit["body"],
): Promise<
  | { kind: "none" }
  | { kind: "buffer"; data: Buffer; contentType?: string }
  | { kind: "stream"; stream: ReadableStream }
> {
  if (body === null || body === undefined) {
    return { kind: "none" };
  }
  if (typeof body === "string") {
    return { kind: "buffer", data: Buffer.from(body) };
  }
  if (body instanceof URLSearchParams) {
    return {
      kind: "buffer",
      data: Buffer.from(body.toString()),
      contentType: "application/x-www-form-urlencoded;charset=UTF-8",
    };
  }
  if (body instanceof ArrayBuffer) {
    return { kind: "buffer", data: Buffer.from(body) };
  }
  if (ArrayBuffer.isView(body)) {
    return { kind: "buffer", data: Buffer.from(body.buffer, body.byteOffset, body.byteLength) };
  }
  if (body instanceof ReadableStream) {
    return { kind: "stream", stream: body };
  }
  if (body instanceof FormData) {
    const encoded = await formDataBody(body);
    return { kind: "buffer", data: Buffer.from(encoded.data), contentType: encoded.contentType };
  }
  throw new SsrfError(
    "guardedFetch: tipe body belum didukung (gunakan string/bytes/URLSearchParams/ReadableStream/FormData).",
  );
}

/** Koneksi HTTP(S) dengan alamat terpin (`lookup` mengembalikan alamat hasil validasi). */
async function pinnedFetch(url: URL, pin: Pin | null, init: RequestInit): Promise<Response> {
  let httpRequest: typeof import("node:http").request;
  let httpsRequest: typeof import("node:https").request;
  let Readable: typeof import("node:stream").Readable;
  try {
    [{ request: httpRequest }, { request: httpsRequest }, { Readable }] = await Promise.all([
      import("node:http"),
      import("node:https"),
      import("node:stream"),
    ]);
  } catch (error) {
    throw new SsrfError(
      "guardedFetch: jalur koneksi membutuhkan builtin node:http/node:https/node:stream (runtime Node) — " +
        "validasi SSRF tetap tersedia tanpa builtin tersebut.",
      { cause: error },
    );
  }

  const body = await toNodeBody(init.body);
  return new Promise<Response>((resolve, reject) => {
    const headers = collectHeaders(init);
    if (body.kind === "buffer") {
      headers.set("content-length", String(body.data.byteLength));
      if (body.contentType !== undefined && !headers.has("content-type")) {
        headers.set("content-type", body.contentType);
      }
    }

    const isHttps = url.protocol === "https:";
    const request = (isHttps ? httpsRequest : httpRequest)(
      {
        hostname: url.hostname.replace(/^\[|\]$/g, ""),
        port: url.port.length > 0 ? Number(url.port) : isHttps ? 443 : 80,
        path: `${url.pathname}${url.search}`,
        method: (init.method ?? "GET").toUpperCase(),
        headers: Object.fromEntries(headers.entries()),
        // Pinning: DNS tidak di-resolve ulang oleh klien HTTP — koneksi ke alamat tervalidasi.
        ...(pin === null
          ? {}
          : {
              lookup: (
                _hostname: string,
                _options: unknown,
                callback: (error: null, address: string, family: number) => void,
              ) => callback(null, pin.address, pin.family),
            }),
      },
      (nodeResponse) => {
        const responseHeaders = new Headers();
        for (const [name, value] of Object.entries(nodeResponse.headers)) {
          if (value === undefined) {
            continue;
          }
          if (Array.isArray(value)) {
            for (const entry of value) {
              responseHeaders.append(name, entry);
            }
          } else {
            responseHeaders.set(name, value);
          }
        }
        const status = nodeResponse.statusCode ?? 502;
        const noBody =
          status === 204 || status === 304 || (init.method ?? "GET").toUpperCase() === "HEAD";
        const stream = noBody
          ? null
          : (Readable.toWeb(nodeResponse) as unknown as ReadableStream<Uint8Array>);
        resolve(
          new Response(stream, {
            status,
            statusText: nodeResponse.statusMessage ?? "",
            headers: responseHeaders,
          }),
        );
      },
    );

    request.on("error", reject);

    if (init.signal !== undefined && init.signal !== null) {
      const signal = init.signal;
      if (signal.aborted) {
        request.destroy();
        reject(signal.reason instanceof Error ? signal.reason : new Error("aborted"));
        return;
      }
      signal.addEventListener(
        "abort",
        () => {
          request.destroy();
          reject(signal.reason instanceof Error ? signal.reason : new Error("aborted"));
        },
        { once: true },
      );
    }

    if (body.kind === "buffer") {
      request.end(body.data);
    } else if (body.kind === "stream") {
      const nodeStream = Readable.fromWeb(body.stream as never);
      nodeStream.pipe(request);
      nodeStream.on("error", (error: Error) => request.destroy(error));
    } else {
      request.end();
    }
  });
}

/**
 * `fetch` dengan proteksi SSRF + **IP-pinning** (ADR-0031/0064): hanya http/https, alamat
 * privat/loopback/link-local ditolak, DNS di-resolve **sekali** lalu alamatnya dipatok ke
 * koneksi (koneksi tidak melakukan resolve ulang → jendela DNS-rebinding tertutup), dan
 * redirect (bila diikuti) divalidasi + dipin ulang per hop.
 *
 * Batasan: body `FormData` belum didukung (gunakan string/bytes/stream); timeout mengikuti
 * `init.signal` pemanggil.
 */
export async function guardedFetch(
  input: string | URL,
  init: RequestInit = {},
  options: GuardedFetchOptions = {},
): Promise<Response> {
  if (init.body instanceof FormData) {
    await validateFormDataUrls(init.body, options);
  }
  const maxRedirects = options.maxRedirects ?? 0;
  let current = input instanceof URL ? input : new URL(input);

  for (let hop = 0; ; hop += 1) {
    const pin = await resolveAndValidate(current, options);

    const response = await pinnedFetch(current, pin, init);

    if (maxRedirects > 0 && response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (location !== null && hop < maxRedirects) {
        current = new URL(location, current);
        continue;
      }
    }

    return response;
  }
}
