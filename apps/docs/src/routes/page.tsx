import type { PageProps } from "@ramonyx/react";
import type { PageActionContext, PageLoaderContext } from "ramonyx";
import type { ReactNode } from "react";

import { ContractDemo } from "../components/landing/contract-demo.tsx";
import { CursorGlow, Magnetic } from "../components/landing/interactions.tsx";
import { LandingNav } from "../components/landing/landing-nav.tsx";
import { LandingReveal } from "../components/landing/landing-reveal.tsx";
import { LimitsDemo } from "../components/landing/limits-demo.tsx";
import { ParticleField } from "../components/landing/particle-field.tsx";
import { RouteDemo } from "../components/landing/route-demo.tsx";
import { ScrollFx } from "../components/landing/scroll-fx.tsx";
import { LANDING_SECTIONS } from "../components/landing/sections.ts";
import { StreamDemo } from "../components/landing/stream-demo.tsx";
import { TypedTerminal } from "../components/landing/typed-terminal.tsx";
import { readStars, subscribe, waitlistConfigured } from "../landing.server.ts";
import { readPublicStats } from "../machine.server.ts";

export const metadata = {
  title: "Full-stack TypeScript, secure by default",
  description:
    "File routing, streaming SSR, server actions, and one contract for Node, static, and edge — with an experimental Rust/V8 runtime.",
  canonical: "https://ramonyx.devmoon.net/",
};

interface LandingData {
  readonly version: string;
  readonly packages: number;
  readonly docs: number;
  readonly testNode: number;
  readonly testRust: number;
  readonly stars: number | null;
  readonly waitlist: boolean;
}

export async function loader({ env }: PageLoaderContext): Promise<LandingData> {
  const stats = readPublicStats();
  const stars = await readStars(env);
  return {
    version: stats.version,
    packages: stats.packages.npm,
    docs: stats.docs,
    testNode: stats.tests.node,
    testRust: stats.tests.rust,
    stars,
    waitlist: waitlistConfigured(env),
  };
}

export async function action({ request, formData, env }: PageActionContext) {
  // Honeypot: bot mengisi field tersembunyi; jangan simpan, tetap balas sukses.
  if (String(formData.get("company") ?? "").length > 0) {
    return { message: "You're on the list. Only release news, no noise." };
  }
  const result = await subscribe(String(formData.get("email") ?? ""), request, env);
  return result.ok
    ? { message: result.message }
    : { errors: result.errors ?? { email: "Could not save your email." } };
}

const MARQUEE = [
  "File routing",
  "Streaming SSR",
  "Server actions",
  "One contract",
  "Secure by default",
  "Rust/V8 runtime",
  "For agents",
] as const;

/** Wordmark SVG: teks diregangkan ke lebar penuh (textLength) → selalu edge-to-edge, tanpa layout shift. */
function Wordmark() {
  return (
    <div className="hero-wordmark" role="img" aria-label="Ramonyx">
      <svg viewBox="0 0 1400 270" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <defs>
          <linearGradient
            id="wm-fill"
            gradientUnits="userSpaceOnUse"
            x1="0"
            y1="0"
            x2="1400"
            y2="270"
          >
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.42" stopColor="#b4c2ff" />
            <stop offset="1" stopColor="#4766ff" />
          </linearGradient>
          <linearGradient
            id="wm-shine"
            gradientUnits="userSpaceOnUse"
            x1="-500"
            y1="0"
            x2="-100"
            y2="270"
          >
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0.95" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
            <animateTransform
              attributeName="gradientTransform"
              type="translate"
              values="0 0; 2100 0; 2100 0"
              keyTimes="0; 0.28; 1"
              dur="7s"
              begin="1.6s"
              repeatCount="indefinite"
            />
          </linearGradient>
        </defs>
        <g transform="skewX(-9) translate(40 0)">
          <text className="wm-glow" x="0" y="248" textLength="1330" lengthAdjust="spacingAndGlyphs">
            RAMONYX
          </text>
          <text
            className="wm-outline"
            x="0"
            y="248"
            textLength="1330"
            lengthAdjust="spacingAndGlyphs"
          >
            RAMONYX
          </text>
          <text className="wm-fill" x="0" y="248" textLength="1330" lengthAdjust="spacingAndGlyphs">
            RAMONYX
          </text>
          <text
            className="wm-shine"
            x="0"
            y="248"
            textLength="1330"
            lengthAdjust="spacingAndGlyphs"
          >
            RAMONYX
          </text>
        </g>
      </svg>
    </div>
  );
}

function Kicker({ children }: { readonly children: ReactNode }) {
  return (
    <p className="kicker">
      <span className="kicker-tanda" aria-hidden="true" />
      {children}
    </p>
  );
}

