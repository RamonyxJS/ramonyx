// Fixture compatibility suite: menjalankan paket framework NYATA di runtime Rust.
// Dipakai oleh runtime/crates/js-engine/tests/compat_framework.rs.
//
// Cakupan: @ramonyx/router (matching), @ramonyx/schema (validate), @ramonyx/core (route/HttpError),
// @ramonyx/server (pipeline createHandler: validasi params, output, 400/403/404).

import { HttpError, route } from "@ramonyx/core";
import { createRouteTable, matchRoute } from "@ramonyx/router";
import { validate } from "@ramonyx/schema";
import { createHandler } from "@ramonyx/server";

const digitSchema = {
  "~standard": {
    version: 1,
    vendor: "compat-fixture",
    validate: (value) =>
      typeof value === "string" && /^\d+$/.test(value)
        ? { value }
        : { issues: [{ message: "harus digit", path: [] }] },
  },
};

const paramsSchema = {
  "~standard": {
    version: 1,
    vendor: "compat-fixture",
    validate: (value) =>
      value !== null &&
      typeof value === "object" &&
      typeof value.id === "string" &&
      /^\d+$/.test(value.id)
        ? { value }
        : { issues: [{ message: "id harus digit", path: ["id"] }] },
  },
};

const outputSchema = {
  "~standard": {
    version: 1,
    vendor: "compat-fixture",
    validate: (value) =>
      value !== null && typeof value === "object" && value.ok === true
        ? { value }
        : { issues: [{ message: "ok wajib", path: [] }] },
  },
};

const bodySchema = {
  "~standard": {
    version: 1,
    vendor: "compat-fixture",
    validate: (value) =>
      value !== null && typeof value === "object" && typeof value.nama === "string"
        ? { value }
        : { issues: [{ message: "nama wajib", path: ["nama"] }] },
  },
};

// --- Router: matching statis + parameter -----------------------------------------------
const table = createRouteTable([
  { method: "GET", path: "/users/[id]", definition: { handler: () => Response.json({}) } },
  { method: "GET", path: "/tetap", definition: { handler: () => Response.json({}) } },
]);
const match = matchRoute(table, "GET", "/users/42");
if (match.kind !== "match" || match.params.id !== "42") {
  throw new Error(`router mismatch: ${JSON.stringify(match)}`);
}
const statis = matchRoute(table, "GET", "/tetap");
if (statis.kind !== "match" || statis.entry.path !== "/tetap") {
  throw new Error("router statis gagal");
}

// --- Schema: validate sukses + gagal --------------------------------------------------
const hasilOk = await validate(digitSchema, "123");
if (!hasilOk.ok || hasilOk.value !== "123") throw new Error("schema ok gagal");
const hasilGagal = await validate(digitSchema, "abc");
if (hasilGagal.ok || hasilGagal.issues[0].message !== "harus digit") {
  throw new Error("schema gagal tidak sesuai");
}

// --- Server pipeline ------------------------------------------------------------------
const handler = createHandler({
  routes: [
    {
      method: "GET",
      path: "/api/users/[id]",
      definition: route({
        params: paramsSchema,
        handler: ({ params, json }) => json({ id: params.id, dari: "runtime" }),
      }),
    },
    {
      method: "GET",
      path: "/api/output",
      definition: route({
        output: outputSchema,
        handler: ({ json }) => json({ ok: true }),
      }),
    },
    {
      method: "GET",
      path: "/api/boom",
      definition: route({
        handler: () => {
          throw new HttpError(403, "Forbidden");
        },
      }),
    },
    {
      // POST body → dibaca lewat request.body (ReadableStream) + validasi schema.
      method: "POST",
      path: "/api/echo",
      definition: route({
        body: bodySchema,
        handler: ({ body, json }) => json({ halo: body.nama }),
      }),
    },
  ],
});

const okRes = await handler(new Request("http://runtime.test/api/users/42"));
const okBody = await okRes.json();
if (okRes.status !== 200 || okBody.id !== "42" || okBody.dari !== "runtime") {
  throw new Error(`pipeline 200 gagal: ${JSON.stringify(okBody)}`);
}

const badRes = await handler(new Request("http://runtime.test/api/users/abc"));
const badBody = await badRes.json();
if (badRes.status !== 400 || badBody.error !== "Validation failed") {
  throw new Error(`validasi 400 gagal: ${badRes.status} ${JSON.stringify(badBody)}`);
}

const outputRes = await handler(new Request("http://runtime.test/api/output"));
if (outputRes.status !== 200) throw new Error(`output validasi gagal: ${outputRes.status}`);

const boomRes = await handler(new Request("http://runtime.test/api/boom"));
if (boomRes.status !== 403 || (await boomRes.json()).error !== "Forbidden") {
  throw new Error(`HttpError gagal: ${boomRes.status}`);
}

const notFound = await handler(new Request("http://runtime.test/tidak-ada"));
if (notFound.status !== 404) throw new Error(`404 gagal: ${notFound.status}`);

// POST body: dibaca dari stream + divalidasi; yang tidak valid → 400.
const echoRes = await handler(
  new Request("http://runtime.test/api/echo", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nama: "dunia" }),
  }),
);
const echoBody = await echoRes.json();
if (echoRes.status !== 200 || echoBody.halo !== "dunia") {
  throw new Error(`POST body gagal: ${echoRes.status} ${JSON.stringify(echoBody)}`);
}

const echoBad = await handler(
  new Request("http://runtime.test/api/echo", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nama: 42 }),
  }),
);
if (echoBad.status !== 400) throw new Error(`POST body invalid: ${echoBad.status}`);

globalThis.__compat = {
  ok: true,
  router: match.params.id,
  schemaOk: hasilOk.value,
  statuses: {
    ok: okRes.status,
    bad: badRes.status,
    output: outputRes.status,
    boom: boomRes.status,
    notFound: notFound.status,
    echo: echoRes.status,
    echoBad: echoBad.status,
  },
};
