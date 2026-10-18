import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { constants, createBrotliCompress, createGzip } from "node:zlib";
import {
  type EnvReader,
  type FetchHandler,
  type Logger,
  REMOTE_ADDRESS_HEADER,
} from "@ramonyx/core";
import type { RunningServer, RuntimeHost, ServeOptions } from "./types.ts";

export interface NodeHostOptions {
  readonly env?: EnvReader;
  readonly onError?: (error: unknown) => void;
  /** Kompresi respons (brotli/gzip) saat klien mendukung. Default true. */
  readonly compression?: boolean;
  /** Ukuran minimum (byte) agar respons dikompresi bila `content-length` diketahui. Default 1024. */
  readonly compressionMinBytes?: number;
}

/** Token `accept-encoding` dengan q>0 (q=0 berarti ditolak). */
function parseAcceptEncoding(header: string | undefined): Set<string> {
  const tokens = new Set<string>();
  if (header === undefined) {
    return tokens;
  }
  for (const part of header.split(",")) {
    const [nameRaw, ...params] = part.trim().split(";");
    const name = nameRaw?.trim().toLowerCase() ?? "";
    if (name.length === 0) {
      continue;
    }
    let q = 1;
    for (const param of params) {
      const match = param.trim().match(/^q=([0-9.]+)$/);
      if (match?.[1] !== undefined) {
        q = Number(match[1]);
      }
    }
    if (q > 0) {
      tokens.add(name);
    }
  }
  return tokens;
}

const COMPRESSIBLE_TYPE =
  /^(text\/|application\/(json|javascript|xml|manifest\+json|x-ndjson)|image\/svg\+xml)/;

function isCompressibleType(contentType: string | null): boolean {
  return contentType !== null && COMPRESSIBLE_TYPE.test(contentType.toLowerCase());
}

/**
 * Normalisasi alamat klien: `::ffff:1.2.3.4` → `1.2.3.4`; loopback IPv6 `::1` → `127.0.0.1`
 * (identitas klien stabil untuk rate limit/logging, apa pun jalur IPv4/IPv6-nya).
 */
function normalizeRemoteAddress(remote: string): string {
  if (remote === "::1") {
    return "127.0.0.1";
  }
  return remote.startsWith("::ffff:") ? remote.slice("::ffff:".length) : remote;
}

async function toFetchRequest(request: IncomingMessage, origin: string): Promise<Request> {
  const method = request.method ?? "GET";
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        headers.append(name, entry);
      }
    } else {
      headers.set(name, value);
    }
  }
  const init: RequestInit & { duplex?: "half" } = { method, headers };
  if (method !== "GET" && method !== "HEAD") {
    // Body di-stream (bukan di-buffer): batas ukuran ditegakkan lapisan server dengan 413.
    init.body = Readable.toWeb(request) as unknown as BodyInit;
    init.duplex = "half";
  }

  // Alamat klien sebenarnya — ditulis SETELAH salinan header agar nilai dari klien tertimpa.
  const remote = request.socket.remoteAddress;
  if (remote !== undefined) {
    headers.set(REMOTE_ADDRESS_HEADER, normalizeRemoteAddress(remote));
  }

  return new Request(new URL(request.url ?? "/", origin), init);
}

interface WriteOptions {
  readonly method: string;
  readonly acceptEncoding: string | undefined;
  readonly compression: boolean;
  readonly compressionMinBytes: number;
}

