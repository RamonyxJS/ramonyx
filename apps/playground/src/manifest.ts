import type { Middleware, RouteEntry } from "ramonyx";
import { GET as hello } from "./routes/api/hello.ts";
import { GET as getUser } from "./routes/api/users/[id].ts";
import middleware from "./routes/middleware.ts";

/**
 * Manifest route eksplisit untuk Phase 1.
 * File-based routing otomatis menyusul di Phase 2 (BLUEPRINT §9).
 */
export const routes: RouteEntry[] = [
  { method: "GET", path: "/api/hello", definition: hello },
  { method: "GET", path: "/api/users/[id]", definition: getUser },
];

export const appMiddleware: Middleware[] = middleware;
