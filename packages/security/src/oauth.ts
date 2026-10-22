// OAuth/OIDC authorization-code + PKCE client (edge-safe; fetch injectable untuk test).

import type { KeyValueStore } from "@ramonyx/core";
import type { AuthUser, UserStore } from "./auth.ts";

export interface OAuthConfig {
  readonly clientId: string;
  readonly clientSecret?: string;
  readonly authorizationEndpoint: string;
  readonly tokenEndpoint: string;
  readonly userInfoEndpoint?: string;
  readonly redirectUri: string;
  readonly scopes?: readonly string[];
}

export interface OAuthAuthorization {
  readonly url: string;
  readonly state: string;
  readonly nonce: string;
  readonly codeVerifier: string;
  readonly codeChallenge: string;
}

export interface OAuthTokens {
  readonly accessToken: string;
  readonly tokenType: string;
  readonly refreshToken?: string;
  readonly expiresIn?: number;
  readonly idToken?: string;
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface OAuthClientOptions {
  readonly fetch?: typeof fetch;
}

export interface OAuthClient {
  authorize(options?: {
    readonly state?: string;
    readonly codeVerifier?: string;
    readonly scopes?: readonly string[];
  }): Promise<OAuthAuthorization>;
  exchange(code: string, codeVerifier: string): Promise<OAuthTokens>;
  userInfo(tokens: OAuthTokens): Promise<Readonly<Record<string, unknown>>>;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export async function createPkce(): Promise<{ verifier: string; challenge: string }> {
  const verifierBytes = new Uint8Array(32);
  crypto.getRandomValues(verifierBytes);
  const verifier = base64Url(verifierBytes);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64Url(new Uint8Array(digest)) };
}

export function createOAuthClient(
  config: OAuthConfig,
  options: OAuthClientOptions = {},
): OAuthClient {
  const fetchImpl = options.fetch ?? fetch;
  return {
    async authorize(authorizeOptions = {}) {
      const pkce =
        authorizeOptions.codeVerifier === undefined
          ? await createPkce()
          : {
              verifier: authorizeOptions.codeVerifier,
              challenge: base64Url(
                new Uint8Array(
                  await crypto.subtle.digest(
                    "SHA-256",
                    new TextEncoder().encode(authorizeOptions.codeVerifier),
                  ),
                ),
              ),
            };
      const state =
        authorizeOptions.state ??
        base64Url(crypto.getRandomValues(new Uint8Array(16)) as Uint8Array);
      const nonce = base64Url(crypto.getRandomValues(new Uint8Array(16)) as Uint8Array);
      const url = new URL(config.authorizationEndpoint);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("client_id", config.clientId);
      url.searchParams.set("redirect_uri", config.redirectUri);
      url.searchParams.set("state", state);
      url.searchParams.set("nonce", nonce);
      url.searchParams.set("code_challenge", pkce.challenge);
      url.searchParams.set("code_challenge_method", "S256");
      const scopes = authorizeOptions.scopes ?? config.scopes ?? [];
      if (scopes.length > 0) {
        url.searchParams.set("scope", scopes.join(" "));
      }
      return {
        url: url.href,
        state,
        nonce,
        codeVerifier: pkce.verifier,
        codeChallenge: pkce.challenge,
      };
    },

    async exchange(code, codeVerifier) {
      const body = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        code_verifier: codeVerifier,
        redirect_uri: config.redirectUri,
        client_id: config.clientId,
      });
      if (config.clientSecret !== undefined) {
        body.set("client_secret", config.clientSecret);
      }
      const response = await fetchImpl(config.tokenEndpoint, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          accept: "application/json",
        },
        body,
      });
      const raw = (await response.json()) as Record<string, unknown>;
      if (!response.ok || typeof raw.access_token !== "string") {
        throw new Error("OAuth token exchange gagal");
      }
      return {
        accessToken: raw.access_token,
        tokenType: typeof raw.token_type === "string" ? raw.token_type : "Bearer",
        ...(typeof raw.refresh_token === "string" ? { refreshToken: raw.refresh_token } : {}),
        ...(typeof raw.expires_in === "number" ? { expiresIn: raw.expires_in } : {}),
        ...(typeof raw.id_token === "string" ? { idToken: raw.id_token } : {}),
        raw,
      };
    },

    async userInfo(tokens) {
      if (config.userInfoEndpoint === undefined) {
        throw new Error("userInfoEndpoint tidak dikonfigurasi");
      }
      const response = await fetchImpl(config.userInfoEndpoint, {
        headers: {
          authorization: `${tokens.tokenType} ${tokens.accessToken}`,
          accept: "application/json",
        },
      });
      if (!response.ok) {
        throw new Error("OAuth userinfo gagal");
      }
      const raw = (await response.json()) as unknown;
      return typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
    },
  };
}

