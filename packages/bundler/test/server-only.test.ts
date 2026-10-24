import assert from "node:assert/strict";
import { test } from "node:test";
import { serverOnlyPlugin } from "../src/server-only.ts";

type ResolveHook = (
  source: string,
  importer: string | undefined,
  options: { ssr?: boolean },
) => Promise<string | null>;

test("serverOnlyPlugin: SSR memuat modul server asli, client memakai stub", async () => {
  const plugin = serverOnlyPlugin();
  const resolveId = plugin.resolveId as ResolveHook;
  const context = {
    resolve: async (source: string) => ({ id: `/app/src/${source.replace("./", "")}` }),
  };

  assert.equal(
    await resolveId.call(context as never, "./db.server.ts", "/app/src/page.tsx", { ssr: true }),
    null,
    "SSR tidak boleh di-stub",
  );
  assert.match(
    (await resolveId.call(context as never, "./db.server.ts", "/app/src/page.tsx", {
      ssr: false,
    })) ?? "",
    /ramonyx-server-stub/,
    "browser graph tetap memakai stub",
  );
});
