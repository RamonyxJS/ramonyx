import { definePlugin, type RamonyxPlugin } from "@ramonyx/bundler";
import type { AppHooks, Middleware } from "ramonyx";

/**
 * Plugin contoh (ADR-0067): hitung kunjungan per path (dilaporkan lewat header `x-kunjungan`),
 * dan catat invalidasi cache lewat hook. Di aplikasi nyata: kirim ke analytics/log.
 */
export function kunjungan(): RamonyxPlugin {
  const hitungan = new Map<string, number>();
  return definePlugin({
    name: "kunjungan",
    middleware: () =>
      [
        async (context, next) => {
          const response = await next();
          const path = new URL(context.request.url).pathname;
          const total = (hitungan.get(path) ?? 0) + 1;
          hitungan.set(path, total);
          const headers = new Headers(response.headers);
          headers.set("x-kunjungan", String(total));
          return new Response(response.body, { status: response.status, headers });
        },
      ] satisfies Middleware[],
    hooks: () =>
      ({
        onInvalidate: (event) => {
          console.log(
            JSON.stringify({
              plugin: "kunjungan",
              event: "invalidate",
              paths: event.paths,
              tags: event.tags,
              reason: event.reason,
            }),
          );
        },
      }) satisfies AppHooks,
  });
}
