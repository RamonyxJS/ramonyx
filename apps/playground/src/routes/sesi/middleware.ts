import { csrfProtection, rateLimit } from "@ramonyx/security";
import type { Middleware } from "ramonyx";

// Auth demo: Proteksi CSRF double-submit (header untuk JS, field `_csrf` untuk form no-JS)
// dan rate limit kasar untuk endpoint login/register.
export default [
  csrfProtection({ secure: false }),
  rateLimit({ limit: 60, windowMs: 60_000 }),
] satisfies Middleware[];