function Points({ items }: { readonly items: readonly string[] }) {
  return (
    <ul className="chapter-points">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export default function Landing({ data, action }: PageProps<LandingData>) {
  const stars = data.stars === null ? "—" : new Intl.NumberFormat("en-US").format(data.stars);
  const emailError = action?.errors?.email;
  return (
    <main className="landing" id="isi" data-no-prefetch>
      <CursorGlow />
      <LandingReveal />
      <ScrollFx />

      <section className="hero-stage" aria-labelledby="hero-title">
        <ParticleField />
        <div className="hero-inner wrap">
          <div className="hero-meta">
            <Kicker>
              v{data.version} · Node ≥ 24 · MIT · {stars} GitHub stars
            </Kicker>
            <span className="hero-meta-note">scroll to explore</span>
          </div>
          <Wordmark />
          <div className="hero-grid">
            <div className="hero-copy">
              <h1 id="hero-title" className="hero-title">
                Full-stack TypeScript.
                <br />
                <em>Secure by default.</em>
              </h1>
              <p className="lede">
                File routing, streaming SSR, server actions, and one contract for Node, static, and
                edge — with an experimental Rust/V8 runtime in the lab.
              </p>
              <div className="hero-actions">
                <Magnetic>
                  <a className="tombol utama" href="docs/getting-started">
                    Start in 30 seconds
                  </a>
                </Magnetic>
                <a className="link-arrow" href="#routing">
                  See the stack <span aria-hidden="true">↓</span>
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
            <div className="hero-console">
              <div className="console-bar">
                <i />
                <i />
                <i />
                <span>~/my-app</span>
                <span className="console-live">live</span>
              </div>
              <pre>
                <code>
                  <span className="terminal-prompt">$</span> pnpm create ramonyx-app my-app{"\n"}
                  <span className="console-dim">scaffold → my-app</span>
                  {"\n"}
                  <span className="terminal-prompt">$</span> cd my-app && pnpm dev{"\n"}
                  <span className="console-dim">vite</span> http://localhost:5173{"\n"}
                  <span className="console-dim">ssr </span> http://127.0.0.1:3000{"\n"}
                  <span className="console-ready">ready</span>
                  {"\n"}
                  <span className="terminal-prompt">$</span> <span className="terminal-cursor" />
                </code>
              </pre>
              <div className="console-foot">
                <span>streaming</span>
                <span>1 MiB · 10 s · 100</span>
                <span>Node / static / edge</span>
              </div>
            </div>
          </div>
        </div>
        <div className="hero-scroll" aria-hidden="true">
          <span />
          scroll or press <kbd>↓</kbd>
        </div>
      </section>

      <section className="marquee" data-scrub aria-hidden="true">
        <div className="marquee-track">
          {(["a", "b"] as const).flatMap((copy) =>
            MARQUEE.map((word, index) => (
              <span key={`${copy}-${word}`} className={index % 2 === 1 ? "is-outline" : ""}>
                {word}
                <i />
              </span>
            )),
          )}
        </div>
      </section>

      <section className="stats-band" aria-label="Project facts">
        <div className="wrap stats-grid">
          <div className="stat">
            <div className="stat-value">v{data.version}</div>
            <div className="stat-label">published on npm</div>
          </div>
          <div className="stat">
            <div className="stat-value">{stars}</div>
            <div className="stat-label">GitHub stars</div>
          </div>
          <div className="stat">
            <div className="stat-value">{data.packages}</div>
            <div className="stat-label">npm packages</div>
          </div>
          <div className="stat">
            <div className="stat-value">{data.docs}</div>
            <div className="stat-label">documentation pages</div>
          </div>
          <div className="stat">
            <div className="stat-value">
              {data.testNode} · {data.testRust}
            </div>
            <div className="stat-label">Node · Rust tests</div>
          </div>
        </div>
      </section>

      <div className="story-shell wrap">
        <LandingNav sections={LANDING_SECTIONS} />
        <div className="story">
          <section id="routing" className="chapter">
            <header className="chapter-head" data-reveal data-scrub>
              <span className="chapter-num">01</span>
              <div>
                <p className="chapter-kicker">File routing</p>
                <h2 className="chapter-title">The filesystem is the router.</h2>
                <p className="chapter-intro">
                  A page is a file. A layout wraps a folder. An API route exports a method. No
                  config manifest to maintain, no route tree to drift from the code.
                </p>
              </div>
            </header>
            <div className="chapter-stage" data-reveal>
              <div className="chapter-copy">
                <Points
                  items={[
                    "Nested layouts, route groups, dynamic [param] and catch-all [...slug]",
                    "Per-folder middleware, error boundaries, and 404/405 semantics",
                    "Route manifest generated at build; typed routes from the same graph",
                  ]}
                />
                <a className="link-arrow" href="docs/routing">
                  Routing reference <span aria-hidden="true">→</span>
                </a>
              </div>
              <RouteDemo />
            </div>
          </section>

          <section id="streaming" className="chapter">
            <header className="chapter-head" data-reveal data-scrub>
              <span className="chapter-num">02</span>
              <div>
                <p className="chapter-kicker">Streaming SSR</p>
                <h2 className="chapter-title">The shell ships before the data.</h2>
                <p className="chapter-intro">
                  React renders on the server and the response is a stream. The document arrives
                  first; the client hydrates with the exact payload the loader produced.
                </p>
              </div>
            </header>
            <div className="chapter-stage chapter-stage-reverse" data-reveal>
              <StreamDemo />
              <div className="chapter-copy">
                <Points
                  items={[
                    "Opt-in streaming via renderToReadableStream — no browser build",
                    "Loader data embedded once; no second fetch after hydration",
                    "Soft navigation prefetches and swaps HTML without a full reload",
                  ]}
                />
                <a className="link-arrow" href="docs/ssr-hydration">
                  SSR & hydration <span aria-hidden="true">→</span>
                </a>
              </div>
            </div>
          </section>

          <section id="actions" className="chapter">
            <header className="chapter-head" data-reveal data-scrub>
              <span className="chapter-num">03</span>
              <div>
                <p className="chapter-kicker">Server actions</p>
                <h2 className="chapter-title">Mutations without the ceremony.</h2>
                <p className="chapter-intro">
                  A form posts to its page. The action validates at the trust boundary, mutates, and
                  the page re-renders. No JavaScript required; enhanced when available.
                </p>
              </div>
            </header>
            <div className="chapter-stage" data-reveal>
              <div className="chapter-copy">
                <Points
                  items={[
                    "Standard Schema validation before the action runs",
                    "Progressive enhancement: POST + re-render works without JS",
                    "This waitlist writes to Workers KV through the real action",
                  ]}
                />
                <div className="action-flow">
                  {["POST /", "schema", "KV", "re-render"].map((step, index) => (
                    <span key={step} className={index === 3 ? "is-on" : ""}>
                      <i />
                      {step}
                    </span>
                  ))}
                </div>
              </div>
              <div className="waitlist-panel">
                <div className="visual-code-head">
                  <span>POST /</span>
                  <span>action</span>
                </div>
                {data.waitlist ? (
                  <form method="post" className="waitlist-form" aria-label="Release waitlist">
                    <label htmlFor="waitlist-email">Email for release notes</label>
                    <div className="waitlist-row">
                      <input
                        id="waitlist-email"
                        type="email"
                        name="email"
                        autoComplete="email"
                        placeholder="you@example.com"
                        required
                      />
                      <button className="tombol utama" type="submit">
                        Join waitlist
                      </button>
                    </div>
                    <label className="hp" aria-hidden="true">
                      Company
                      <input name="company" tabIndex={-1} autoComplete="off" />
                    </label>
                    {emailError === undefined ? null : (
                      <p className="form-error" role="alert">
                        {emailError}
                      </p>
                    )}
                    {action?.message === undefined ? null : (
                      <p className="form-success" role="status">
                        {action.message}
                      </p>
                    )}
                    <p className="form-note">
                      Only release news. Stored in Workers KV; no third-party form.
                    </p>
                  </form>
                ) : (
                  <div className="waitlist-static">
                    <p>
                      The waitlist action is wired to Workers KV. This build is running without the
                      binding.
                    </p>
                    <a className="tombol" href="https://github.com/RamonyxJS/ramonyx">
                      Star on GitHub
                    </a>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section id="contract" className="chapter">
            <header className="chapter-head" data-reveal data-scrub>
              <span className="chapter-num">04</span>
              <div>
                <p className="chapter-kicker">Deployment</p>
                <h2 className="chapter-title">One contract. Three targets.</h2>
                <p className="chapter-intro">
                  The same <code>src/app.ts</code> becomes a Node server, a static export, or a
                  single edge fetch handler. The artifact changes; the app does not.
                </p>
              </div>
            </header>
            <ContractDemo />
          </section>

          <section id="security" className="chapter">
            <header className="chapter-head" data-reveal data-scrub>
              <span className="chapter-num">05</span>
              <div>
                <p className="chapter-kicker">Secure by default</p>
                <h2 className="chapter-title">Limits before your code runs.</h2>
                <p className="chapter-intro">
                  The server enforces body, time, and concurrency limits before dispatch. Security
                  headers, CSP nonces, CSRF, and an SSRF guard ship with the framework.
                </p>
              </div>
            </header>
            <div className="chapter-stage" data-reveal>
              <div className="chapter-copy">
                <Points
                  items={[
                    "1 MiB body · 10 s timeout · 100 concurrent by default",
                    "CSP nonce per request; double-submit CSRF; DNS-pinned SSRF guard",
                    "Client build rejects node:* and stubs *.server.ts imports",
                  ]}
                />
                <a className="link-arrow" href="docs/security/overview">
                  Security overview <span aria-hidden="true">→</span>
                </a>
              </div>
              <LimitsDemo />
            </div>
          </section>

          <section id="runtime" className="chapter chapter-dark">
            <header className="chapter-head" data-reveal data-scrub>
              <span className="chapter-num">06</span>
              <div>
                <p className="chapter-kicker">Rust/V8 runtime · experimental</p>
                <h2 className="chapter-title">A second runtime, on purpose.</h2>
                <p className="chapter-intro">
                  An experimental Rust host embedding V8 with a deny-all permission model. It
                  targets the same web-standard fetch contract; it is not part of the production
                  promise yet.
                </p>
              </div>
            </header>
            <div className="chapter-stage" data-reveal>
              <div className="chapter-copy">
                <Points
                  items={[
                    "Deny-all default: read/write/net/env require explicit flags",
                    "Worker and plugin isolation, quotas, and cancellation",
                    "Runs ESM + TypeScript directly; compatibility suite in CI",
                  ]}
                />
                <span className="experimental">experimental</span>
              </div>
              <div className="runtime-panel">
                <div className="visual-code-head">
                  <span>ramonyx-runtime</span>
                  <span>deny-all</span>
                </div>
                {/* biome-ignore lint/a11y/noNoninteractiveTabindex: <pre> dapat di-scroll → wajib fokus keyboard */}
                <pre tabIndex={0}>
                  <code>
                    <span className="terminal-prompt">$</span> cargo run -p ramonyx-runtime-cli --
                    run src/main.ts{"\n"}
                    <span className="console-dim">permission</span> read=— write=— net=— env=—{"\n"}
                    <span className="console-dim">grant</span> --allow-read=./data --allow-net{"\n"}
                    <span className="console-ready">ready</span> isolate=v8 quota=on{"\n"}
                    <span className="terminal-prompt">$</span> <span className="terminal-cursor" />
                  </code>
                </pre>
              </div>
            </div>
          </section>

          <section id="agents" className="chapter">
            <header className="chapter-head" data-reveal data-scrub>
              <span className="chapter-num">07</span>
              <div>
                <p className="chapter-kicker">For agents</p>
                <h2 className="chapter-title">Facts an agent can cite.</h2>
                <p className="chapter-intro">
                  Feature status with evidence and limitations, a public ADR index, and an MCP
                  server over stdio. Generated from public documentation only.
                </p>
              </div>
            </header>
            <div className="chapter-stage" data-reveal>
              <div className="chapter-copy">
                <Points
                  items={[
                    "features.json with implemented / partial / experimental status",
                    "llms.txt + llms-full.txt generated from docs/public only",
                    "MCP: search_docs, get_page, get_feature_status, get_rules, list_adrs",
                  ]}
                />
                <a className="link-arrow" href="docs/for-agents">
                  For agents <span aria-hidden="true">→</span>
                </a>
              </div>
              <div className="agent-stack">
                <TypedTerminal compact />
                <div className="visual-code">
                  <div className="visual-code-head">
                    <span>Claude Code</span>
                    <span>mcp</span>
                  </div>
                  {/* biome-ignore lint/a11y/noNoninteractiveTabindex: <pre> dapat di-scroll → wajib fokus keyboard */}
                  <pre tabIndex={0}>
                    <code>{`claude mcp add ramonyx-docs \\
  -- npx -y @ramonyx/mcp-docs-server`}</code>
                  </pre>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      <section className="closing" aria-labelledby="closing-title">
        <ParticleField tone="dark" />
        <div className="wrap closing-inner">
          <p className="closing-kicker">
            <span className="kicker-tanda" aria-hidden="true" />
            One file. One command.
          </p>
          <h2 id="closing-title">
            Start in <em>30 seconds.</em>
          </h2>
          <p className="closing-lede">
            Scaffold the app, read the one-file tour, and ship on the target you already use.
          </p>
          <div className="closing-actions">
            <Magnetic>
              <a className="tombol utama" href="docs/getting-started">
                Read the getting started
              </a>
            </Magnetic>
            <Magnetic>
              <a className="tombol" href="https://github.com/RamonyxJS/ramonyx">
                Star on GitHub
              </a>
            </Magnetic>
          </div>
          <div className="install closing-install">
            <span className="install-prompt" aria-hidden="true">
              $
            </span>
            <code>pnpm create ramonyx-app my-app</code>
            <button className="copy" type="button" data-copy aria-label="Copy install command">
              Copy
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
