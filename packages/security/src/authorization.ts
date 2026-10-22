// Authorization ringan: role → permission, direct permission, deny-by-default.

import type { Middleware, MiddlewareContext } from "@ramonyx/core";

export interface AuthorizationPolicy {
  /** Pemetaan role ke permission yang diberikan. */
  readonly roles: Readonly<Record<string, readonly string[]>>;
}

export interface AuthzSubject {
  readonly roles?: readonly string[];
  readonly permissions?: readonly string[];
}

export class AuthorizationError extends Error {
  readonly status = 403;
  constructor(permission: string) {
    super(`Akses ke permission "${permission}" ditolak`);
    this.name = "AuthorizationError";
  }
}

export interface Authorization {
  can(subject: AuthzSubject | null | undefined, permission: string): boolean;
  assert(subject: AuthzSubject | null | undefined, permission: string): void;
}

/** Deny-by-default; role dan permission eksplisit digabung. */
export function createAuthorization(policy: AuthorizationPolicy): Authorization {
  const allowed = (subject: AuthzSubject | null | undefined, permission: string): boolean => {
    if (subject === null || subject === undefined) {
      return false;
    }
    if (subject.permissions?.includes(permission) === true) {
      return true;
    }
    for (const role of subject.roles ?? []) {
      if (policy.roles[role]?.includes(permission) === true) {
        return true;
      }
    }
    return false;
  };
  return {
    can: allowed,
    assert(subject, permission) {
      if (!allowed(subject, permission)) {
        throw new AuthorizationError(permission);
      }
    },
  };
}

export interface AuthorizationGuardOptions {
  readonly authorization: Authorization;
  readonly permission: string;
  readonly subject: (
    context: MiddlewareContext,
  ) => AuthzSubject | null | undefined | Promise<AuthzSubject | null | undefined>;
  /** Hook audit; default log.warn tanpa PII. */
  readonly audit?: (event: {
    readonly permission: string;
    readonly path: string;
  }) => void | Promise<void>;
}

/** Guard middleware route: deny-by-default, respons 403 generik, audit log. */
export function authorizationGuard(options: AuthorizationGuardOptions): Middleware {
  return async (context, next) => {
    const subject = await options.subject(context);
    if (options.authorization.can(subject, options.permission)) {
      return next();
    }
    const path = new URL(context.request.url).pathname;
    if (options.audit !== undefined) {
      await options.audit({ permission: options.permission, path });
    } else {
      context.log.warn("authorization denied", { permission: options.permission, path });
    }
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  };
}

export interface AuthorizedActionOptions<C> {
  readonly authorization: Authorization;
  readonly permission: string;
  readonly subject: (
    context: C,
  ) => AuthzSubject | null | undefined | Promise<AuthzSubject | null | undefined>;
  readonly audit?: (event: { readonly permission: string }) => void | Promise<void>;
}

/** Bungkus action/route function agar deny-by-default sebelum handler berjalan. */
export function authorizedAction<C, R>(
  options: AuthorizedActionOptions<C>,
  action: (context: C) => R | Promise<R>,
): (context: C) => Promise<R> {
  return async (context) => {
    const subject = await options.subject(context);
    if (!options.authorization.can(subject, options.permission)) {
      await options.audit?.({ permission: options.permission });
      throw new AuthorizationError(options.permission);
    }
    return action(context);
  };
}
