// Auth primitives: user store, one-time reset/verification tokens, and authorization.
// Edge-safe (Web Crypto + KeyValueStore); production adapters can implement UserStore.

import type { KeyValueStore } from "@ramonyx/core";
import { randomHex } from "./random.ts";

export interface AuthUser {
  readonly id: string;
  readonly username: string;
  readonly email?: string;
  readonly passwordHash?: string;
  readonly emailVerified?: boolean;
  readonly roles?: readonly string[];
}

export interface NewAuthUser {
  readonly username: string;
  readonly email?: string;
  readonly passwordHash?: string;
  readonly emailVerified?: boolean;
  readonly roles?: readonly string[];
}

export type AuthUserPatch = Partial<Omit<AuthUser, "id">>;

export interface UserStore {
  getById(id: string): Promise<AuthUser | null>;
  getByUsername(username: string): Promise<AuthUser | null>;
  getByEmail(email: string): Promise<AuthUser | null>;
  create(user: NewAuthUser): Promise<AuthUser>;
  update(id: string, patch: AuthUserPatch): Promise<AuthUser | null>;
  delete(id: string): Promise<boolean>;
}

/** Store in-memory untuk development/test; produksi gunakan database/KV. */
export function createMemoryUserStore(): UserStore {
  const users = new Map<string, AuthUser>();
  const usernames = new Map<string, string>();
  const emails = new Map<string, string>();

  const key = (value: string): string => value.trim().toLowerCase();

  return {
    async getById(id) {
      return users.get(id) ?? null;
    },
    async getByUsername(username) {
      const id = usernames.get(key(username));
      return id === undefined ? null : (users.get(id) ?? null);
    },
    async getByEmail(email) {
      const id = emails.get(key(email));
      return id === undefined ? null : (users.get(id) ?? null);
    },
    async create(input) {
      const username = key(input.username);
      if (username.length === 0) {
        throw new Error("username wajib diisi");
      }
      if (usernames.has(username)) {
        throw new Error("username sudah dipakai");
      }
      const email = input.email === undefined ? undefined : key(input.email);
      if (email !== undefined && emails.has(email)) {
        throw new Error("email sudah dipakai");
      }
      const id = randomHex(16);
      const user: AuthUser = {
        id,
        username,
        ...(email === undefined ? {} : { email }),
        ...(input.passwordHash === undefined ? {} : { passwordHash: input.passwordHash }),
        ...(input.emailVerified === undefined ? {} : { emailVerified: input.emailVerified }),
        ...(input.roles === undefined ? {} : { roles: [...input.roles] }),
      };
      users.set(id, user);
      usernames.set(username, id);
      if (email !== undefined) {
        emails.set(email, id);
      }
      return user;
    },
    async update(id, patch) {
      const current = users.get(id);
      if (current === undefined) {
        return null;
      }
      if (patch.username !== undefined) {
        const nextUsername = key(patch.username);
        const existing = usernames.get(nextUsername);
        if (nextUsername.length === 0 || (existing !== undefined && existing !== id)) {
          throw new Error("username sudah dipakai");
        }
        usernames.delete(key(current.username));
        usernames.set(nextUsername, id);
      }
      if (patch.email !== undefined) {
        const nextEmail = key(patch.email);
        const existing = emails.get(nextEmail);
        if (existing !== undefined && existing !== id) {
          throw new Error("email sudah dipakai");
        }
        if (current.email !== undefined) {
          emails.delete(key(current.email));
        }
        emails.set(nextEmail, id);
      }
      const next: AuthUser = {
        ...current,
        ...(patch.username === undefined ? {} : { username: key(patch.username) }),
        ...(patch.email === undefined ? {} : { email: key(patch.email) }),
        ...(patch.passwordHash === undefined ? {} : { passwordHash: patch.passwordHash }),
        ...(patch.emailVerified === undefined ? {} : { emailVerified: patch.emailVerified }),
        ...(patch.roles === undefined ? {} : { roles: [...patch.roles] }),
      };
      users.set(id, next);
      return next;
    },
    async delete(id) {
      const current = users.get(id);
      if (current === undefined) {
        return false;
      }
      users.delete(id);
      usernames.delete(key(current.username));
      if (current.email !== undefined) {
        emails.delete(key(current.email));
      }
      return true;
    },
  };
}

