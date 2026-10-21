import { cspNonce, securityHeaders } from "@ramonyx/security";
import type { Middleware } from "ramonyx";

import { CONTEXT7_LINK, isContext7DocsPath } from "../context7.ts";

/** Header discovery untuk Context7 Ask pada semua respons docs (Node/local). */
const context7Search: Middleware = async (context, next) => {
  const response = await next();
  if (!isContext7DocsPath(new URL(context.request.url).pathname)) {
    return response;
  }
  const headers = new Headers(response.headers);
  const existing = headers.get("link");
  headers.set("link", existing === null ? CONTEXT7_LINK : `${existing}, ${CONTEXT7_LINK}`);
  return new Response(response.body, { status: response.status, headers });
};

/**
 * Middleware aplikasi (root) — otomatis untuk semua rute lewat manifest (ADR-0061).
 * Aset statis (Node-only) dipasang di `src/app.ts` sebagai middleware pre-routing.
 */
export default [securityHeaders(), cspNonce(), context7Search] satisfies Middleware[];
