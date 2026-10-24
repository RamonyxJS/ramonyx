import type { PageProps } from "@ramonyx/react";

import { listCatalog } from "../../catalog.ts";
import { DocsShell } from "../../components/docs-shell.tsx";
import { NAV } from "../../nav.ts";
import { PUBLIC_STATS } from "../../public-stats.ts";

export const metadata = {
  title: "Documentation",
  description: "Ramonyx documentation: getting started, routing, SSR, security, deployment, API.",
};

export async function loader() {
  return { entries: listCatalog() };
}

function ChapterNumber({ children }: { readonly children: string }) {
  return <span className="docs-chapter-num">{children}</span>;
}

export default function DocsIndexPage({
  data,
}: PageProps<{ entries: { slug: string; title: string }[] }>) {
  const tersedia = new Set(data.entries.map((entry) => entry.slug));
  return (
    <DocsShell slug="">
      <div className="docs-home">
        <section className="docs-hero" aria-labelledby="docs-home-title">
          <div className="docs-hero-copy">
            <p className="docs-eyebrow">
              <span className="docs-diamond" aria-hidden="true" />
              Field manual
              <span className="docs-eyebrow-version">v{PUBLIC_STATS.version}</span>
            </p>
            <h1 id="docs-home-title">
              Everything between
              <br />
              <em>npm create</em> and production.
            </h1>
            <p className="docs-lede">
              A working manual for the whole contract: file routes, server actions, streaming SSR,
              security defaults, and the operational edges where real apps spend their time.
            </p>
            <div className="docs-actions">
              <a className="tombol utama" href="docs/getting-started">
                Start with an app <span aria-hidden="true">↗</span>
              </a>
              <a className="docs-text-link" href="docs/architecture">
                Read the architecture <span aria-hidden="true">↓</span>
              </a>
            </div>
            <div className="docs-facts">
              <span>
                <strong>{PUBLIC_STATS.tests.node.toLocaleString("en-US")}</strong> Node tests
              </span>
              <span>
                <strong>{PUBLIC_STATS.tests.rust.toLocaleString("en-US")}</strong> Rust tests
              </span>
              <span>
                <strong>{PUBLIC_STATS.packages.npm}</strong> packages
              </span>
            </div>
          </div>
          <div
            className="docs-terminal"
            role="img"
            aria-label="Project route map with src/app.ts, routes, assets, and one Node/static/edge contract"
          >
            <div className="docs-terminal-head">
              <span className="docs-terminal-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span>src/routes</span>
              <span className="docs-terminal-live">SSR + hydration</span>
            </div>
            <pre>
              <span className="t-dim">src/</span>
              {"\n"}
              {"  "}app.ts{"          "}
              <span className="t-dim">createApp()</span>
              {"\n"}
              {"  "}routes/{"\n"}
              {"    "}page.tsx{"       "}
              <span className="t-cobalt">loader()</span>
              {"\n"}
              {"    "}layout.tsx{"     "}
              <span className="t-dim">shell</span>
              {"\n"}
              {"    "}api/halo.ts{"    "}
              <span className="t-cobalt">GET / POST</span>
              {"\n"}
              {"    "}middleware.ts{"  "}
              <span className="t-dim">security</span>
              {"\n"}
              {"  "}assets/{"\n"}
              {"    "}hero.png{"      "}
              <span className="t-cobalt">webp + avif</span>
            </pre>
            <div className="docs-terminal-foot">
              <span>Node</span>
              <span>Static</span>
              <span>Edge</span>
              <span className="docs-terminal-status">
                <i aria-hidden="true" /> one contract
              </span>
            </div>
          </div>
        </section>

        <section className="docs-start" aria-labelledby="docs-start-title">
          <div className="docs-section-head">
            <span className="docs-section-num">01</span>
            <div>
              <h2 id="docs-start-title">Start here</h2>
              <p>Three moves from an empty directory to a request you can trace.</p>
            </div>
          </div>
          <div className="docs-steps">
            <a href="docs/getting-started">
              <span className="docs-step-num">01</span>
              <strong>Scaffold</strong>
              <code>npm create ramonyx-app@latest my-app</code>
              <span className="docs-step-arrow" aria-hidden="true">
                →
              </span>
            </a>
            <a href="docs/routing">
              <span className="docs-step-num">02</span>
              <strong>Route</strong>
              <code>src/routes/page.tsx</code>
              <span className="docs-step-arrow" aria-hidden="true">
                →
              </span>
            </a>
            <a href="docs/deployment">
              <span className="docs-step-num">03</span>
              <strong>Ship</strong>
              <code>ramonyx build --target edge</code>
              <span className="docs-step-arrow" aria-hidden="true">
                →
              </span>
            </a>
          </div>
        </section>

        <section className="docs-chapters" aria-labelledby="docs-chapters-title">
          <div className="docs-section-head">
            <span className="docs-section-num">02</span>
            <div>
              <h2 id="docs-chapters-title">Chapters</h2>
              <p>Read in order, or go straight to the edge you are debugging.</p>
            </div>
          </div>
          <div className="docs-chapter-grid">
            {NAV.map((section, index) => {
              const items = section.items.filter((item) => tersedia.has(item.slug));
              if (items.length === 0) {
                return null;
              }
              return (
                <article key={section.title} className="docs-chapter">
                  <header className="docs-chapter-head">
                    <ChapterNumber>{String(index + 1).padStart(2, "0")}</ChapterNumber>
                    <div>
                      <h3>{section.title}</h3>
                      <p>{section.description}</p>
                    </div>
                  </header>
                  <ul>
                    {items.map((item) => (
                      <li key={item.slug}>
                        <a href={`docs/${item.slug}`}>
                          <span>
                            <strong>{item.label}</strong>
                            {item.description === undefined ? null : (
                              <small>{item.description}</small>
                            )}
                          </span>
                          <span className="docs-chapter-arrow" aria-hidden="true">
                            ↗
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>
        </section>

        <section className="docs-shelf" aria-labelledby="docs-shelf-title">
          <div className="docs-section-head">
            <span className="docs-section-num">03</span>
            <div>
              <h2 id="docs-shelf-title">Reference shelf</h2>
              <p>Facts for humans and agents, kept in one place.</p>
            </div>
          </div>
          <div className="docs-shelf-grid">
            <a href="docs/api/core-contract">
              <span className="docs-shelf-label">API</span>
              <strong>Core contract</strong>
              <small>Handler, route, page, runtime host.</small>
              <span aria-hidden="true">→</span>
            </a>
            <a href="docs/state-and-adapters">
              <span className="docs-shelf-label">Ops</span>
              <strong>State adapters</strong>
              <small>Redis, TTLs, atomic counters, sinks.</small>
              <span aria-hidden="true">→</span>
            </a>
            <a href="docs/for-agents">
              <span className="docs-shelf-label">Agents</span>
              <strong>MCP server</strong>
              <small>Search docs without cloning the repo.</small>
              <span aria-hidden="true">→</span>
            </a>
            <a href="machine/llms.txt">
              <span className="docs-shelf-label">Machine</span>
              <strong>llms.txt</strong>
              <small>The public site in one agent-readable file.</small>
              <span aria-hidden="true">→</span>
            </a>
          </div>
        </section>
      </div>
    </DocsShell>
  );
}
