// Demo interaktif: tiga target deploy (klien).
import { useState } from "react";

const TARGET = {
  node: {
    label: "Node",
    perintah: "ramonyx build && ramonyx start",
    keterangan: "SSR on Node ≥ 24. Hashed client assets, streaming responses, process-local cache.",
    keluaran:
      "✓ client bundle: /assets/client-Df1hg6kh.js\nRamonyx berjalan di http://127.0.0.1:3000 (production)",
  },
  static: {
    label: "Static",
    perintah: "ramonyx build --static",
    keterangan:
      "Prerender static routes + getStaticPaths; a 404 page becomes 404.html; assets copied alongside.",
    keluaran: "✓ static: 12 halaman → dist/static\n✓ 404.html ditulis",
  },
  edge: {
    label: "Edge",
    perintah: "ramonyx build --target edge",
    keterangan:
      "One bundle exporting { fetch }; pages/API/actions/middleware inlined; node:* rejected at build.",
    keluaran: "✓ edge: dist/edge/index.js (47.3 KB) — fetch handler contract",
  },
} as const;

type Kunci = keyof typeof TARGET;

export function DeployTabs() {
  const [aktif, setAktif] = useState<Kunci>("node");
  const data = TARGET[aktif];

  return (
    <div>
      <div className="demo-tab" role="tablist" aria-label="Deployment targets">
        {(Object.keys(TARGET) as Kunci[]).map((kunci) => (
          <button
            key={kunci}
            type="button"
            role="tab"
            aria-selected={aktif === kunci}
            onClick={() => setAktif(kunci)}
          >
            {TARGET[kunci].label}
          </button>
        ))}
      </div>
      <div className="kode-panel" role="tabpanel">
        <div className="code-head">
          <span className="code-file">Terminal</span>
          <span className="code-lang">{data.label.toLowerCase()}</span>
        </div>
        {/* biome-ignore lint/a11y/noNoninteractiveTabindex: <pre> dapat di-scroll → wajib fokus keyboard (axe scrollable-region-focusable) */}
        <pre tabIndex={0}>
          <code>
            <span className="prompt">$ </span>
            {data.perintah}
            {"\n"}
            {data.keluaran}
          </code>
        </pre>
      </div>
      <p className="dim" style={{ marginTop: "12px", fontSize: "14px" }}>
        {data.keterangan}
      </p>
    </div>
  );
}
