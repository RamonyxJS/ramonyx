// Terminal hidup: tab package manager, typing, replay, copy. SSR menampilkan transkrip final;
// typing hanya dimulai saat komponen masuk viewport dan motion diizinkan.
import { useEffect, useRef, useState } from "react";
import { MANAGERS, type Manager } from "../../package-managers.ts";
import { useInView, useReducedMotion } from "./hooks.ts";
import { setPackageManager, usePackageManager } from "./package-manager.tsx";

interface Line {
  readonly tone: "prompt" | "output" | "muted" | "ready";
  readonly text: string;
}

function transcript(manager: Manager): Line[] {
  return [
    { tone: "output", text: "scaffold → my-app" },
    { tone: "muted", text: `$ cd my-app && ${manager.install}` },
    { tone: "muted", text: `$ ${manager.dev}` },
    { tone: "muted", text: "dev    http://localhost:3000" },
    { tone: "muted", text: "devtools /__ramonyx/devtools" },
    { tone: "ready", text: "ready" },
  ];
}

export function TypedTerminal({ compact = false }: { readonly compact?: boolean }) {
  const [phase, setPhase] = useState<"idle" | "typing" | "done">("idle");
  const [typed, setTyped] = useState("");
  const [lineCount, setLineCount] = useState(0);
  const [copied, setCopied] = useState(false);
  const [run, setRun] = useState(0);
  const { ref, inView } = useInView<HTMLDivElement>({ rootMargin: "120px 0px" });
  const reduced = useReducedMotion();
  const manager = usePackageManager();
  const timers = useRef<number[]>([]);

  useEffect(() => {
    if (!inView || reduced) {
      if (reduced) {
        setPhase("done");
      }
      return;
    }
    if (phase === "idle") {
      const start = window.setTimeout(() => {
        setPhase("typing");
        setTyped("");
        setLineCount(0);
      }, 350);
      return () => window.clearTimeout(start);
    }
    return;
  }, [inView, phase, reduced]);

  useEffect(() => {
    // `run` memaksa typewriter ulang saat Replay ditekan meski manager sama.
    void run;
    if (phase !== "typing") {
      return;
    }
    const command = `$ ${manager.create}`;
    const lines = transcript(manager);
    let index = 0;
    const clear = (): void => {
      for (const timer of timers.current) {
        window.clearTimeout(timer);
      }
      timers.current = [];
    };
    clear();
    const tick = (): void => {
      index += 1;
      setTyped(command.slice(0, index));
      if (index < command.length) {
        timers.current.push(window.setTimeout(tick, 16));
        return;
      }
      setTyped(command);
      lines.forEach((_, lineIndex) => {
        timers.current.push(
          window.setTimeout(
            () => {
              setLineCount(lineIndex + 1);
            },
            180 + lineIndex * 170,
          ),
        );
      });
      timers.current.push(
        window.setTimeout(
          () => {
            setPhase("done");
          },
          260 + lines.length * 170,
        ),
      );
    };
    timers.current.push(window.setTimeout(tick, 80));
    return clear;
  }, [manager, phase, run]);

  useEffect(() => {
    return () => {
      for (const timer of timers.current) {
        window.clearTimeout(timer);
      }
    };
  }, []);

  const restart = (): void => {
    setPhase("typing");
    setTyped("");
    setLineCount(0);
    setRun((value) => value + 1);
  };

  const copy = (): void => {
    void navigator.clipboard.writeText(manager.create).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    });
  };

  const complete = phase !== "typing";
  const lines = complete ? transcript(manager) : transcript(manager).slice(0, lineCount);

  return (
    <div ref={ref} className={`terminal-live ${compact ? "terminal-compact" : ""}`}>
      <div className="terminal-live-bar">
        <div className="terminal-live-tabs" role="tablist" aria-label="Package manager">
          {MANAGERS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={manager.id === item.id}
              className={manager.id === item.id ? "is-active" : ""}
              onClick={() => {
                setPackageManager(item.id);
                if (phase !== "idle") {
                  restart();
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                  event.preventDefault();
                  const current = MANAGERS.findIndex((entry) => entry.id === manager.id);
                  const next =
                    (current + (event.key === "ArrowRight" ? 1 : -1) + MANAGERS.length) %
                    MANAGERS.length;
                  const nextManager = MANAGERS[next];
                  if (nextManager !== undefined) setPackageManager(nextManager.id);
                  if (phase !== "idle") {
                    restart();
                  }
                }
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="terminal-live-actions">
          <button type="button" onClick={copy} aria-label="Copy install command">
            {copied ? "Copied" : "Copy"}
          </button>
          <button type="button" onClick={restart} aria-label="Replay terminal">
            Replay
          </button>
        </div>
      </div>
      <div className="terminal-live-body">
        <div className="terminal-live-file">~/my-app</div>
        <div className="terminal-live-output" aria-hidden="true">
          <div className="terminal-line">
            <span className="terminal-prompt">$</span> {complete ? manager.create : typed}
            {phase === "typing" ? <span className="terminal-cursor" /> : null}
          </div>
          {lines.map((line) => (
            <div
              key={`${line.text}-${line.tone}`}
              className={`terminal-line terminal-${line.tone}`}
            >
              {line.text}
            </div>
          ))}
          {complete ? (
            <div className="terminal-line">
              <span className="terminal-prompt">$</span> <span className="terminal-cursor" />
            </div>
          ) : null}
        </div>
        <pre className="sr-only">{`$ ${manager.create}\n${transcript(manager)
          .map((line) => line.text)
          .join("\n")}`}</pre>
      </div>
    </div>
  );
}
