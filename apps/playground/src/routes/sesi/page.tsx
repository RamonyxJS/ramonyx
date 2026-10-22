import type { PageProps } from "@ramonyx/react";
import {
  CSRF_REQUEST_HEADER,
  createMemorySessionStore,
  createSession,
  hashPassword,
  verifyPassword,
} from "@ramonyx/security";
import type { PageActionContext, PageLoaderContext } from "ramonyx";

export const metadata = { title: "Auth — Ramonyx Playground", robots: "noindex" };

// Demo lokal: store in-memory, secret tetap, cookie non-Secure untuk HTTP.
// Produksi: pakai store bersama (KV/Redis), secret dari env/binding, dan Secure default.
const sessionStore = createMemorySessionStore();
const session = createSession({
  secret: "playground-auth-secret-untuk-uji",
  cookieName: "sesi_playground",
  cookie: { secure: false },
  store: sessionStore,
});

const users = new Map<string, string>();
let seedPromise: Promise<void> | null = null;
let dummyHash = "";

async function ensureSeed(): Promise<void> {
  if (seedPromise === null) {
    seedPromise = (async () => {
      dummyHash = await hashPassword("dummy-password-tidak-dipakai");
      users.set("rina", await hashPassword("rahasia-uji"));
    })();
  }
  await seedPromise;
}

function validUsername(value: string): boolean {
  return /^[a-z0-9_-]{3,32}$/.test(value);
}

export async function loader({ request }: PageLoaderContext) {
  await ensureSeed();
  const data = await session.read(request);
  return {
    user: typeof data?.user === "string" ? data.user : null,
    csrfToken: request.headers.get(CSRF_REQUEST_HEADER) ?? "",
  };
}

export async function action({ formData, request }: PageActionContext) {
  await ensureSeed();
  const intent = String(formData.get("intent") ?? "login");

  if (intent === "logout") {
    return {
      message: "Sesi dihapus.",
      headers: { "set-cookie": await session.revoke(request) },
    };
  }

  const username = String(formData.get("username") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (intent === "register") {
    const errors: Record<string, string> = {};
    if (!validUsername(username)) {
      errors.username = "Nama pengguna 3–32 karakter: huruf kecil, angka, _ atau -.";
    } else if (users.has(username)) {
      errors.username = "Nama pengguna sudah dipakai.";
    }
    if (password.length < 8) {
      errors.password = "Kata sandi minimal 8 karakter.";
    }
    if (Object.keys(errors).length > 0) {
      return { errors, data: { username } };
    }
    users.set(username, await hashPassword(password));
    return {
      message: "Akun dibuat dan sesi dimulai.",
      headers: {
        "set-cookie": await session.rotate(request, { user: username }),
      },
    };
  }

  const stored = users.get(username);
  // Tetap verifikasi dummy untuk mengurangi perbedaan waktu user ada/tidak ada.
  const valid = await verifyPassword(password, stored ?? dummyHash);
  if (stored === undefined || !valid) {
    return {
      errors: { form: "Nama pengguna atau kata sandi salah." },
      data: { username },
    };
  }

  return {
    message: "Berhasil masuk.",
    headers: {
      "set-cookie": await session.rotate(request, { user: username }),
    },
  };
}

export default function AuthPage({
  data,
  action,
}: PageProps<{ user: string | null; csrfToken: string }>) {
  const lastUsername =
    typeof action?.data === "object" &&
    action.data !== null &&
    "username" in action.data &&
    typeof (action.data as { username?: unknown }).username === "string"
      ? (action.data as { username: string }).username
      : "";

  return (
    <section>
      <h1>Auth (session + password)</h1>
      <p data-auth-status>
        Status: {data.user === null ? "belum masuk" : `masuk sebagai ${data.user}`}
      </p>

      {data.user === null ? (
        <>
          <form method="post" data-auth-form="login">
            <h2>Masuk</h2>
            <input type="hidden" name="_csrf" value={data.csrfToken} />
            <label>
              Nama pengguna:{" "}
              <input name="username" defaultValue={lastUsername} autoComplete="username" required />
            </label>
            <label>
              Kata sandi:{" "}
              <input name="password" type="password" autoComplete="current-password" required />
            </label>
            <button type="submit" name="intent" value="login">
              Masuk
            </button>
          </form>

          <form method="post" data-auth-form="register">
            <h2>Daftar</h2>
            <input type="hidden" name="_csrf" value={data.csrfToken} />
            <label>
              Nama pengguna:{" "}
              <input name="username" defaultValue={lastUsername} autoComplete="username" required />
            </label>
            <label>
              Kata sandi:{" "}
              <input name="password" type="password" autoComplete="new-password" required />
            </label>
            <button type="submit" name="intent" value="register">
              Daftar
            </button>
          </form>
        </>
      ) : (
        <form method="post" data-auth-form="logout">
          <input type="hidden" name="_csrf" value={data.csrfToken} />
          <button type="submit" name="intent" value="logout">
            Keluar
          </button>
        </form>
      )}

      {action?.errors?.form !== undefined ? <p role="alert">{action.errors.form}</p> : null}
      {action?.errors?.username !== undefined ? <p role="alert">{action.errors.username}</p> : null}
      {action?.errors?.password !== undefined ? <p role="alert">{action.errors.password}</p> : null}
      {action?.message !== undefined ? <p role="status">{action.message}</p> : null}
    </section>
  );
}
