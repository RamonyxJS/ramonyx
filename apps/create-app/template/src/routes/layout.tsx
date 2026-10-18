import type { LayoutProps } from "@ramonyx/react";

export default function RootLayout({ children }: LayoutProps) {
  return (
    <div className="shell">
      <header className="topbar">
        <strong>__APP_NAME__</strong>
        <span>Ramonyx</span>
      </header>
      {children}
      <footer className="kaki">
        Dibuat dengan Ramonyx — <code>src/routes</code> berisi halaman & API.
      </footer>
    </div>
  );
}
