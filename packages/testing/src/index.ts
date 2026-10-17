import { createMemoryHost, type MemoryServer } from "@ramonyx/adapter-runtime";
import type { FetchHandler } from "@ramonyx/core";
import { type CreateHandlerOptions, createHandler } from "@ramonyx/server";

export interface TestServer {
  readonly url: string;
  fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;
  close(): Promise<void>;
}

function wrap(server: MemoryServer): TestServer {
  return {
    url: server.url,
    fetch(input, init) {
      const request =
        input instanceof Request ? input : new Request(new URL(String(input), server.url), init);
      return server.fetch(request);
    },
    close: () => server.close(),
  };
}

/**
 * Server in-memory dari handler siap pakai (mis. hasil `createApp`).
 * Tidak membuka port, tidak butuh runtime sendiri.
 */
export async function createTestServerFromHandler(handler: FetchHandler): Promise<TestServer> {
  const host = createMemoryHost();
  return wrap(await host.serve(handler));
}

/** Server in-memory dari manifest route + middleware (opsi `createHandler`). */
export async function createTestServer(options: CreateHandlerOptions): Promise<TestServer> {
  return createTestServerFromHandler(createHandler(options));
}
