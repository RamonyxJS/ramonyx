// Animasi alur streaming: shell/head lebih dulu, body menyusul. Bukan klaim timing nyata.
import { useEffect, useRef, useState } from "react";

import { useInView, useReducedMotion } from "./hooks.ts";

const STEPS = [
  { label: "request", detail: "GET /docs/routing" },
  { label: "middleware", detail: "headers · nonce · rate limit" },
  { label: "loader", detail: "catalog + cache hit" },
  { label: "render", detail: "React server tree" },
  { label: "stream", detail: "shell → chunks → done" },
] as const;

const CODE = `export default function App() {
  return createPageRoutes({
    pages,
    renderer: createReactRenderer(),
    streaming: true,
  });
}`;

export function StreamDemo() {
  const [step, setStep] = useState(0);
  const { ref, inView } = useInView<HTMLDivElement>({ rootMargin: "100px 0px" });
  const reduced = useReducedMotion();
  const started = useRef(false);
  const timer = useRef(0);

  useEffect(() => {
    if (!inView || reduced || started.current) {
      return;
    }
    started.current = true;
    timer.current = window.setInterval(() => {
      setStep((value) => {
        if (value >= STEPS.length - 1) {
          window.clearInterval(timer.current);
          return value;
        }
        return value + 1;
      });
    }, 650);
    return () => window.clearInterval(timer.current);
  }, [inView, reduced]);

  const replay = (): void => {
    window.clearInterval(timer.current);
    setStep(0);
    started.current = true;
    timer.current = window.setInterval(() => {
      setStep((value) => {
        if (value >= STEPS.length - 1) {
          window.clearInterval(timer.current);
          return value;
        }
        return value + 1;
      });
    }, 650);
  };

  return (
    <div ref={ref} className="stream-demo">
      <div className="stream-toolbar">
        <span className="stream-live">
          <i /> stream trace
        </span>
        <button type="button" onClick={replay}>
          Replay
        </button>
      </div>
      <ol className="stream-steps">
        {STEPS.map((item, index) => (
          <li
            key={item.label}
            className={index <= step ? "is-on" : ""}
            aria-current={index === step ? "step" : undefined}
          >
            <span className="stream-index">{String(index + 1).padStart(2, "0")}</span>
            <span className="stream-label">{item.label}</span>
            <span className="stream-detail">{item.detail}</span>
          </li>
        ))}
      </ol>
      <div className="stream-chunks" aria-hidden="true">
        <span className={step >= 2 ? "is-on" : ""}>head</span>
        <span className={step >= 3 ? "is-on" : ""}>shell</span>
        <span className={step >= 4 ? "is-on" : ""}>body</span>
        <span className={step >= 4 ? "is-on" : ""}>hydrate</span>
      </div>
      <div className="visual-code">
        <div className="visual-code-head">
          <span>src/app.ts</span>
          <span>ts</span>
        </div>
        {/* biome-ignore lint/a11y/noNoninteractiveTabindex: <pre> dapat di-scroll → wajib fokus keyboard */}
        <pre tabIndex={0}>
          <code>{CODE}</code>
        </pre>
      </div>
    </div>
  );
}
