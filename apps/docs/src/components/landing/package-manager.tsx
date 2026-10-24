import { type ReactElement, useSyncExternalStore } from "react";

export interface Manager {
  readonly id: "npm" | "pnpm" | "yarn" | "bun";
  readonly label: string;
  readonly create: string;
  readonly install: string;
  readonly dev: string;
  readonly build: string;
  readonly start: string;
}

export const DEFAULT_MANAGER: Manager = {
  id: "npm",
  label: "npm",
  create: "npm create ramonyx-app@latest my-app",
  install: "npm install",
  dev: "npm run dev",
  build: "npm run build",
  start: "npm start",
};

export const MANAGERS: readonly Manager[] = [
  DEFAULT_MANAGER,
  {
    id: "pnpm",
    label: "pnpm",
    create: "pnpm create ramonyx-app@latest my-app",
    install: "pnpm install",
    dev: "pnpm dev",
    build: "pnpm build",
    start: "pnpm start",
  },
  {
    id: "yarn",
    label: "yarn",
    create: "yarn create ramonyx-app my-app",
    install: "yarn",
    dev: "yarn dev",
    build: "yarn build",
    start: "yarn start",
  },
  {
    id: "bun",
    label: "bun",
    create: "bun create ramonyx-app my-app",
    install: "bun install",
    dev: "bun run dev",
    build: "bun run build",
    start: "bun run start",
  },
];

let activeId: Manager["id"] = "npm";
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot(): Manager["id"] {
  return activeId;
}

export function usePackageManager(): Manager {
  const id = useSyncExternalStore(subscribe, snapshot, () => "npm");
  return MANAGERS.find((manager) => manager.id === id) ?? DEFAULT_MANAGER;
}

export function setPackageManager(id: Manager["id"]): void {
  if (id === activeId) return;
  activeId = id;
  for (const listener of listeners) listener();
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
