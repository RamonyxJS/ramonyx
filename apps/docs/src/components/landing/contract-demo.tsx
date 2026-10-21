// Satu kontrak, tiga target. Tab keyboard + panel artefak.
import { useState } from "react";

import { Tilt } from "./interactions.tsx";

const TARGETS = {
  node: {
    label: "Node",
    command: "ramonyx build && ramonyx start",
    artifact: "dist/client + SSR process",
    detail: "SSR, actions, streaming, process-local cache.",
    code: "createHandler({ routes, streaming: true })",
  },
  static: {
    label: "Static",
    command: "ramonyx build --static",
    artifact: "dist/static",
    detail: "Prerender routes, getStaticPaths, 404.html, hashed assets.",
    code: "prerenderRoutes({ handler, paths })",
  },
  edge: {
    label: "Edge",
    command: "ramonyx build --target edge",
    artifact: "dist/edge/index.js",
    detail: "One fetch handler; node:* rejected at build; assets inlined.",
    code: "export default { fetch }",
  },
} as const;

type Key = keyof typeof TARGETS;
const KEYS = Object.keys(TARGETS) as Key[];

export function ContractDemo() {
  const [active, setActive] = useState<Key>("node");
  const data = TARGETS[active];

  return (
    <div className="contract-demo">
      <div className="contract-core">
        <span className="contract-core-label">src/app.ts</span>
        <strong>one handler</strong>
        <span>{data.artifact}</span>
      </div>
      <div className="contract-targets" role="tablist" aria-label="Deployment targets">
        {KEYS.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active === key}
            className={active === key ? "is-active" : ""}
            onClick={() => setActive(key)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                event.preventDefault();
                const index = KEYS.indexOf(key);
                const next =
                  KEYS[(index + (event.key === "ArrowRight" ? 1 : -1) + KEYS.length) % KEYS.length];
                if (next !== undefined) {
                  setActive(next);
                }
              }
            }}
          >
            <span>{TARGETS[key].label}</span>
            <small>{TARGETS[key].artifact}</small>
          </button>
        ))}
      </div>
      <Tilt className="contract-panel visual-code">
        <div className="visual-code-head">
          <span>terminal</span>
          <span>{active}</span>
        </div>
        {/* biome-ignore lint/a11y/noNoninteractiveTabindex: <pre> dapat di-scroll → wajib fokus keyboard */}
        <pre tabIndex={0}>
          <code>
            <span className="terminal-prompt">$ </span>
            {data.command}
            {"\n\n"}
            {data.detail}
            {"\n"}
            {data.code}
          </code>
        </pre>
      </Tilt>
    </div>
  );
}
