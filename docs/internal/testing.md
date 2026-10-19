# Testing Aplikasi

Pola yang dipakai repo ini (dan disarankan untuk aplikasi Anda): test cepat in-process untuk
handler, contract test untuk primitif, dan e2e browser untuk perilaku nyata.

## 1. Unit/integrasi handler (in-process, tanpa port)

Paket `@ramonyx/testing` menyediakan server in-process — tidak ada listener, test tidak bocor:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { createTestServerFromHandler } from "@ramonyx/testing";
import { createApp } from "../src/app.ts";

test("beranda SSR + API", async () => {
  const app = await createApp({ clientScript: "/assets/client.js" });
  const server = await createTestServerFromHandler(app);
  try {
    const home = await server.fetch("/");
    assert.equal(home.status, 200);
    assert.match(await home.text(), /Halo dari SSR/);

    const api = await server.fetch("/api/halo/dunia");
    assert.deepEqual(await api.json(), { halo: "dunia" });
  } finally {
    // WAJIB: tutup di finally — assert yang gagal tidak boleh membocorkan server
    // (`node --test` akan menggantung; pelajaran dari CI repo ini).
    await server.close();
  }
});
```

Yang layak diuji di lapisan ini: status/content-type, payload hydration (`window.__RAMONYX__`),
action POST (dengan/tanpa FormData), 404, middleware (header), cache/revalidate (dengan
`createCache()` + `createMemoryStore()`).

Jalankan test dengan loader repo (atau `ramonyx` CLI di aplikasi):

```bash
node --import @ramonyx/compiler/register --test --test-timeout=120000 "src/**/*.test.ts"
```

> Aplikasi hasil `create-ramonyx-app` memakai loader paket (`@ramonyx/compiler/register`) agar
> `.tsx`/JSX ter-transpile; di repo framework: `node --import ./tools/register.mjs`.

## 2. Contract test (primitif yang bisa diganti)

Implementasi store/cache/plugin pihak ketiga harus lolos suite kontrak yang sama — contoh di
repo: `tests/contracts/store.contract.ts` + `store.test.ts` (TTL, tag invalidation, increment).
Pola: satu file `*.contract.ts` mengekspor `runStoreContract(name, factory)`, tiap implementasi
menambah satu baris.

## 3. E2E browser (Playwright)

```ts
// playwright.config.ts
export default defineConfig({
  testDir: "e2e",
  use: { baseURL: "http://localhost:3000" },
  webServer: { command: "pnpm build && pnpm start", url: "http://localhost:3000/", timeout: 60_000 },
});
```

Pola penting dari repo:

- **Progressive enhancement**: uji juga `browser.newContext({ javaScriptEnabled: false })` —
  action form dan sesi harus tetap berfungsi tanpa JS (`apps/playground/e2e/{form,session}.spec.ts`).
- **Soft navigation/prefetch**: sentinel di `window` membuktikan halaman tidak full-reload;
  hitungan request membuktikan cache prefetch dipakai (`navigation.spec.ts`, `prefetch.spec.ts`).
- **Web Vitals**: ukur median beberapa load; jadikan report-only kecuali mesin baseline
  (protokol §8 — `benchmark-protocol.md`).

## 4. Yang TIDAK perlu diuji ulang

- Routing/parser/validasi framework (sudah diuji + fuzz di repo framework) — uji *perilaku
  aplikasi Anda*, bukan internal framework.
- Tampilan pixel-perfect; prioritaskan kontrak (status, konten kunci, header).

## 5. Contoh lengkap di repo

| Lapisan | Contoh |
| --- | --- |
| Handler + SSR + action | `apps/playground/test/app.test.ts` |
| Aset + plugin | `apps/create-app/test/create-app.test.ts` |
| Contract store | `tests/contracts/store.test.ts` |
| E2E JS + no-JS | `apps/playground/e2e/` |
| Security hardening | `tests/security/server-hardening.test.ts` |
