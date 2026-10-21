// Rail chapter + keyboard-first navigation. Shortcut tidak aktif saat fokus di kontrol teks.
import { useEffect, useRef, useState } from "react";

import { useReducedMotion } from "./hooks.ts";
import { LANDING_SECTIONS, type LandingSection } from "./sections.ts";

const SHORTCUTS = [
  { keys: "D", label: "Docs", href: "docs" },
  { keys: "A", label: "Architecture", href: "docs/architecture" },
  { keys: "G", label: "GitHub", href: "https://github.com/RamonyxJS/ramonyx", external: true },
] as const;

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest("input, textarea, select, [contenteditable], dialog") !== null
  );
}

function navigate(href: string): void {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

export function LandingNav({
  sections = LANDING_SECTIONS,
}: {
  readonly sections?: readonly LandingSection[];
}) {
  const [active, setActive] = useState("");
  const [help, setHelp] = useState(false);
  const progress = useRef<HTMLSpanElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(entry.target.id);
          }
        }
      },
      { rootMargin: "-22% 0px -62% 0px", threshold: 0 },
    );
    for (const section of sections) {
      const element = document.getElementById(section.id);
      if (element !== null) {
        observer.observe(element);
      }
    }
    return () => observer.disconnect();
  }, [sections]);

  useEffect(() => {
    let frame = 0;
    const update = (): void => {
      frame = 0;
      const first = document.getElementById(sections[0]?.id ?? "");
      const last = document.getElementById(sections.at(-1)?.id ?? "");
      if (first === null || last === null || progress.current === null) {
        return;
      }
      const start = first.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.3;
      const end = last.getBoundingClientRect().bottom + window.scrollY - window.innerHeight * 0.7;
      const ratio = Math.min(1, Math.max(0, (window.scrollY - start) / Math.max(1, end - start)));
      progress.current.style.transform = `scaleY(${ratio})`;
    };
    const onScroll = (): void => {
      if (frame === 0) {
        frame = window.requestAnimationFrame(update);
      }
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", update);
      if (frame !== 0) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [sections]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isEditable(event.target)
      ) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "arrowdown" || key === "arrowup") {
        // Posisi scroll, bukan state active: ArrowDown dari atas harus menuju section pertama.
        const current = sections.reduce((last, section, index) => {
          const element = document.getElementById(section.id);
          return element !== null && element.getBoundingClientRect().top <= window.innerHeight * 0.4
            ? index
            : last;
        }, -1);
        const next = key === "arrowdown" ? current + 1 : current - 1;
        const target = sections[next];
        if (next < 0 || target === undefined) {
          return;
        }
        event.preventDefault();
        document.getElementById(target.id)?.scrollIntoView({
          behavior: reduced ? "auto" : "smooth",
          block: "start",
        });
        setActive(target.id);
        window.history.replaceState(null, "", `#${target.id}`);
        return;
      }
      if (key === "?") {
        event.preventDefault();
        setHelp(true);
        return;
      }
      if (help && key === "escape") {
        setHelp(false);
        return;
      }
      const shortcut = SHORTCUTS.find((item) => item.keys.toLowerCase() === key);
      if (shortcut !== undefined) {
        event.preventDefault();
        navigate(shortcut.href);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, help, reduced, sections]);

  useEffect(() => {
    const element = dialog.current;
    if (element === null) {
      return;
    }
    if (help && !element.open) {
      element.showModal();
    } else if (!help && element.open) {
      element.close();
    }
  }, [help]);

  const activeIndex = Math.max(
    0,
    sections.findIndex((section) => section.id === active),
  );
  const activeSection = sections[activeIndex] ?? sections[0];

  return (
    <>
      <aside className="chapter-rail" aria-label="Chapters">
        <div className="rail-hint">
          Scroll or press <kbd>↓</kbd> <kbd>↑</kbd>
        </div>
        <div className="rail-track" aria-hidden="true">
          <span ref={progress} />
        </div>
        <ol className="rail-list">
          {sections.map((section, index) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                aria-current={active === section.id ? "true" : undefined}
                onClick={() => setActive(section.id)}
              >
                <span className="rail-num">{String(index + 1).padStart(2, "0")}</span>
                <span>{section.label}</span>
              </a>
            </li>
          ))}
        </ol>
        <div className="rail-shortcuts">
          {SHORTCUTS.map((item) => (
            <a
              key={item.keys}
              href={item.href}
              aria-keyshortcuts={item.keys}
              {...(item.external === true ? { rel: "noreferrer" } : {})}
            >
              <kbd>[{item.keys}]</kbd> {item.label}
            </a>
          ))}
        </div>
        <button
          type="button"
          className="rail-help"
          onClick={() => setHelp(true)}
          aria-haspopup="dialog"
        >
          <kbd>?</kbd> Shortcuts
        </button>
      </aside>

      <details className="story-mobile">
        <summary>
          <span className="mobile-count">
            {String(activeIndex + 1).padStart(2, "0")} / {String(sections.length).padStart(2, "0")}
          </span>
          <span>{activeSection?.label ?? "Chapters"}</span>
          <span className="mobile-plus" aria-hidden="true">
            +
          </span>
        </summary>
        <nav aria-label="Chapters (mobile)">
          {sections.map((section, index) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              aria-current={active === section.id ? "true" : undefined}
            >
              <span>{String(index + 1).padStart(2, "0")}</span> {section.label}
            </a>
          ))}
        </nav>
      </details>

      <dialog
        ref={dialog}
        className="shortcut-dialog"
        aria-label="Keyboard shortcuts"
        onClose={() => setHelp(false)}
        onCancel={() => setHelp(false)}
      >
        <div className="shortcut-dialog-head">
          <span>Keyboard</span>
          <button
            type="button"
            onClick={() => setHelp(false)}
            aria-label="Close keyboard shortcuts"
          >
            esc
          </button>
        </div>
        <dl>
          <div>
            <dt>
              <kbd>↓</kbd> <kbd>↑</kbd>
            </dt>
            <dd>Next / previous chapter</dd>
          </div>
          {SHORTCUTS.map((item) => (
            <div key={item.keys}>
              <dt>
                <kbd>{item.keys}</kbd>
              </dt>
              <dd>{item.label}</dd>
            </div>
          ))}
          <div>
            <dt>
              <kbd>?</kbd>
            </dt>
            <dd>This panel</dd>
          </div>
        </dl>
      </dialog>
    </>
  );
}
