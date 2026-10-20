import type { LayoutProps } from "@ramonyx/react";

import { CodeCopy } from "../components/code-copy.tsx";
import { Search } from "../components/search.tsx";
import { ThemeToggle } from "../components/theme-toggle.tsx";

export default function RootLayout({ children }: LayoutProps) {
  return (
    <div className="shell">
      <a className="lewati" href="#isi">
        Skip to content
      </a>
      <CodeCopy />
      <header className="topbar">
        <div className="wrap topbar-dalam">
          <a className="merek" href=".">
            <span className="merek-tanda" aria-hidden="true" />
            Ramonyx
            <span className="merek-tag">docs</span>
          </a>
          <nav className="topnav" aria-label="Main">
            <a href="docs">Docs</a>
            <a href="docs/architecture">Architecture</a>
            <a href="docs/for-agents">For agents</a>
            <a href="https://github.com/RamonyxJS/ramonyx">GitHub</a>
          </nav>
          <div className="topbar-aksi">
            <Search />
            <ThemeToggle />
            <a className="tombol utama" href="docs/getting-started">
              Get started
            </a>
          </div>
        </div>
      </header>
      {children}
      <footer className="kaki">
        <div className="wrap kaki-utama">
          <div>
            <span className="kaki-nama">Ramonyx</span>
            <p className="kaki-tagline">
              Full-stack TypeScript with safe defaults, one contract for Node, static, and edge, and
              a Rust/V8 runtime on the road.
            </p>
          </div>
          <nav className="kaki-kolom" aria-label="Documentation">
            <div className="kaki-judul">Use</div>
            <ul>
              <li>
                <a href="docs/getting-started">Getting started</a>
              </li>
              <li>
                <a href="docs/whats-included">What's included</a>
              </li>
              <li>
                <a href="docs/api/core-contract">API reference</a>
              </li>
              <li>
                <a href="docs/cli">CLI</a>
              </li>
            </ul>
          </nav>
          <nav className="kaki-kolom" aria-label="Project">
            <div className="kaki-judul">Project</div>
            <ul>
              <li>
                <a href="https://github.com/RamonyxJS/ramonyx">GitHub</a>
              </li>
              <li>
                <a href="https://www.npmjs.com/package/ramonyx">npm</a>
              </li>
              <li>
                <a href="https://github.com/RamonyxJS/ramonyx/blob/main/SECURITY.md">Security</a>
              </li>
              <li>
                <a href="https://github.com/RamonyxJS/ramonyx/tree/main/docs/public/engineering">
                  Engineering notes
                </a>
              </li>
            </ul>
          </nav>
          <nav className="kaki-kolom" aria-label="For agents">
            <div className="kaki-judul">Machine</div>
            <ul>
              <li>
                <a href="machine/features.json">features.json</a>
              </li>
              <li>
                <a href="machine/llms.txt">llms.txt</a>
              </li>
              <li>
                <a href="docs/for-agents">MCP server</a>
              </li>
              <li>
                <a href="docs/benchmarks">Benchmarks</a>
              </li>
            </ul>
          </nav>
        </div>
        <div className="wrap kaki-bawah">
          <span>© 2026 Ramonyx contributors · MIT licensed</span>
          <span>Rendered by Ramonyx — SSR + hydration, public docs only</span>
        </div>
      </footer>
    </div>
  );
}
