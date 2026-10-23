import type { LayoutProps } from "@ramonyx/react";

import { WELCOME_CSS } from "../welcome-css.ts";

export default function RootLayout({ children }: LayoutProps) {
  return (
    <div className="rw-shell">
      <style>{WELCOME_CSS}</style>
      <header className="rw-top">
        <a className="rw-brand" href=".">
          <span className="rw-mark" aria-hidden="true" />
          __APP_NAME__
          <small>ramonyx</small>
        </a>
        <nav className="rw-nav" aria-label="Project links">
          <a href="/api/halo/dunia">API</a>
          <a href="https://ramonyx.devmoon.net/docs/for-agents">For agents</a>
          <a href="https://github.com/RamonyxJS/ramonyx">GitHub</a>
          <a className="rw-nav-strong" href="https://ramonyx.devmoon.net/docs/getting-started">
            Docs
          </a>
        </nav>
      </header>
      {children}
      <footer className="rw-footer">
        <span>
          Built with <a href="https://ramonyx.devmoon.net/">Ramonyx</a> · MIT
        </span>
        <nav aria-label="Footer">
          <a href="https://ramonyx.devmoon.net/docs/cli">CLI</a>
          <a href="https://ramonyx.devmoon.net/docs/deployment">Deploy</a>
          <a href="https://ramonyx.devmoon.net/docs/troubleshooting">Troubleshooting</a>
        </nav>
      </footer>
    </div>
  );
}
