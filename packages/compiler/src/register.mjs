// Loader runtime aplikasi Ramonyx: pakai `node --import @ramonyx/compiler/register` pada
// skrip app (build/start/dev di template) — transform .ts/.tsx memakai esbuild.
//
// Berkas ini sengaja **JS polos** (bukan .ts): Node menolak type-stripping berkas .ts di
// `node_modules` (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING), padahal berkas ini justru
// dimuat dari `node_modules` saat aplikasi berjalan dengan Node polos (ADR-0049).

import { register } from "node:module";

register("./esbuild-hooks.mjs", import.meta.url);
