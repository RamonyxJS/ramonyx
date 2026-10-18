import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

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

async function assertAllowed(url: URL, options: GuardedFetchOptions): Promise<void> {
  const protocols = options.allowProtocols ?? DEFAULT_PROTOCOLS;
  if (!protocols.includes(url.protocol)) {
    throw new SsrfError(`Protokol tidak diizinkan: ${url.protocol}`);
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const allowHosts = (options.allowHosts ?? []).map((host) => host.toLowerCase());
  if (allowHosts.includes(hostname.toLowerCase())) {
    return;
  }

  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new SsrfError(`Host tidak diizinkan: ${hostname}`);
  }

  const literalFamily = isIP(hostname);
  if (literalFamily !== 0) {
    if (isPrivateAddress(hostname)) {
      throw new SsrfError(`Alamat tidak diizinkan (privat/loopback): ${hostname}`);
    }
    return;
  }

  let addresses: { address: string }[];
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
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
}

/**
 * `fetch` dengan proteksi SSRF: hanya http/https, alamat privat/loopback/link-local ditolak,
 * redirect (bila diikuti) divalidasi ulang per hop.
 *
 * Batasan yang jujur: validasi DNS dan koneksi tetap berurutan (window DNS-rebinding belum
 * dipatok ke IP hasil resolve; pinning dispatcher menyusul — lihat ADR-0015).
 */
export async function guardedFetch(
  input: string | URL,
  init: RequestInit = {},
  options: GuardedFetchOptions = {},
): Promise<Response> {
  const maxRedirects = options.maxRedirects ?? 0;
  let current = input instanceof URL ? input : new URL(input);

  for (let hop = 0; ; hop += 1) {
    await assertAllowed(current, options);

    const response = await fetch(current, { ...init, redirect: "manual" });

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