export interface OAuthProfile {
  readonly provider: string;
  readonly subject: string;
  readonly email?: string;
  readonly emailVerified?: boolean;
  readonly username?: string;
  readonly roles?: readonly string[];
}

export interface OAuthAccountLinker {
  /** Tautkan identitas eksternal; hanya auto-link email bila provider menyatakan verified. */
  link(profile: OAuthProfile): Promise<AuthUser>;
  unlink(profile: Pick<OAuthProfile, "provider" | "subject">): Promise<boolean>;
}

export interface OAuthAccountLinkerOptions {
  readonly store: KeyValueStore;
  readonly users: UserStore;
  /** Role default untuk user baru; default `["user"]`. */
  readonly defaultRoles?: readonly string[];
}

/**
 * Account linking minimal: provider+subject dipetakan ke user id. Email hanya dipakai untuk
 * menautkan akun lama bila `emailVerified === true`; ini mencegah takeover lewat email klaim.
 */
export function createOAuthAccountLinker(options: OAuthAccountLinkerOptions): OAuthAccountLinker {
  const key = (profile: Pick<OAuthProfile, "provider" | "subject">): string =>
    `oauth-link:${profile.provider}:${profile.subject}`;
  const defaultRoles = options.defaultRoles ?? ["user"];

  const usernameBase = (profile: OAuthProfile): string => {
    const preferred = profile.username?.trim() || profile.email?.split("@")[0]?.trim();
    return (
      preferred && preferred.length > 0 ? preferred : `${profile.provider}-${profile.subject}`
    ).toLowerCase();
  };

  return {
    async link(profile) {
      const linked = await options.store.get<{ userId: string }>(key(profile));
      if (linked !== undefined) {
        const existing = await options.users.getById(linked.value.userId);
        if (existing !== null) {
          return existing;
        }
        await options.store.delete(key(profile));
      }

      let user: AuthUser | null = null;
      if (profile.email !== undefined && profile.emailVerified === true) {
        user = await options.users.getByEmail(profile.email);
      }
      if (user === null) {
        const base = usernameBase(profile);
        let lastError: unknown;
        for (let attempt = 0; attempt < 8 && user === null; attempt += 1) {
          const username = attempt === 0 ? base : `${base}-${attempt + 1}`;
          try {
            // Jangan simpan email yang belum diverifikasi; mencegah klaim email untuk takeover.
            const verifiedEmail =
              profile.email !== undefined && profile.emailVerified === true
                ? profile.email
                : undefined;
            user = await options.users.create({
              username,
              ...(verifiedEmail === undefined ? {} : { email: verifiedEmail }),
              ...(verifiedEmail === undefined ? {} : { emailVerified: true }),
              roles: profile.roles ?? defaultRoles,
            });
          } catch (error) {
            lastError = error;
          }
        }
        if (user === null) {
          throw lastError instanceof Error ? lastError : new Error("gagal membuat user OAuth");
        }
      } else if (profile.emailVerified === true && user.emailVerified !== true) {
        user = (await options.users.update(user.id, { emailVerified: true })) ?? user;
      }
      await options.store.set(key(profile), { userId: user.id });
      return user;
    },

    async unlink(profile) {
      const linkKey = key(profile);
      const linked = await options.store.get<{ userId: string }>(linkKey);
      if (linked === undefined) {
        return false;
      }
      await options.store.delete(linkKey);
      return true;
    },
  };
}