async function writeResponse(
  target: ServerResponse,
  response: Response,
  options: WriteOptions,
): Promise<void> {
  const headers: Record<string, string | string[]> = {};
  response.headers.forEach((value, name) => {
    headers[name] = value;
  });
  const setCookies = response.headers.getSetCookie();
  if (setCookies.length > 0) {
    headers["set-cookie"] = setCookies;
  }

  // Kompresi (brotli/gzip) untuk tipe teks saat klien mendukung — dasar HTTP produksi.
  const contentType = response.headers.get("content-type");
  const compressible = isCompressibleType(contentType) && !response.headers.has("content-encoding");
  if (compressible) {
    // Selalu tandai vary agar cache tidak salah menyajikan versi terkompresi.
    const vary = response.headers.get("vary");
    headers.vary =
      vary === null || vary.length === 0 ? "accept-encoding" : `${vary}, accept-encoding`;
  }

  let compressor: "br" | "gzip" | null = null;
  if (compressible && options.compression && response.body !== null) {
    const declared = response.headers.get("content-length");
    const tooSmall = declared !== null && Number(declared) < options.compressionMinBytes;
    const accepted = parseAcceptEncoding(options.acceptEncoding);
    const supported =
      options.method.toUpperCase() !== "HEAD" && response.status !== 204 && response.status !== 304;
    if (!tooSmall && supported) {
      compressor = accepted.has("br") ? "br" : accepted.has("gzip") ? "gzip" : null;
    }
  }
  if (compressor !== null) {
    headers["content-encoding"] = compressor;
    delete headers["content-length"];
  }

  target.writeHead(response.status, headers);
  const body = response.body;
  if (body === null) {
    target.end();
    return;
  }
  // Body di-pipe sebagai aliran (chunked): backpressure + pembatalan klien via pipeline.
  // Jalur sinkron (string) tetap mengalir lewat pipeline yang sama → framing konsisten.
  // Flush per chunk (SYNC_FLUSH) agar streaming tetap progresif (SSR streaming) — rasio
  // kompresi sedikit turun, tetapi TTFB terjaga.
  const source = Readable.fromWeb(
    body as unknown as import("node:stream/web").ReadableStream<Uint8Array>,
  );
  if (compressor === "br") {
    await pipeline(
      source,
      createBrotliCompress({ flush: constants.BROTLI_OPERATION_FLUSH }),
      target,
    );
  } else if (compressor === "gzip") {
    await pipeline(source, createGzip({ flush: constants.Z_SYNC_FLUSH }), target);
  } else {
    await pipeline(source, target);
  }
}

/** Host Node.js: `node:http` → `Request`/`Response` standar web. */
export function createNodeHost(options: NodeHostOptions = {}): RuntimeHost {
  const env: EnvReader = options.env ?? { get: (name) => process.env[name] };
  const compression = options.compression ?? true;
  const compressionMinBytes = options.compressionMinBytes ?? 1024;

  return {
    name: "node",
    env,
    async serve(handler: FetchHandler, serveOptions: ServeOptions): Promise<RunningServer> {
      const server = createServer();
      server.on("request", (incoming, outgoing) => {
        void (async () => {
          try {
            const origin = `http://${incoming.headers.host ?? "localhost"}`;
            const request = await toFetchRequest(incoming, origin);
            const response = await handler(request);
            await writeResponse(outgoing, response, {
              method: request.method,
              acceptEncoding: request.headers.get("accept-encoding") ?? undefined,
              compression,
              compressionMinBytes,
            });
          } catch (error) {
            options.onError?.(error);
            if (outgoing.headersSent) {
              // Aliran sudah dimulai (streaming) — status tak bisa diubah; putuskan koneksi.
              outgoing.destroy();
            } else {
              outgoing.writeHead(500, { "content-type": "application/json" });
              outgoing.end(JSON.stringify({ error: "Internal Server Error" }));
            }
          }
        })();
      });

      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(serveOptions.port, serveOptions.host, () => {
          server.off("error", reject);
          resolve();
        });
      });

      const address = server.address();
      const port =
        typeof address === "object" && address !== null ? address.port : serveOptions.port;
      const host = serveOptions.host ?? "localhost";

      return {
        url: `http://${host}:${port}`,
        close: () =>
          new Promise<void>((resolve, reject) => {
            server.close((error) => {
              if (error) {
                reject(error);
              } else {
                resolve();
              }
            });
            server.closeIdleConnections();
          }),
      };
    },
  };
}

/** Structured log satu baris JSON (stdout untuk info/debug, stderr untuk warn/error). */
export function createConsoleLogger(): Logger {
  const write =
    (level: string, stream: (line: string) => void) =>
    (message: string, data?: Record<string, unknown>) => {
      stream(JSON.stringify({ time: new Date().toISOString(), level, message, ...data }));
    };

  return {
    debug: write("debug", (line) => console.debug(line)),
    info: write("info", (line) => console.log(line)),
    warn: write("warn", (line) => console.error(line)),
    error: write("error", (line) => console.error(line)),
  };
}
