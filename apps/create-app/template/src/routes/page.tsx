import type { PageProps } from "@ramonyx/react";
import { Image } from "@ramonyx/react/assets";
import type { PageActionContext } from "ramonyx";
import { useState } from "react";

import { FAVICON } from "../favicon.ts";

export const metadata = {
  title: "__APP_NAME__",
  description: "A Ramonyx app with SSR React, file routing, server actions, and secure defaults.",
  head: `<link rel="icon" href="${FAVICON}" type="image/svg+xml" />`,
};

/** Cache data loader 60 dtk (ADR-0066) — hapus atau sesuaikan bila data harus selalu segar. */
export const revalidate = 60;

export async function loader({ assets }: { assets?: { url(path: string): string | undefined } }) {
  return {
    logo: assets?.url("logo.svg"),
  };
}

/** Mutasi form: POST ke path yang sama (progressive enhancement — ADR-0057). */
export function action({ formData }: PageActionContext) {
  const nama = String(formData.get("nama") ?? "").trim();
  if (nama.length < 2) {
    return { errors: { nama: "Enter at least two characters." } };
  }
  return { message: `Hello, ${nama}!` };
}

/** Komponen interaktif: server merender 0, klik menambah setelah hydration. */
function Counter() {
  const [hitungan, setHitungan] = useState(0);
  return (
    <button type="button" className="rw-counter" onClick={() => setHitungan((nilai) => nilai + 1)}>
      Clicks: <strong>{hitungan}</strong>
    </button>
  );
}

export default function Welcome({ data, action }: PageProps<{ logo?: string }>) {
  return (
    <main className="rw-main">
      <section className="rw-hero">
        <div className="rw-hero-copy">
          <p className="rw-kicker">
            <span className="rw-dot" aria-hidden="true" />
            Development server is running
          </p>
          <h1>
            Your app is live.
            <br />
            <span>Now make it yours.</span>
          </h1>
          <p className="rw-lede">
            Ramonyx is a full-stack TypeScript framework with file routing, SSR React, server
            actions, and secure defaults. Edit one file and the browser updates; ship the same route
            tree to Node, static hosting, or the edge.
          </p>
          <div className="rw-actions">
            <a className="rw-button" href="#build">
              Start building <span aria-hidden="true">↓</span>
            </a>
            <a
              className="rw-quiet"
              href="https://ramonyx.devmoon.net/docs/getting-started"
              target="_blank"
              rel="noreferrer"
            >
              Read the docs <span aria-hidden="true">↗</span>
            </a>
          </div>
          <ul className="rw-stack" aria-label="Stack">
            <li>Node 24+</li>
            <li>React 19</li>
            <li>TypeScript</li>
            <li>Edge-ready</li>
          </ul>
        </div>

        <aside className="rw-status" aria-label="Project status">
          <div className="rw-status-head">
            <span>APP STATUS</span>
            <span className="rw-live">ready</span>
          </div>
          <p className="rw-url">localhost:5173</p>
          <p className="rw-status-sub">SSR + hydration · Vite HMR</p>
          <div className="rw-brandline">
            <Image src={data.logo} alt="__APP_NAME__ logo" width={25} height={25} />
            <span>__APP_NAME__</span>
          </div>
          <pre className="rw-tree">{`src/routes/
├─ page.tsx             /
├─ layout.tsx           shell
├─ api/halo/[nama].ts   GET /api/halo/:nama
└─ [...slug]/page.tsx   404`}</pre>
          <div className="rw-status-foot">
            <span>secure defaults on</span>
            <span>1 file changed → HMR</span>
          </div>
        </aside>
      </section>

      <section className="rw-section" id="build">
        <div className="rw-section-head">
          <span className="rw-index">01</span>
          <h2>Start here</h2>
          <p>Three small edits take this from a welcome screen to your application.</p>
        </div>
        <div className="rw-steps">
          <article className="rw-step">
            <span className="rw-step-index">01</span>
            <h3>Make this page yours</h3>
            <p>
              This route is a normal React component with a server loader. Change the copy first.
            </p>
            <code>src/routes/page.tsx</code>
          </article>
          <article className="rw-step">
            <span className="rw-step-index">02</span>
            <h3>Add a route</h3>
            <p>Create a folder and a page file. The filename becomes the URL; no route config.</p>
            <a href="https://ramonyx.devmoon.net/docs/routing">Open routing docs →</a>
          </article>
          <article className="rw-step">
            <span className="rw-step-index">03</span>
            <h3>Ship it</h3>
            <p>
              Build for Node, export static pages, or bundle the same app as an edge fetch handler.
            </p>
            <a href="https://ramonyx.devmoon.net/docs/deployment">See deploy targets →</a>
          </article>
        </div>
      </section>

      <section className="rw-section" aria-labelledby="rw-try-title">
        <div className="rw-section-head">
          <span className="rw-index">02</span>
          <h2 id="rw-try-title">Try the framework</h2>
          <p>Both examples use the real runtime: hydration and a POST action, not a mock.</p>
        </div>
        <div className="rw-demo">
          <div className="rw-demo-panel">
            <span className="rw-label">HYDRATION</span>
            <h2>Server first. Then interactive.</h2>
            <p>
              The button arrives as static HTML with zero clicks. React hydrates it in place, so the
              first click is instant and the page stays useful without JavaScript.
            </p>
            <Counter />
          </div>
          <div className="rw-demo-panel">
            <span className="rw-label">SERVER ACTION</span>
            <h2>A form without a client API.</h2>
            <p>
              This form posts to the same route. Validation and mutation run on the server, then the
              page re-renders. Disable JavaScript and it still works.
            </p>
            <form method="post" className="rw-form">
              <label htmlFor="nama">Your name</label>
              <div className="rw-form-row">
                <input id="nama" name="nama" placeholder="Rina" autoComplete="name" />
                <button type="submit">Send</button>
              </div>
            </form>
            {action?.errors?.nama !== undefined ? (
              <p className="rw-error" role="alert">
                {action.errors.nama}
              </p>
            ) : null}
            {action?.message !== undefined ? (
              <p className="rw-success" role="status">
                {action.message}
              </p>
            ) : null}
            <p className="rw-api-link">
              API route: <a href="/api/halo/dunia">/api/halo/dunia</a>
            </p>
          </div>
        </div>
      </section>

      <section className="rw-features" aria-label="Framework features">
        <article className="rw-feature">
          <h3>File routing</h3>
          <p>Folders become URLs. Layouts, error boundaries, and API methods live beside pages.</p>
        </article>
        <article className="rw-feature">
          <h3>SSR + streaming</h3>
          <p>
            Render React on the server, hydrate only what the page needs, and opt into streaming.
          </p>
        </article>
        <article className="rw-feature">
          <h3>Typed actions</h3>
          <p>Forms validate at the boundary with Standard Schema and work without JavaScript.</p>
        </article>
        <article className="rw-feature">
          <h3>Secure by default</h3>
          <p>
            CSP nonces, CSRF, safe cookies, body limits, and SSRF guards are available in the
            framework.
          </p>
        </article>
      </section>
    </main>
  );
}
