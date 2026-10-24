import { type ReactElement, useEffect, useSyncExternalStore } from "react";

import {
  DEFAULT_MANAGER,
  isManagerId,
  MANAGERS,
  type Manager,
  type ManagerId,
} from "../../package-managers.ts";

const STORAGE_KEY = "ramonyx-pm";
let activeId: ManagerId = "npm";
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot(): ManagerId {
  return activeId;
}

function initialManager(): ManagerId {
  if (typeof document === "undefined") return "npm";
  const fromDocument = document.documentElement.dataset.pm;
  if (isManagerId(fromDocument)) return fromDocument;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isManagerId(stored)) return stored;
  } catch {
    // storage may be disabled
  }
  return "npm";
}

if (typeof document !== "undefined") {
  activeId = initialManager();
  document.documentElement.dataset.pm = activeId;
}

export function usePackageManager(): Manager {
  const id = useSyncExternalStore(subscribe, snapshot, () => "npm");
  return MANAGERS.find((manager) => manager.id === id) ?? DEFAULT_MANAGER;
}

export function setPackageManager(id: ManagerId): void {
  if (id !== activeId) {
    activeId = id;
    for (const listener of listeners) listener();
  }
  if (typeof document !== "undefined") {
    document.documentElement.dataset.pm = id;
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // storage may be disabled
    }
  }
}

/** Keep <html data-pm> and other tabs in sync; renders nothing. */
export function PackageManagerSync(): null {
  const manager = usePackageManager();

  useEffect(() => {
    document.documentElement.dataset.pm = manager.id;
  }, [manager.id]);

  useEffect(() => {
    const onStorage = (event: StorageEvent): void => {
      if (event.key === STORAGE_KEY && isManagerId(event.newValue)) {
        activeId = event.newValue;
        document.documentElement.dataset.pm = event.newValue;
        for (const listener of listeners) listener();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return null;
}

export function PackageManagerTabs(): ReactElement {
  const active = usePackageManager();
  return (
    <fieldset className="pm-tabs">
      <legend className="sr-only">Package manager</legend>
      {MANAGERS.map((manager) => (
        <button
          key={manager.id}
          type="button"
          aria-pressed={manager.id === active.id}
          className="pm-tab"
          onClick={() => setPackageManager(manager.id)}
        >
          {manager.label}
        </button>
      ))}
    </fieldset>
  );
}

export function PackageManagerSelect(): ReactElement {
  const active = usePackageManager();
  return (
    <label className="pm-select">
      <span className="sr-only">Package manager</span>
      <select
        value={active.id}
        onChange={(event) => {
          const value = event.target.value;
          if (isManagerId(value)) setPackageManager(value);
        }}
        aria-label="Package manager"
      >
        {MANAGERS.map((manager) => (
          <option key={manager.id} value={manager.id}>
            {manager.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function PackageManagerCommand({
  className = "",
}: {
  readonly className?: string;
}): ReactElement {
  const manager = usePackageManager();
  return (
    <div className={`install pm-install ${className}`.trim()}>
      <PackageManagerTabs />
      <span className="install-prompt" aria-hidden="true">
        $
      </span>
      <code>{manager.create}</code>
      <button className="copy" type="button" data-copy aria-label="Copy install command">
        Copy
      </button>
    </div>
  );
}

export function HeroConsole(): ReactElement {
  const manager = usePackageManager();
  return (
    <div className="hero-console">
      <div className="console-bar">
        <i />
        <i />
        <i />
        <span>~/my-app</span>
        <span className="console-live">live</span>
      </div>
      <pre>
        <code>
          <span className="terminal-prompt">$</span> {manager.create}
          {"\n"}
          <span className="console-dim">scaffold → my-app</span>
          {"\n"}
          <span className="terminal-prompt">$</span> cd my-app && {manager.dev}
          {"\n"}
          <span className="console-dim">dev</span> http://localhost:3000{"\n"}
          <span className="console-dim">devtools</span> /__ramonyx/devtools{"\n"}
          <span className="console-ready">ready</span>
          {"\n"}
          <span className="terminal-prompt">$</span> <span className="terminal-cursor" />
        </code>
      </pre>
      <div className="console-foot">
        <span>streaming</span>
        <span>1 MiB · 10 s · 100</span>
        <span>Node / static / edge</span>
      </div>
    </div>
  );
}
