// Fixture playground subset: aplikasi NYATA di runtime Rust (ADR-0032).
//
// Komposisi seperti `apps/playground` — halaman SSR React (routing file-less: pages disusun
// langsung karena pemindai berkas `@ramonyx/compiler` memang Node-only), API JSON + POST
// tervalidasi, middleware security (headers + CSP nonce) — lalu dijalankan lewat
// `ramonyx.serveHandler` (jembatan FetchHandler) dan diuji end-to-end dengan `fetch`.
//
// Dipakai oleh runtime/crates/js-engine/tests/compat_playground.rs.

import { HttpError, route } from "@ramonyx/core";
import { createReactRenderer } from "@ramonyx/react";
import { cspNonce, securityHeaders } from "@ramonyx/security";
import { createHandler } from "@ramonyx/server";
import { createPageRoutes, RAMONYX_MOUNT_ID } from "@ramonyx/ssr";
import { createElement } from "react";

// --- Halaman (tanpa JSX; fixture .mjs) -------------------------------------------------
const Layout = ({ children }) => createElement("div", { className: "layout" }, children);
const Beranda = ({ data }) =>
  createElement(
    "main",
    null,
    createElement("h1", { id: "judul" }, "Playground subset"),
    createElement("p", { id: "kabar" }, data.kabar),
  );
const Halo = ({ params }) => createElement("h2", { id: "halo" }, `Halo ${params.nama}`);
const Gagal = () => {
  throw new HttpError(418, "Teh pot");
};
const ErrorPage = ({ error }) =>
  createElement("p", { id: "pesan" }, `Error ${error.status}: ${error.message}`);

const pages = [
  {
    path: "/",
    page: {
      default: Beranda,
      loader: () => ({ kabar: "dari loader" }),
      metadata: { title: "Beranda" },
    },
    layouts: [{ default: Layout }],
  },
  { path: "/halo/[nama]", page: { default: Halo }, layouts: [] },
  { path: "/gagal", page: { default: Gagal }, layouts: [], error: { default: ErrorPage } },
];

const bodySchema = {
  "~standard": {
    version: 1,
    vendor: "playground-subset",
    validate: (value) =>
      value !== null && typeof value === "object" && typeof value.nama === "string"
        ? { value }
        : { issues: [{ message: "nama wajib", path: ["nama"] }] },
  },
};

const app = createHandler({
  routes: [
    ...createPageRoutes({
      pages,
      renderer: createReactRenderer(),
      client: { script: "/assets/client.js" },
    }),
    {
      method: "GET",
      path: "/api/data",
      definition: route({ handler: ({ json }) => json({ dari: "api" }) }),
    },
    {
      method: "POST",
      path: "/api/echo",
      definition: route({
        body: bodySchema,
        handler: ({ body, json }) => json({ terima: body.nama }),
      }),
    },
  ],
  middleware: [securityHeaders(), cspNonce()],
});

const server = ramonyx.serveHandler(0, app);
const dasar = `http://127.0.0.1:${server.port}`;

// --- 1) Beranda: dokumen SSR + layout + payload hydration + nonce ----------------------
const beranda = await fetch(`${dasar}/`);
const html = await beranda.text();
const csp = beranda.headers.get("content-security-policy") ?? "";
const nonce = /nonce-([0-9a-f]+)/.exec(csp)?.[1];

const periksa = {
  dokumen: html.startsWith("<!doctype html>"),
  judul: html.includes("<title>Beranda</title>"),
  layout: html.includes('class="layout"'),
  komponen: html.includes("Playground subset") && html.includes("dari loader"),
  mount: html.includes(`<div id="${RAMONYX_MOUNT_ID}">`),
  payload: html.includes('id="ramonyx-payload"') && html.includes("window.__RAMONYX__"),
  client: html.includes('src="/assets/client.js"'),
  nonceKonsisten: nonce !== undefined && html.includes(`nonce="${nonce}"`),
  nosniff: beranda.headers.get("x-content-type-options") === "nosniff",
};
if (!Object.values(periksa).every(Boolean)) {
  throw new Error(`periksa halaman gagal: ${JSON.stringify(periksa)}`);
}

// --- 2) Rute dinamis -------------------------------------------------------------------
const halo = await fetch(`${dasar}/halo/budi`);
const haloHtml = await halo.text();
if (halo.status !== 200 || !haloHtml.includes("Halo budi")) {
  throw new Error(`rute dinamis salah: ${halo.status} ${haloHtml.slice(0, 200)}`);
}

// --- 3) Error page: HttpError → status + halaman error kustom --------------------------
const gagal = await fetch(`${dasar}/gagal`);
const gagalHtml = await gagal.text();
if (gagal.status !== 418 || !gagalHtml.includes("Error 418: Teh pot")) {
  throw new Error(`error page salah: ${gagal.status} ${gagalHtml.slice(0, 200)}`);
}

// --- 4) API: JSON + POST body tervalidasi ----------------------------------------------
const data = await (await fetch(`${dasar}/api/data`)).json();
const echo = await fetch(`${dasar}/api/echo`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ nama: "playground" }),
});
const echoJson = await echo.json();
const echoBad = await fetch(`${dasar}/api/echo`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ nama: 42 }),
});
await echoBad.text();
if (data.dari !== "api" || echo.status !== 200 || echoJson.terima !== "playground") {
  throw new Error(`API salah: ${JSON.stringify(data)} ${JSON.stringify(echoJson)}`);
}
if (echoBad.status !== 400) throw new Error(`validasi body salah: ${echoBad.status}`);

// --- 5) 404 untuk path tak dikenal ------------------------------------------------------
const hilang = await fetch(`${dasar}/tidak-ada`);
await hilang.text();
if (hilang.status !== 404) throw new Error(`404 salah: ${hilang.status}`);

server.close();

globalThis.__compat_playground = {
  ok: true,
  periksa,
  statuses: {
    beranda: beranda.status,
    halo: halo.status,
    gagal: gagal.status,
    echo: echo.status,
    echoBad: echoBad.status,
    hilang: hilang.status,
  },
};
