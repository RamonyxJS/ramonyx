// Data & mutasi landing — edge-safe (tanpa `node:*`), dipakai SSR Node dan Cloudflare Worker.
import type { EnvReader } from "@ramonyx/core";

export interface WaitlistStore {
  put(key: string, value: string, options?: { readonly expirationTtl?: number }): Promise<void>;
}

export interface WaitlistResult {
  readonly ok: boolean;
  readonly errors?: Readonly<Record<string, string>>;
  readonly message?: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WAITLIST_TTL_SECONDS = 60 * 60 * 24 * 365;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT = 5;
const rate = new Map<string, number[]>();

/** Binding KV Workers, atau `null` bila runtime tidak menyediakannya (static/Node). */
export function waitlistStore(env: EnvReader): WaitlistStore | null {
  const raw = env.getRaw?.("WAITLIST");
  if (
    raw !== null &&
    typeof raw === "object" &&
    "put" in raw &&
    typeof (raw as { put?: unknown }).put === "function"
  ) {
    return raw as WaitlistStore;
  }
  return null;
}

export function waitlistConfigured(env: EnvReader): boolean {
  return (
    waitlistStore(env) !== null ||
    (env.get("WAITLIST_WEBHOOK_URL") ?? "").length > 0
  );
}

function clientKey(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "local"
  );
}

/** Rate limit per isolate (best-effort). Cloudflare WAF rule tetap disarankan. */
export function allowWaitlist(request: Request): boolean {
  const key = clientKey(request);
  const now = Date.now();
  const recent = (rate.get(key) ?? []).filter((at) => now - at < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    rate.set(key, recent);
    return false;
  }
  recent.push(now);
  rate.set(key, recent);
  if (rate.size > 5000) {
    for (const [id, times] of rate) {
      if (times.every((at) => now - at > RATE_WINDOW_MS)) {
        rate.delete(id);
      }
    }
  }
  return true;
}

async function emailKey(email: string): Promise<string> {
  const bytes = new TextEncoder().encode(email);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Validasi + simpan email. Tidak pernah mengembalikan email ke client. */
export async function subscribe(emailRaw: string, request: Request, env: EnvReader): Promise<WaitlistResult> {
  const email = emailRaw.trim().toLowerCase();
  if (email.length === 0 || email.length > 254 || !EMAIL.test(email)) {
    return { ok: false, errors: { email: "Enter a valid email address." } };
  }
  if (!allowWaitlist(request)) {
    return { ok: false, errors: { email: "Too many attempts. Try again in a few minutes." } };
  }

  const store = waitlistStore(env);
  const webhook = env.get("WAITLIST_WEBHOOK_URL");
  if (store === null && (webhook ?? "").length === 0) {
    return { ok: false, errors: { email: "The waitlist is not configured on this runtime." } };
  }

  const key = await emailKey(email);
  const value = JSON.stringify({ email, at: new Date().toISOString() });
  try {
    if (store !== null) {
      await store.put(`waitlist:${key}`, value, { expirationTtl: WAITLIST_TTL_SECONDS });
    } else if (webhook !== undefined) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2500);
      try {
        const response = await fetch(webhook, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: value,
          signal: controller.signal,
        });
        if (!response.ok) {
          return { ok: false, errors: { email: "Could not reach the waitlist. Try again." } };
        }
      } finally {
        clearTimeout(timer);
      }
    }
  } catch {
    return { ok: false, errors: { email: "Could not save your email. Try again." } };
  }

  return { ok: true, message: "You're on the list. Only release news, no noise." };
}

interface StarCache {
  readonly stars: number;
  readonly at: number;
}

let starsCache: StarCache | null = null;

/** GitHub stars (cache in-process 15 menit; token opsional untuk rate limit lebih tinggi). */
export async function readStars(env: EnvReader): Promise<number | null> {
  if (starsCache !== null && Date.now() - starsCache.at < 15 * 60 * 1000) {
    return starsCache.stars;
  }
  const token = env.get("GITHUB_TOKEN");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch("https://api.github.com/repos/RamonyxJS/ramonyx", {
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "ramonyx-site",
        ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      return starsCache?.stars ?? null;
    }
    const data = (await response.json()) as { stargazers_count?: unknown };
    const stars = typeof data.stargazers_count === "number" ? data.stargazers_count : null;
    if (stars !== null) {
      starsCache = { stars, at: Date.now() };
    }
    return stars;
  } catch {
    return starsCache?.stars ?? null;
  } finally {
    clearTimeout(timer);
  }
}
