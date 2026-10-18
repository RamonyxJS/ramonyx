import type { LayoutProps } from "@ramonyx/react";

export default function RootLayout({ children }: LayoutProps) {
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", margin: "2rem" }}>
      <header>
        <strong>Ramonyx Playground</strong> — SSR (tanpa hydration)
      </header>
      <main>{children}</main>
    </div>
  );
}
