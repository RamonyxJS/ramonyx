import type { PageProps } from "@ramonyx/react";
import type { PageActionContext, PageLoaderContext } from "ramonyx";
import { currentUser, login } from "../lib/auth.server.ts";

export const metadata = {
  title: "__APP_NAME__ — account",
  description: "Session auth starter with a server action, protected API, and logout.",
};

export async function loader({ env, request }: PageLoaderContext) {
  const user = await currentUser(env, request);
  return { user: user === null ? null : { id: user.id, username: user.username } };
}

export async function action({ env, formData }: PageActionContext) {
  const result = await login(env, formData);
  if (!result.ok) {
    return { errors: { form: result.error } };
  }
  return { redirect: "/", headers: { "set-cookie": result.cookie } };
}

export default function Account({
  data,
  action,
}: PageProps<{ user: { id: string; username: string } | null }>) {
  return (
    <main className="rw-main">
      <section className="rw-hero">
        <div className="rw-hero-copy">
          <p className="rw-kicker">API auth starter</p>
          <h1>
            Sessions that survive a <span>server restart boundary.</span>
          </h1>
          <p className="rw-lede">
            Signed, HTTP-only session cookies, a password-verified server action, a protected API,
            and logout. The demo user store is in-memory; replace it before deploying.
          </p>

          {data.user === null ? (
            <form method="post" className="rw-form">
              <label htmlFor="username">Username</label>
              <input id="username" name="username" autoComplete="username" defaultValue="demo" />
              <label htmlFor="password">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                defaultValue="demo-password-123"
              />
              <button type="submit">Sign in</button>
            </form>
          ) : (
            <div className="rw-actions">
              <p className="rw-success" role="status">
                Signed in as <strong>{data.user.username}</strong>
              </p>
              <form method="post" action="/api/auth/logout">
                <button type="submit" className="rw-quiet">
                  Sign out
                </button>
              </form>
              <a className="rw-button" href="/api/me">
                Open /api/me
              </a>
            </div>
          )}

          {action?.errors?.form !== undefined ? (
            <p className="rw-error" role="alert">
              {action.errors.form}
            </p>
          ) : null}
        </div>

        <aside className="rw-status">
          <p className="rw-label">DEMO CREDENTIALS</p>
          <p className="rw-url">demo</p>
          <p className="rw-status-sub">demo-password-123</p>
          <p className="rw-status-sub">Set SESSION_SECRET before production.</p>
        </aside>
      </section>
    </main>
  );
}
