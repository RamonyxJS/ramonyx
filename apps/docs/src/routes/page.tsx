import type { PageProps } from "@ramonyx/react";

import { DeployTabs } from "../components/deploy-tabs.tsx";
import { readPublicStats } from "../machine.server.ts";

export const metadata = {
  title: "Full-stack TypeScript, secure by default",
  description:
    "File routing, streaming SSR, server actions, and one contract for Node, static, and edge — with an experimental Rust/V8 runtime.",
};

export async function loader() {
  const stats = readPublicStats();
  return {
    version: stats.version,
    paket: stats.packages.npm,
    docs: stats.docs,
    testNode: stats.tests.node,
    testRust: stats.tests.rust,
  };
}

export default function Landing({
  data,
}: PageProps<{
  version: string;
  paket: number;
  docs: number;
  testNode: number;
  testRust: number;
}>) {
  return (
    <main className="landing" id="isi">
      <section className="hero">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <p className="kicker">
              <span className="kicker-tanda" aria-hidden="true" />v{data.version} · Node ≥ 24 · MIT
            </p>
            <h1>
              Full-stack TypeScript.
              <br />
              <em>Secure by default.</em>
            </h1>
            <p className="lede">
              File routing, streaming SSR, server actions, and one contract for Node, static, and
              edge — with a Rust/V8 runtime on the road.
            </p>
            <div className="aksi-baris">
              <a className="tombol utama" href="docs/getting-started">
                Start in 30 seconds
              </a>
              <a className="tautan-panah" href="docs/ssr-hydration">
                How it works <span aria-hidden="true">→</span>
              </a>
            </div>
            <div className="install">
              <span className="install-prompt" aria-hidden="true">
                $
              </span>
              <code>pnpm create ramonyx-app my-app</code>
              <button className="copy" type="button" data-copy aria-label="Copy install command">
                Copy
              </button>
            </div>
          </div>

          <div className="hero-visual">
            <div className="terminal-bingkai">
              <figure className="terminal" aria-label="Terminal example">
                <div className="terminal-bar">
                  <i />
                  <i />
                  <i />
                  <span>~/my-app</span>
                </div>
                <div className="terminal-isi">
                  <div className="baris">
                    <span className="prompt">$</span> pnpm create ramonyx-app my-app
                  </div>
                  <div className="komentar">scaffold → my-app</div>
                  <div className="baris">
                    <span className="prompt">$</span> cd my-app &amp;&amp; pnpm dev
                  </div>
                  <div>
                    <span className="komentar">vite </span> http://localhost:5173
                  </div>
                  <div>
                    <span className="komentar">ssr&nbsp; </span> http://127.0.0.1:3000
                  </div>
                  <div className="siap">ready</div>
                  <div className="baris">
                    <span className="prompt">$</span> <span className="cursor" />
                  </div>
                </div>
              </figure>
            </div>
            <div className="penjaga">
              <span className="penjaga-label">Default limits</span>
              <span>1 MiB body</span>
              <span>10 s timeout</span>
              <span>100 concurrent</span>
            </div>
          </div>
        </div>
      </section>

      <section className="bukti" aria-label="Project facts">
        <div className="wrap bukti-grid">
          <div className="bukti-sel">
            <div className="bukti-angka">v{data.version}</div>
            <div className="bukti-label">published on npm</div>
          </div>
          <div className="bukti-sel">
            <div className="bukti-angka">{data.paket}</div>
            <div className="bukti-label">npm packages</div>
          </div>
          <div className="bukti-sel">
            <div className="bukti-angka">{data.docs}</div>
            <div className="bukti-label">documentation pages</div>
          </div>
          <div className="bukti-sel">
            <div className="bukti-angka">
              {data.testNode} · {data.testRust}
            </div>
            <div className="bukti-label">Node · Rust tests</div>
          </div>
        </div>
      </section>

      <section className="bagian">
        <div className="wrap">
          <div className="bagian-kepala">
            <div className="bagian-kicker">Rendering</div>
            <div>
              <h2>Render on the server. Hydrate with the data.</h2>
              <p className="bagian-intro">
                Loaders run next to the page module, the server embeds the payload, and the client
                hydrates without a second data request. Streaming is opt-in when you want the shell
                sooner.
              </p>
            </div>
          </div>

          <div className="narasi">
            <div className="narasi-teks">
              <h3>One module, both sides</h3>
              <p>
                A page exports a <code>loader</code> and a React component. The loader output is the
                hydration payload — no schema glue, no double fetch.
              </p>
              <ul className="daftar-poin">
                <li>
                  Streaming SSR via <code>app.streaming: true</code>
                </li>
                <li>Soft navigation + prefetch on the client</li>
                <li>
                  Error boundaries per folder, with stable <code>RMX-*</code> codes
                </li>
              </ul>
            </div>
            <figure className="kode-panel">
              <figcaption className="kode-kepala">
                <span className="kode-berkas">src/routes/page.tsx</span>
                <span className="kode-bahasa">tsx</span>
                <button className="copy" type="button" data-copy aria-label="Copy code">
                  Copy
                </button>
              </figcaption>
              {/* biome-ignore lint/a11y/noNoninteractiveTabindex: <pre> dapat di-scroll → wajib fokus keyboard */}
              <pre tabIndex={0}>
                <code>{`export async function loader() {
  return { message: "Hello from the server" };
}

export default function Home({
  data,
}: PageProps<{ message: string }>) {
  return <h1>{data.message}</h1>;
}`}</code>
              </pre>
            </figure>
          </div>
        </div>
      </section>

      <section className="bagian">
        <div className="wrap">
          <div className="bagian-kepala">
            <div className="bagian-kicker">Security</div>
            <div>
              <h2>Limits before your code runs.</h2>
              <p className="bagian-intro">
                Body limits, timeouts, concurrency shedding, CSP nonces, CSRF, rate limiting, and an
                SSRF-guarded fetch ship with the framework. Defaults are safe; every limit is
                configurable.
              </p>
            </div>
          </div>

          <div className="narasi terbalik">
            <div className="narasi-teks">
              <h3>Secure by construction</h3>
              <p>
                The server enforces a 1 MiB body limit, a 10 s timeout, and 100 concurrent requests
                before dispatch. The build rejects <code>node:*</code> in client modules and stubs{" "}
                <code>*.server.ts</code> imports.
              </p>
              <ul className="daftar-poin">
                <li>Per-request CSP nonce in the hydration payload</li>
                <li>Double-submit CSRF with Web Crypto</li>
                <li>SSRF guard with DNS pinning (no rebinding window)</li>
                <li>
                  <a href="docs/security/overview">Security overview →</a>
                </li>
              </ul>
            </div>
            <figure className="kode-panel">
              <figcaption className="kode-kepala">
                <span className="kode-berkas">src/routes/middleware.ts</span>
                <span className="kode-bahasa">ts</span>
                <button className="copy" type="button" data-copy aria-label="Copy code">
                  Copy
                </button>
              </figcaption>
              {/* biome-ignore lint/a11y/noNoninteractiveTabindex: <pre> dapat di-scroll → wajib fokus keyboard */}
              <pre tabIndex={0}>
                <code>{`export default [
  securityHeaders(),
  cspNonce(),
  rateLimit({ limit: 120, windowSeconds: 60 }),
];`}</code>
              </pre>
            </figure>
          </div>
        </div>
      </section>

      <section className="tarikan" aria-label="Design principle">
        <div className="wrap tarikan-dalam">
          <div className="bagian-kicker">Principle</div>
          <div>
            <p>“The safe path should be the default path.”</p>
            <cite>Every limit is configurable; none of them is opt-in.</cite>
          </div>
        </div>
      </section>

      <section className="bagian">
        <div className="wrap">
          <div className="bagian-kepala">
            <div className="bagian-kicker">Deployment</div>
            <div>
              <h2>One contract. Three targets.</h2>
              <p className="bagian-intro">
                The same <code>src/app.ts</code> runs as a Node server, a static export, or an edge
                fetch handler. The asset map is inlined for edge builds; CI exercises the artifact
                in workerd.
              </p>
            </div>
          </div>
          <DeployTabs />
        </div>
      </section>

      <section className="bagian bagian-gelap">
        <div className="wrap">
          <div className="bagian-kepala">
            <div className="bagian-kicker">Agents</div>
            <div>
              <h2>Facts an agent can cite.</h2>
              <p className="bagian-intro">
                The machine layer publishes feature status with evidence and limitations, plus an
                MCP server over stdio. Everything is generated from public documentation only.
              </p>
            </div>
          </div>

          <div className="narasi">
            <div className="narasi-teks">
              <h3>MCP tools, no hosting</h3>
              <p>
                <code>npx -y @ramonyx/mcp-docs-server</code> serves search, page reads, feature
                status, rules, and the public ADR index to any MCP client.
              </p>
              <ul className="daftar-poin">
                <li>llms.txt + llms-full.txt from public docs</li>
                <li>features.json with evidence and honest limitations</li>
                <li>
                  <a href="docs/for-agents">For agents →</a>
                </li>
              </ul>
            </div>
            <figure className="kode-panel">
              <figcaption className="kode-kepala">
                <span className="kode-berkas">Claude Code</span>
                <span className="kode-bahasa">bash</span>
                <button className="copy" type="button" data-copy aria-label="Copy code">
                  Copy
                </button>
              </figcaption>
              {/* biome-ignore lint/a11y/noNoninteractiveTabindex: <pre> dapat di-scroll → wajib fokus keyboard */}
              <pre tabIndex={0}>
                <code>{`claude mcp add ramonyx-docs \\
  -- npx -y @ramonyx/mcp-docs-server`}</code>
              </pre>
            </figure>
          </div>
        </div>
      </section>

      <div className="strip">
        <div className="wrap strip-dalam">
          <span className="strip-label">Built on</span>
          <span>React 19</span>
          <span>Vite</span>
          <span>pnpm</span>
          <span>Playwright</span>
          <span>Node ≥ 24</span>
          <span>TypeScript strict</span>
          <span>Rust + V8 (experimental)</span>
        </div>
      </div>
    </main>
  );
}
