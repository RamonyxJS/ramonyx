import type { EnvReader, FetchHandler } from "@ramonyx/core";
import type { RunningServer, RuntimeHost, ServeOptions } from "./types.ts";

export interface MemoryServer extends RunningServer {
  fetch(request: Request): Promise<Response>;
}

export interface MemoryHost extends RuntimeHost {
  readonly name: "memory";
  serve(handler: FetchHandler, options?: Partial<ServeOptions>): Promise<MemoryServer>;
}

export interface MemoryHostOptions {
  readonly env?: Readonly<Record<string, string>>;
  readonly url?: string;
}

/**
 * Host in-memory: tidak membuka port, request dikirim langsung ke handler.
 * Dipakai test agar framework dapat diuji tanpa server dan tanpa runtime sendiri.
 */
export function createMemoryHost(options: MemoryHostOptions = {}): MemoryHost {
  const values = options.env ?? {};
  const url = options.url ?? "http://memory.local";
  const env: EnvReader = { get: (name) => values[name] };

  return {
    name: "memory",
    env,
    async serve(handler) {
      let closed = false;
      return {
        url,
        async fetch(request) {
          if (closed) {
            throw new Error("MemoryServer sudah ditutup");
          }
          return handler(request);
        },
        async close() {
          closed = true;
        },
      };
    },
  };
}
