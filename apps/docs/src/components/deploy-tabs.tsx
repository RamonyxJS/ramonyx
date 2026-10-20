// Demo interaktif: tiga target deploy (klien). Panah kiri/kanan memindahkan tab.
import { useRef, useState } from "react";

const TARGET = {
  node: {
    label: "Node",
    perintah: "ramonyx build && ramonyx start",
    keterangan: "SSR on Node ≥ 24. Hashed client assets, streaming responses, process-local cache.",
    keluaran:
      "✓ client bundle → dist/client\nRamonyx running at http://127.0.0.1:3000 · production",
  },
  static: {
    label: "Static",
    perintah: "ramonyx build --static",
    keterangan:
      "Prerender static routes + getStaticPaths; a 404 page becomes 404.html; assets copied alongside.",
    keluaran: "✓ static export → dist/static\n✓ 404.html written",
  },
  edge: {
    label: "Edge",
    perintah: "ramonyx build --target edge",
    keterangan:
      "One bundle exporting { fetch }; pages/API/actions/middleware inlined; node:* rejected at build.",
    keluaran: "✓ edge bundle → dist/edge/index.js\n✓ fetch handler contract",
  },
} as const;

type Kunci = keyof typeof TARGET;
const KUNCI = Object.keys(TARGET) as Kunci[];

export function DeployTabs() {
  const [aktif, setAktif] = useState<Kunci>("node");
  const tombol = useRef<Array<HTMLButtonElement | null>>([]);
  const data = TARGET[aktif];

  const pilih = (index: number): void => {
    const berikut = KUNCI[(index + KUNCI.length) % KUNCI.length] ?? "node";
    setAktif(berikut);
    tombol.current[KUNCI.indexOf(berikut)]?.focus();
  };

  return (
    <div>
      <div className="tabs" role="tablist" aria-label="Deployment targets">
        {KUNCI.map((kunci, index) => (
          <button
            key={kunci}
            ref={(element) => {
              tombol.current[index] = element;
            }}
            id={`tab-deploy-${kunci}`}
            type="button"
            role="tab"
            className="tab"
            aria-selected={aktif === kunci}
            aria-controls="panel-deploy"
            tabIndex={aktif === kunci ? 0 : -1}
            onClick={() => setAktif(kunci)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") {
                event.preventDefault();
                pilih(index + 1);
              } else if (event.key === "ArrowLeft") {
                event.preventDefault();
                pilih(index - 1);
              } else if (event.key === "Home") {
                event.preventDefault();
                pilih(0);
              } else if (event.key === "End") {
                event.preventDefault();
                pilih(KUNCI.length - 1);
              }
            }}
          >
            {TARGET[kunci].label}
          </button>
        ))}
      </div>
      <div
        className="kode-panel"
        role="tabpanel"
        id="panel-deploy"
        aria-labelledby={`tab-deploy-${aktif}`}
      >
        <div className="kode-kepala">
          <span className="kode-berkas">Terminal</span>
          <span className="kode-bahasa">{data.label.toLowerCase()}</span>
          <button className="copy" type="button" data-copy aria-label="Copy code">
            Copy
          </button>
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
      <p className="tab-catatan">{data.keterangan}</p>
    </div>
  );
}
