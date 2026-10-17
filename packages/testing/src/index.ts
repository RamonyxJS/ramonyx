import { createMemoryHost } from "@ramonyx/adapter-runtime";
import { type CreateHandlerOptions, createHandler } from "@ramonyx/server";

export interface TestServer {
  readonly url: string;
  fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;
  close(): Promise<void>;
}

/**
 * Server in-memory untuk test: tidak membuka port, tidak butuh runtime sendiri.
 * `fetch` menerima path relatif (digabung dengan `url`) atau `Request` utuh.
 */
export async function createTestServer(options: CreateHandlerOptions): Promise<TestServer> {
  const host = createMemoryHost();
  const server = await host.serve(createHandler(options));

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
