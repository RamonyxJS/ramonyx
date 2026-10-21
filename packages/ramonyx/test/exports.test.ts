import assert from "node:assert/strict";
import { test } from "node:test";
import { route } from "@ramonyx/core";
import { createHandler as serverCreateHandler } from "@ramonyx/server";

import * as ramonyx from "../src/index.ts";

test("meta package mengekspor kontrak publik yang didokumentasikan", () => {
  // Nilai yang disebut di docs/public/api/core-contract.md.
  const values = [
    "route",
    "createHandler",
    "HttpError",
    "defineConfig",
    "resolveConfig",
    "createCache",
    "createMemoryStore",
    "mergeHooks",
    "formDataToObject",
    "createTranslator",
    "negotiateLocale",
    "localePath",
    "parseAcceptLanguage",
  ] as const;
  for (const name of values) {
    assert.ok(name in ramonyx, `ramonyx tidak mengekspor ${name}`);
  }
  assert.equal(ramonyx.route, route);
  assert.equal(ramonyx.createHandler, serverCreateHandler);
});
