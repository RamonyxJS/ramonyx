// Panel devtools (ADR-0077): kolektor data dev-only — rute, timing request/loader/render,
// status payload hydration, ukuran bundel/aset. Ditenagai primitif yang sudah ada
// (`AppHooks` ADR-0065 + middleware ADR-0067). **Tidak pernah aktif di produksi** — hanya
// `createDevServer` yang membuatnya.

import type { AppHooks, Middleware } from "@ramonyx/core";

export interface DevtoolsRoute {
  readonly path: string;
  readonly file?: string;
}

export interface DevtoolsAsset {
  readonly name: string;
  readonly bytes: number;
}

export interface DevtoolsRequest {
  readonly method: string;
  readonly path: string;
  status?: number;
  ms?: number;
  loaderMs?: number;
  renderMs?: number;
  cached?: boolean;
  /** `payload` = HTML memuat payload hydration; `none` = tidak; undefined = bukan HTML. */
  hydration?: "payload" | "none";
}

export interface DevtoolsSnapshot {
  readonly generatedAt: string;
  readonly routes: readonly DevtoolsRoute[];
  readonly assets: readonly DevtoolsAsset[];
  readonly requests: readonly DevtoolsRequest[];
}

export interface DevtoolsCollector {
  /** Pasang ke `createHandler`/`createPageRoutes` (gabung `mergeHooks`). */
  readonly hooks: AppHooks;
  /** Bungkus handler (paling luar) agar semua request tercatat. */
  readonly middleware: Middleware;
  setRoutes(routes: readonly DevtoolsRoute[]): void;
  setAssets(assets: readonly DevtoolsAsset[]): void;
  snapshot(): DevtoolsSnapshot;
}

const MAX_REQUESTS = 50;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Kolektor devtools. Catatan kejujuran: korelasi loader/render → request memakai
 * "request terbuka terakhir dengan path sama" (event hook tidak membawa identitas request);
 * cukup untuk dev berkonkurensi rendah, didokumentasikan sebagai aproksimasi.
 */
export function createDevtoolsCollector(): DevtoolsCollector {
  const requests: DevtoolsRequest[] = [];
  let routes: readonly DevtoolsRoute[] = [];
  let assets: readonly DevtoolsAsset[] = [];

  const catat = (request: DevtoolsRequest): void => {
    requests.push(request);
    if (requests.length > MAX_REQUESTS) {
      requests.shift();
    }
  };

  const terakhirDenganPath = (path: string): DevtoolsRequest | undefined => {
    for (let index = requests.length - 1; index >= 0; index -= 1) {
      const record = requests[index];
      if (record !== undefined && record.path === path && record.status === undefined) {
        return record;
      }
    }
    return undefined;
  };

  const middleware: Middleware = async (context, next) => {
    const mulai = performance.now();
    const record: DevtoolsRequest = {
      method: context.request.method,
      path: new URL(context.request.url).pathname,
    };
    catat(record);

    const response = await next();
    record.status = response.status;
    record.ms = round2(performance.now() - mulai);

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("text/html")) {
      try {
        const html = await response.clone().text();
        record.hydration = html.includes('id="ramonyx-payload"') ? "payload" : "none";
      } catch {
        // body tidak terbaca (streaming diputus) — biarkan undefined
      }
    }
    return response;
  };

  return {
    middleware,
    hooks: {
      onLoaderEnd: (event) => {
        const record = terakhirDenganPath(event.path);
        if (record !== undefined) {
          record.loaderMs = round2(event.durationMs);
          record.cached = event.cached;
        }
      },
      onRenderEnd: (event) => {
        const record = terakhirDenganPath(event.path);
        if (record !== undefined) {
          record.renderMs = round2(event.durationMs);
        }
      },
    },
    setRoutes(next) {
      routes = [...next];
    },
    setAssets(next) {
      assets = [...next];
    },
    snapshot() {
      return {
        generatedAt: new Date().toISOString(),
        routes,
        assets,
        requests: [...requests].reverse(),
      };
    },
  };
}

/** Halaman panel (HTML mandiri, tanpa build) — polling `/__ramonyx/data`. */
export function devtoolsPanelHtml(): string {
  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Ramonyx Devtools</title>
<style>
  :root { --bg:#0f1115; --fg:#e6e8ee; --redup:#9aa2b1; --aksen:#7cc4ff; --garis:#262b36; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font:14px/1.5 ui-sans-serif, system-ui, sans-serif; }
  .shell { max-width: 1100px; margin: 0 auto; padding: 20px; }
  h1 { font-size: 20px; margin: 0 0 4px; } h2 { font-size: 14px; color: var(--redup); text-transform: uppercase; letter-spacing: .08em; margin: 24px 0 8px; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th, td { border: 1px solid var(--garis); padding: 5px 8px; text-align: left; }
  th { color: var(--redup); font-weight: 500; }
  code { font-family: ui-monospace, monospace; color: var(--aksen); }
  .ok { color: #7ddc9a; } .bad { color: #ff8080; } .dim { color: var(--redup); }
</style>
</head>
<body>
<div class="shell">
  <h1>Ramonyx Devtools <span class="dim">(dev-only)</span></h1>
  <p class="dim">Data dari <code>/__ramonyx/data</code> — rute, timing request/loader/render, hydration, ukuran bundel. Diperbarui tiap 2 dtk.</p>
  <h2>Bundel & aset</h2>
  <table id="aset"><thead><tr><th>Nama</th><th>Ukuran</th></tr></thead><tbody></tbody></table>
  <h2>Rute</h2>
  <table id="rute"><thead><tr><th>Path</th><th>Berkas</th></tr></thead><tbody></tbody></table>
  <h2>Request terakhir</h2>
  <table id="req"><thead><tr><th>Method</th><th>Path</th><th>Status</th><th>Total</th><th>Loader</th><th>Render</th><th>Cache</th><th>Hydration</th></tr></thead><tbody></tbody></table>
</div>
<script>
const fmt = (n) => (typeof n === "number" ? n + " ms" : "–");
const kb = (n) => (n / 1024).toFixed(1) + " KB";
async function segarkan() {
  try {
    const data = await (await fetch("/__ramonyx/data", { cache: "no-store" })).json();
    document.querySelector("#aset tbody").innerHTML = data.assets
      .map((a) => "<tr><td><code>" + a.name + "</code></td><td>" + kb(a.bytes) + "</td></tr>")
      .join("");
    document.querySelector("#rute tbody").innerHTML = data.routes
      .map((r) => "<tr><td><code>" + r.path + "</code></td><td class='dim'>" + (r.file ?? "–") + "</td></tr>")
      .join("");
    document.querySelector("#req tbody").innerHTML = data.requests
      .map((r) => "<tr><td>" + r.method + "</td><td><code>" + r.path + "</code></td><td class='" + ((r.status ?? 0) >= 400 ? "bad" : "ok") + "'>" + (r.status ?? "…") + "</td><td>" + fmt(r.ms) + "</td><td>" + fmt(r.loaderMs) + "</td><td>" + fmt(r.renderMs) + "</td><td>" + (r.cached === true ? "hit" : r.cached === false ? "miss" : "–") + "</td><td>" + (r.hydration === "payload" ? "payload ✓" : r.hydration === "none" ? "tidak" : "–") + "</td></tr>")
      .join("");
  } catch (error) {
    console.error("devtools: gagal memuat data", error);
  }
}
segarkan();
setInterval(segarkan, 2000);
</script>
</body>
</html>
`;
}
