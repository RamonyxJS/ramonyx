import type { PageProps } from "@ramonyx/react";

import { DeployTabs } from "../components/deploy-tabs.tsx";
import { Reveal } from "../components/reveal.tsx";
import { readPublicStats } from "../machine.server.ts";

export const metadata = {
  title: "Ramonyx — full-stack TypeScript, secure by default",
  description:
    "File routing, streaming SSR, server actions, and one contract for Node, static, and edge — with an experimental Rust/V8 runtime.",
};

export async function loader() {
  const stats = readPublicStats();
  return {
    version: stats.version,
    paket: stats.packages.npm,
    adr: stats.adrs,
    testNode: stats.tests.node,
    testRust: stats.tests.rust,
  };
}

export default function Landing({
  data,
}: PageProps<{ version: string; paket: number; adr: number; testNode: number; testRust: number }>) {
  return (
    <main className="landing">
      <section className="hero">
        <div className="wrap hero-grid">
          <div>
            <p className="eyebrow">Alpha {data.version} · Node ≥ 24</p>
            <h1>
              Full-stack TypeScript.
              <br />
              <em>Secure by default.</em>
            </h1>
            <p className="sub">
              File routing, streaming SSR, server actions, and one contract for Node, static, and
              edge — with a Rust/V8 runtime on the road.
            </p>
            <div className="hero-aksi">
              <a className="tombol utama" href="docs/getting-started">
                Start in 30 seconds
              </a>
              <a className="tombol" href="docs/adr/README">
                Read the decisions
              </a>
            </div>
            <p className="hero-catatan">pnpm create ramonyx-app my-app</p>
          </div>
          <figure className="terminal" aria-label="Terminal example">
            <div className="terminal-bar">
              <i />
              <i />
              <i />
              <span>~/my-app</span>
            </div>
            <div className="terminal-isi">
              <div>
                <span className="prompt">$</span> pnpm create ramonyx-app my-app
              </div>
              <div>
                <span className="prompt">$</span> cd my-app &amp;&amp; pnpm install
              </div>
              <div>
                <span className="prompt">$</span> pnpm dev
              </div>
              <div className="komentar"># Vite (5173) → SSR (3000)</div>
              <div>
                dev: http://localhost:5173 (Vite + HMR) <span className="komentar">→</span> SSR
                http://127.0.0.1:3000
              </div>
              <div>
                <span className="prompt">$</span> <span className="cursor" />
              </div>
            </div>
          </figure>
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
            <div className="bukti-angka">{data.adr}</div>
            <div className="bukti-label">public decisions</div>
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
            <div className="bagian-nomor">01 — Rendering</div>
            <div>
              <h2>Render on the server. Hydrate with the data.</h2>
              <p className="bagian-intro">
                Loaders run next to the page module, the server embeds the payload, and the client
                hydrates without a second data request. Streaming is opt-in when you want the shell
                sooner.
              </p>
            </div>
          </div>

          <Reveal>
            <div className="narasi">
              <div className="narasi-teks">
                <h3>One module, both sides</h3>
                <p>
                  A page exports a <code>loader</code> and a React component. The loader output is
                  the hydration payload — no schema glue, no double fetch.
                </p>
                <ul className="daftar-poin">
                  <li>Streaming SSR via `app.streaming: true`</li>
                  <li>Soft navigation + prefetch on the client</li>
                  <li>Error boundaries per folder, with stable `RMX-*` codes</li>
                </ul>
              </div>
              <div className="kode-panel">
                <div className="code-head">
                  <span className="code-file">src/routes/page.tsx</span>
                  <span className="code-lang">tsx</span>
                </div>
                {/* biome-ignore lint/a11y/noNoninteractiveTabindex: <pre> dapat di-scroll → wajib fokus keyboard */}
                <pre tabIndex={0}>
                  <code>{`export async function loader() {
  return { message: "Hello from the server" };
}

export default function Home({ data }: PageProps<{ message: string }>) {
  return <h1>{data.message}</h1>;
}`}</code>
                </pre>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="bagian">
        <div className="wrap">
          <div className="bagian-kepala">
            <div className="bagian-nomor">02 — Security</div>
            <div>
              <h2>Limits before your code runs.</h2>
              <p className="bagian-intro">
                Body limits, timeouts, concurrency shedding, CSP nonces, CSRF, rate limiting, and an
                SSRF-guarded fetch ship with the framework. Defaults are safe; every limit is
                configurable.
              </p>
            </div>
          </div>

          <Reveal>
            <div className="narasi terbalik">
              <div className="narasi-teks">
                <h3>Secure by construction</h3>
                <p>
                  The server enforces a 1 MiB body limit, a 10 s timeout, and 100 concurrent
                  requests before dispatch. The build rejects <code>node:*</code> in client modules
                  and stubs <code>*.server.ts</code> imports.
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
              <div className="kode-panel">
                <div className="code-head">
                  <span className="code-file">src/routes/middleware.ts</span>
                  <span className="code-lang">ts</span>
                </div>
                {/* biome-ignore lint/a11y/noNoninteractiveTabindex: <pre> dapat di-scroll → wajib fokus keyboard */}
                <pre tabIndex={0}>
                  <code>{`export default [
  securityHeaders(),
  cspNonce(),
  rateLimit({ limit: 120, windowSeconds: 60 }),
];`}</code>
                </pre>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="bagian">
        <div className="wrap">
          <div className="bagian-kepala">
            <div className="bagian-nomor">03 — Deployment</div>
            <div>
              <h2>One contract. Three targets.</h2>
              <p className="bagian-intro">
                The same <code>src/app.ts</code> runs as a Node server, a static export, or an edge
                fetch handler. The asset map is inlined for edge builds; CI exercises the artifact
                in workerd.
              </p>
            </div>
          </div>
          <Reveal>
            <DeployTabs />
          </Reveal>
        </div>
      </section>

      <section className="bagian">
        <div className="wrap">
          <div className="bagian-kepala">
            <div className="bagian-nomor">04 — Agents</div>
            <div>
              <h2>Facts an agent can cite.</h2>
              <p className="bagian-intro">
                The machine layer publishes feature status with evidence and limitations, plus an
                MCP server over stdio. Everything is generated from public documentation only.
              </p>
            </div>
          </div>

          <Reveal>
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
              <div className="kode-panel">
                <div className="code-head">
                  <span className="code-file">Claude Code</span>
                  <span className="code-lang">bash</span>
                </div>
                {/* biome-ignore lint/a11y/noNoninteractiveTabindex: <pre> dapat di-scroll → wajib fokus keyboard */}
                <pre tabIndex={0}>
                  <code>{`claude mcp add ramonyx-docs \\
  -- npx -y @ramonyx/mcp-docs-server`}</code>
                </pre>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="bagian">
        <div className="wrap">
          <div className="bagian-kepala">
            <div className="bagian-nomor">05 — Stack</div>
            <div>
              <h2>Built with tools you already trust.</h2>
              <p className="bagian-intro">
                No proprietary compiler frontend and no runtime lock-in. The framework is
                TypeScript, ESM, and source-first.
              </p>
            </div>
          </div>
          <div className="ekosistem">
            {[
              "React 19",
              "Vite",
              "pnpm",
              "Playwright",
              "Rust + V8 (experimental)",
              "Node ≥ 24",
              "TypeScript strict",
              "npm provenance",
            ].map((item) => (
              <span key={item} className="chip">
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
