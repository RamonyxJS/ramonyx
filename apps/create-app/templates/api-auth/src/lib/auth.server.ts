// Server-only auth demo. Replace the memory stores with a database/KV adapter before production.
import {
  type AuthUser,
  createMemorySessionStore,
  createMemoryUserStore,
  createSession,
  hashPassword,
  verifyPassword,
} from "@ramonyx/security";
import type { EnvReader } from "ramonyx";

const users = createMemoryUserStore();
// Server-side sessions make logout/revocation real. Replace with Redis/KV/DB in production.
const sessions = createMemorySessionStore();
const DEMO_USERNAME = "demo";
const DEMO_PASSWORD = "demo-password-123";
const DEV_SECRET = "dev-only-session-secret-change-me-32-chars";

let seeded: Promise<void> | undefined;

function ensureDemoUser(): Promise<void> {
  seeded ??= (async () => {
    if ((await users.getByUsername(DEMO_USERNAME)) !== null) return;
    await users.create({
      username: DEMO_USERNAME,
      passwordHash: await hashPassword(DEMO_PASSWORD),
      roles: ["user"],
    });
  })();
  return seeded;
}

function sessionSecret(env: EnvReader): string {
  const secret = env.get("SESSION_SECRET");
  if (secret !== undefined && secret.length >= 32) return secret;
  if (env.get("NODE_ENV") === "production") {
    throw new Error("SESSION_SECRET wajib diisi (minimal 32 karakter) di production");
  }
  return DEV_SECRET;
}

export function sessionFor(env: EnvReader) {
  return createSession({
    secret: sessionSecret(env),
    store: sessions,
    cookie: { secure: env.get("NODE_ENV") === "production" },
  });
}

export async function currentUser(env: EnvReader, request: Request): Promise<AuthUser | null> {
  const data = await sessionFor(env).read(request);
  const userId = typeof data?.userId === "string" ? data.userId : null;
  return userId === null ? null : users.getById(userId);
}

export type LoginResult =
  | { readonly ok: true; readonly cookie: string; readonly user: AuthUser }
  | { readonly ok: false; readonly error: string };

export async function login(env: EnvReader, formData: FormData): Promise<LoginResult> {
  await ensureDemoUser();
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const user = await users.getByUsername(username);
  if (user === null || user.passwordHash === undefined) {
    return { ok: false, error: "Invalid username or password." };
  }
  const valid = password.length > 0 && (await verifyPassword(password, user.passwordHash));
  if (!valid) {
    return { ok: false, error: "Invalid username or password." };
  }
  const cookie = await sessionFor(env).commit({
    userId: user.id,
    username: user.username,
  });
  return { ok: true, cookie, user };
}

export async function logoutCookie(env: EnvReader, request: Request): Promise<string> {
  return sessionFor(env).revoke(request);
}
