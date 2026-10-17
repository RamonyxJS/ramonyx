import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { EnvReader, FetchHandler, Logger } from "@ramonyx/core";
import type { RunningServer, RuntimeHost, ServeOptions } from "./types.ts";

export interface NodeHostOptions {
  readonly env?: EnvReader;
  readonly onError?: (error: unknown) => void;
}

async function readBody(request: IncomingMessage): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
    request.on("error", reject);
  });
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
  const body = method === "GET" || method === "HEAD" ? undefined : await readBody(request);
  return new Request(new URL(request.url ?? "/", origin), { method, headers, body });
}

async function writeResponse(target: ServerResponse, response: Response): Promise<void> {
  const headers: Record<string, string | string[]> = {};
  response.headers.forEach((value, name) => {
    headers[name] = value;
  });
  const setCookies = response.headers.getSetCookie();
  if (setCookies.length > 0) {
    headers["set-cookie"] = setCookies;
  }
  const body = new Uint8Array(await response.arrayBuffer());
  target.writeHead(response.status, headers);
  target.end(body);
}

/** Host Node.js: `node:http` → `Request`/`Response` standar web. */
export function createNodeHost(options: NodeHostOptions = {}): RuntimeHost {
  const env: EnvReader = options.env ?? { get: (name) => process.env[name] };

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
            await writeResponse(outgoing, response);
          } catch (error) {
            options.onError?.(error);
            outgoing.writeHead(500, { "content-type": "application/json" });
            outgoing.end(JSON.stringify({ error: "Internal Server Error" }));
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
