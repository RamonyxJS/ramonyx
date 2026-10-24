import { cspNonce, csrfProtection, securityHeaders } from "@ramonyx/security";
import type { Middleware } from "ramonyx";

// Root middleware applies to every page/API route (ADR-0061).
// CSRF is double-submit: GET issues a cookie, forms echo `_csrf`, JSON clients send x-csrf-token.
export default [securityHeaders(), cspNonce(), csrfProtection()] satisfies Middleware[];
