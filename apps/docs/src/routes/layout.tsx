import type { LayoutProps } from "@ramonyx/react";

import { CodeCopy } from "../components/code-copy.tsx";
import { Search } from "../components/search.tsx";
import { ThemeToggle } from "../components/theme-toggle.tsx";

export default function RootLayout({ children }: LayoutProps) {
  return (
    <div className="shell">
      <CodeCopy />
      <header className="topbar">
        <div className="wrap topbar-dalam">
          <a className="merek" href=".">
            Ramonyx <span className="tag">docs</span>
          </a>
          <nav className="topnav" aria-label="Main">
            <a href="docs/getting-started">Docs</a>
            <a href="docs/adr/README">Decisions</a>
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
        <div className="wrap kaki-dalam">
          <span>Ramonyx — MIT licensed. Rendered by Ramonyx itself (SSR + hydration).</span>
          <div className="kaki-links">
            <a href="docs">Docs</a>
            <a href="docs/api/core-contract">API</a>
            <a href="machine/features.json">features.json</a>
            <a href="machine/llms.txt">llms.txt</a>
            <a href="https://github.com/RamonyxJS/ramonyx">GitHub</a>
            <a href="https://www.npmjs.com/package/ramonyx">npm</a>
            <a href="https://github.com/RamonyxJS/ramonyx/blob/main/SECURITY.md">Security</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
