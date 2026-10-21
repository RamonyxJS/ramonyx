// Gauge default limits (1 MiB / 10 s / 100 concurrent). Angka final ada di SSR; count-up
// hanya dijalankan saat masuk viewport, dengan reduced-motion sebagai keadaan statis.
import { useEffect, useRef, useState } from "react";

import { useInView, useReducedMotion } from "./hooks.ts";

const LIMITS = [
  { id: "body", value: 1, unit: "MiB", label: "request body", note: "413 before dispatch" },
  { id: "timeout", value: 10, unit: "s", label: "handler timeout", note: "503 + abort signal" },
  {
    id: "concurrent",
    value: 100,
    unit: "",
    label: "concurrent requests",
    note: "503 + Retry-After",
  },
] as const;

export function LimitsDemo() {
  const { ref, inView } = useInView<HTMLDivElement>({ rootMargin: "80px 0px" });
  const reduced = useReducedMotion();
  const started = useRef(false);
  const [values, setValues] = useState<number[]>(LIMITS.map((item) => item.value));

  useEffect(() => {
    if (!inView || reduced || started.current) {
      return;
    }
    started.current = true;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number): void => {
      const progress = Math.min(1, (now - start) / 900);
      const eased = 1 - (1 - progress) ** 3;
      setValues(LIMITS.map((item) => Math.round(item.value * eased)));
      if (progress < 1) {
        frame = window.requestAnimationFrame(tick);
      }
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [inView, reduced]);

  return (
    <div ref={ref} className="limits-demo">
      <div className="limits-head">
        <span>
          <i /> enforced by default
        </span>
        <span>before your code</span>
      </div>
      <div className="limits-grid">
        {LIMITS.map((limit, index) => {
          const value = values[index] ?? limit.value;
          return (
            <div key={limit.id} className="limit">
              <div className="limit-value">
                <span>{value}</span>
                {limit.unit.length > 0 ? <small>{limit.unit}</small> : null}
              </div>
              <div className="limit-bar" aria-hidden="true">
                <i
                  style={{
                    transform: `scaleX(${Math.max(0.02, (values[index] ?? limit.value) / limit.value)})`,
                  }}
                />
              </div>
              <div className="limit-label">{limit.label}</div>
              <div className="limit-note">{limit.note}</div>
            </div>
          );
        })}
      </div>
      <div className="limits-tags">
        {["CSP nonce", "CSRF", "SSRF guard", "rate limit", "output cap"].map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
    </div>
  );
}