/** Adapter referensi UserStore di atas KeyValueStore (Redis/KV/cache). */
export function createKeyValueUserStore(store: KeyValueStore): UserStore {
  const userKey = (id: string): string => `auth-user:${id}`;
  const nameKey = (username: string): string => `auth-user-name:${username.trim().toLowerCase()}`;
  const emailKey = (email: string): string => `auth-user-email:${email.trim().toLowerCase()}`;

  const read = async (id: string): Promise<AuthUser | null> => {
    const entry = await store.get<AuthUser>(userKey(id));
    return entry?.value ?? null;
  };

  return {
    async getById(id) {
      return read(id);
    },
    async getByUsername(username) {
      const index = await store.get<{ userId: string }>(nameKey(username));
      return index === undefined ? null : read(index.value.userId);
    },
    async getByEmail(email) {
      const index = await store.get<{ userId: string }>(emailKey(email));
      return index === undefined ? null : read(index.value.userId);
    },
    async create(input) {
      const username = input.username.trim().toLowerCase();
      if (username.length === 0) {
        throw new Error("username wajib diisi");
      }
      if ((await store.get(nameKey(username))) !== undefined) {
        throw new Error("username sudah dipakai");
      }
      const email = input.email?.trim().toLowerCase();
      if (email !== undefined && (await store.get(emailKey(email))) !== undefined) {
        throw new Error("email sudah dipakai");
      }
      const user: AuthUser = {
        id: randomHex(16),
        username,
        ...(email === undefined ? {} : { email }),
        ...(input.passwordHash === undefined ? {} : { passwordHash: input.passwordHash }),
        ...(input.emailVerified === undefined ? {} : { emailVerified: input.emailVerified }),
        ...(input.roles === undefined ? {} : { roles: [...input.roles] }),
      };
      await store.set(userKey(user.id), user);
      await store.set(nameKey(username), { userId: user.id });
      if (email !== undefined) {
        await store.set(emailKey(email), { userId: user.id });
      }
      return user;
    },
    async update(id, patch) {
      const current = await read(id);
      if (current === null) {
        return null;
      }
      if (patch.username !== undefined) {
        const nextUsername = patch.username.trim().toLowerCase();
        const existing = await store.get<{ userId: string }>(nameKey(nextUsername));
        if (nextUsername.length === 0 || (existing !== undefined && existing.value.userId !== id)) {
          throw new Error("username sudah dipakai");
        }
        await store.delete(nameKey(current.username));
      }
      if (patch.email !== undefined) {
        const nextEmail = patch.email.trim().toLowerCase();
        const existing = await store.get<{ userId: string }>(emailKey(nextEmail));
        if (existing !== undefined && existing.value.userId !== id) {
          throw new Error("email sudah dipakai");
        }
        if (current.email !== undefined) {
          await store.delete(emailKey(current.email));
        }
      }
      const next: AuthUser = {
        ...current,
        ...(patch.username === undefined ? {} : { username: patch.username.trim().toLowerCase() }),
        ...(patch.email === undefined ? {} : { email: patch.email.trim().toLowerCase() }),
        ...(patch.passwordHash === undefined ? {} : { passwordHash: patch.passwordHash }),
        ...(patch.emailVerified === undefined ? {} : { emailVerified: patch.emailVerified }),
        ...(patch.roles === undefined ? {} : { roles: [...patch.roles] }),
      };
      await store.set(userKey(id), next);
      await store.set(nameKey(next.username), { userId: id });
      if (next.email !== undefined) {
        await store.set(emailKey(next.email), { userId: id });
      }
      return next;
    },
    async delete(id) {
      const current = await read(id);
      if (current === null) {
        return false;
      }
      await store.delete(userKey(id));
      await store.delete(nameKey(current.username));
      if (current.email !== undefined) {
        await store.delete(emailKey(current.email));
      }
      return true;
    },
  };
}

export interface AuthTokenOptions {
  /** Store bersama untuk token (TTL + one-time consume). */
  readonly store: KeyValueStore;
  /** Prefix key; default `auth-token:`. */
  readonly keyPrefix?: string;
}

export interface AuthTokenService {
  /** Buat token mentah sekali pakai; simpan hanya hash-nya. */
  issue(userId: string, purpose: string, ttlSeconds: number): Promise<string>;
  /** Konsumsi token; `null` bila tidak cocok/kedaluwarsa/sudah dipakai. */
  consume(token: string, purpose: string): Promise<string | null>;
}

function hex(bytes: Uint8Array): string {
  let result = "";
  for (const byte of bytes) {
    result += byte.toString(16).padStart(2, "0");
  }
  return result;
}

/** Token reset/verifikasi: random 32 byte, disimpan sebagai SHA-256 hash, one-time. */
export function createAuthTokens(options: AuthTokenOptions): AuthTokenService {
  const prefix = options.keyPrefix ?? "auth-token:";
  const keyFor = async (purpose: string, token: string): Promise<string> => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    return `${prefix}${purpose}:${hex(new Uint8Array(digest))}`;
  };
  return {
    async issue(userId, purpose, ttlSeconds) {
      if (ttlSeconds <= 0) {
        throw new Error("ttlSeconds harus > 0");
      }
      const token = randomHex(32);
      await options.store.set(await keyFor(purpose, token), { userId }, { ttlSeconds });
      return token;
    },
    async consume(token, purpose) {
      const key = await keyFor(purpose, token);
      const take = options.store.take?.bind(options.store);
      if (take !== undefined) {
        const value = await take<{ userId: string }>(key);
        return value === undefined ? null : value.userId;
      }
      // Fallback adapter tanpa take: best-effort, bukan atomik lintas instance.
      const entry = await options.store.get<{ userId: string }>(key);
      if (entry === undefined) {
        return null;
      }
      await options.store.delete(key);
      return entry.value.userId;
    },
  };
}
