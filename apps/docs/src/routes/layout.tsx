import type { LayoutProps } from "@ramonyx/react";

export default function RootLayout({ children }: LayoutProps) {
  return (
    <div className="shell">
      <header className="topbar">
        <a className="merek" href="/">
          Ramonyx <span className="tag">docs</span>
        </a>
        <span className="meta">v0.1.0 · MIT</span>
      </header>
      {children}
      <footer className="kaki">
        Dirender oleh framework Ramonyx sendiri (SSR React + hydration) — sumber: <code>docs/</code>{" "}
        repo.
      </footer>
    </div>
  );
}
