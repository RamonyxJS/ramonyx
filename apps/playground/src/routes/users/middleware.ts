import type { Middleware } from "ramonyx";

/** Middleware per-folder untuk halaman/API di `/users/**` (ADR-0061). */
export default [
  async (context, next) => {
    const response = await next();
    const headers = new Headers(response.headers);
    headers.set("x-area", "users");
    return new Response(response.body, { status: response.status, headers });
  },
] satisfies Middleware[];
