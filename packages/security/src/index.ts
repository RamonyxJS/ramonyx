// Middleware keamanan yang **aman untuk edge/serverless** (Web Crypto + web standard saja).
//
// `guardedFetch` (butuh `node:dns`/`node:net`) sengaja TIDAK diekspor dari sini — pakai
// subpath `@ramonyx/security/ssrf` agar bundel edge tidak menarik API Node (ADR-0058).
export type {
  AuthTokenOptions,
  AuthTokenService,
  AuthUser,
  AuthUserPatch,
  NewAuthUser,
  UserStore,
} from "./auth.ts";
export { createAuthTokens, createKeyValueUserStore, createMemoryUserStore } from "./auth.ts";
export type {
  Authorization,
  AuthorizationGuardOptions,
  AuthorizationPolicy,
  AuthorizedActionOptions,
  AuthzSubject,
} from "./authorization.ts";
export {
  AuthorizationError,
  authorizationGuard,
  authorizedAction,
  createAuthorization,
} from "./authorization.ts";
export type { CookieOptions } from "./cookies.ts";
export {
  DEFAULT_COOKIE_OPTIONS,
  expireCookie,
  parseCookies,
  serializeCookie,
  signValue,
  verifyValue,
} from "./cookies.ts";
export type { CspNonceOptions } from "./csp.ts";
export { cspNonce, defaultContentSecurityPolicy } from "./csp.ts";
export type { CsrfOptions } from "./csrf.ts";
export { CSRF_REQUEST_HEADER, csrfProtection } from "./csrf.ts";
export type { SecurityHeadersOptions } from "./headers.ts";
export { securityHeaders } from "./headers.ts";
export type {
  OAuthAccountLinker,
  OAuthAccountLinkerOptions,
  OAuthAuthorization,
  OAuthClient,
  OAuthClientOptions,
  OAuthConfig,
  OAuthProfile,
  OAuthTokens,
} from "./oauth.ts";
export { createOAuthAccountLinker, createOAuthClient, createPkce } from "./oauth.ts";
export type { PasswordHashOptions } from "./password.ts";
export { hashPassword, verifyPassword } from "./password.ts";
export type { RateLimitOptions } from "./rate-limit.ts";
export { rateLimit } from "./rate-limit.ts";
export type {
  MemorySessionStoreOptions,
  Session,
  SessionData,
  SessionOptions,
  SessionStore,
  StoredSession,
} from "./session.ts";
export {
  createKeyValueSessionStore,
  createMemorySessionStore,
  createSession,
} from "./session.ts";
