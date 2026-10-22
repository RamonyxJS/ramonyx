import assert from "node:assert/strict";
import { test } from "node:test";

import * as adapterRuntime from "../packages/adapter-runtime/src/index.ts";
import * as bundler from "../packages/bundler/src/index.ts";
import * as compiler from "../packages/compiler/src/index.ts";
import * as core from "../packages/core/src/index.ts";
import * as devtools from "../packages/devtools/src/index.ts";
import * as mcp from "../packages/mcp-docs-server/src/index.ts";
import * as pluginImage from "../packages/plugin-image/src/index.ts";
import * as ramonyx from "../packages/ramonyx/src/index.ts";
import * as reactAssets from "../packages/react/src/assets.ts";
import * as reactClient from "../packages/react/src/client.ts";
import * as react from "../packages/react/src/index.ts";
import * as reactLink from "../packages/react/src/link.ts";
import * as router from "../packages/router/src/index.ts";
import * as routerRoutes from "../packages/router/src/routes.ts";
import * as schema from "../packages/schema/src/index.ts";
import * as security from "../packages/security/src/index.ts";
import * as ssrf from "../packages/security/src/ssrf.ts";
import * as server from "../packages/server/src/index.ts";
import * as ssr from "../packages/ssr/src/index.ts";
import * as testing from "../packages/testing/src/index.ts";

const contracts: Array<[string, Record<string, unknown>, readonly string[]]> = [
  [
    "@ramonyx/adapter-runtime",
    adapterRuntime,
    ["createConsoleLogger", "createMemoryHost", "createNodeHost", "serveStatic"],
  ],
  [
    "@ramonyx/bundler",
    bundler,
    [
      "buildClient",
      "buildEdge",
      "createDevServer",
      "createAssetResolver",
      "definePlugin",
      "loadPlugins",
      "prerenderRoutes",
      "readClientScript",
    ],
  ],
  [
    "@ramonyx/compiler",
    compiler,
    [
      "createRouteManifest",
      "loadPageRoutes",
      "generateClientEntry",
      "generateServerEntry",
      "generateRouteTypes",
      "RouteManifestError",
    ],
  ],
  [
    "@ramonyx/core",
    core,
    [
      "route",
      "HttpError",
      "defineConfig",
      "resolveConfig",
      "createCache",
      "createMemoryStore",
      "mergeHooks",
      "formDataToObject",
      "createTranslator",
      "cacheControl",
      "defer",
      "Deferred",
    ],
  ],
  ["@ramonyx/devtools", devtools, ["runCli", "loadConfigFile", "loadCreateApp"]],
  [
    "@ramonyx/mcp-docs-server",
    mcp,
    ["createDocsIndex", "createMcpServer", "runStdioServer", "resolveDocsRoot"],
  ],
  ["@ramonyx/plugin-image", pluginImage, ["imageOptimizer"]],
  [
    "ramonyx",
    ramonyx,
    ["route", "createHandler", "HttpError", "defineConfig", "resolveConfig", "defer", "Deferred"],
  ],
  ["@ramonyx/react", react, ["createReactRenderer", "Island", "defineIsland"]],
  ["@ramonyx/router", router, ["createRouteTable", "matchRoute", "fillHref"]],
  ["@ramonyx/schema", schema, ["validate"]],
  [
    "@ramonyx/security",
    security,
    [
      "securityHeaders",
      "cspNonce",
      "csrfProtection",
      "rateLimit",
      "createSession",
      "createMemorySessionStore",
      "hashPassword",
      "verifyPassword",
      "CSRF_REQUEST_HEADER",
      "signValue",
      "verifyValue",
      "parseCookies",
      "serializeCookie",
    ],
  ],
  [
    "@ramonyx/server",
    server,
    [
      "createHandler",
      "createMetrics",
      "createMetricsRoute",
      "parseQuery",
      "requestLogging",
      "traceId",
      "withMiddleware",
    ],
  ],
  [
    "@ramonyx/ssr",
    ssr,
    ["createPageRoutes", "createSeoRoutes", "defaultDocument", "sitemapXml", "robotsTxt"],
  ],
  ["@ramonyx/testing", testing, ["createTestServer", "createTestServerFromHandler"]],
];

test("semua paket mengekspor permukaan publik yang dikontrakkan", () => {
  for (const [name, module, values] of contracts) {
    for (const value of values) {
      assert.ok(value in module, `${name} tidak mengekspor ${value}`);
    }
  }
  assert.equal(typeof reactClient.enableClientNavigation, "function");
  assert.equal(typeof reactClient.hydrateAll, "function");
  assert.equal(typeof reactAssets.Image, "function");
  assert.equal(typeof reactLink.Link, "function");
  assert.equal(typeof routerRoutes.fillHref, "function");
  assert.equal(typeof ssrf.guardedFetch, "function");
  assert.equal(typeof ssrf.SsrfError, "function");
});
