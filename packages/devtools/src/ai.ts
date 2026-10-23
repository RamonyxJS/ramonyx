// `ramonyx ai init|sync` — scaffold/sinkronkan berkas agen untuk aplikasi Ramonyx.
//
// Prinsip:
// - `AGENTS.md` adalah sumber aturan kanonik; adapter lain tipis dan menautkannya.
// - Konfigurasi MCP memakai versi paket proyek (bukan `@latest`).
// - Berkas pengguna tidak ditimpa diam-diam: blok terkelola memakai marker; `--force` eksplisit.
// - `--dry-run` melaporkan aksi tanpa menulis.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { routeEntries } from "./project.ts";

export type AiMode = "init" | "sync";
export type AiAgent = "claude" | "cursor" | "copilot" | "opencode";
export type AiAction =
  | "created"
  | "updated"
  | "unchanged"
  | "skipped"
  | "would-create"
  | "would-update";

export interface AiOptions {
  readonly mode: AiMode;
  readonly appDir: string;
  readonly agents?: readonly string[];
  readonly mcp?: boolean;
  readonly force?: boolean;
  readonly dryRun?: boolean;
}

export interface AiFileResult {
  readonly path: string;
  readonly action: AiAction;
  readonly reason?: string;
}

export interface AiResult {
  readonly schemaVersion: 1;
  readonly ok: boolean;
  readonly appDir: string;
  readonly mode: AiMode;
  readonly mcp: {
    readonly package: string;
    readonly version: string;
    readonly command: readonly string[];
  } | null;
  readonly files: readonly AiFileResult[];
  readonly warnings: readonly string[];
}

const MARKER_START = "<!-- ramonyx:ai:start -->";
const MARKER_END = "<!-- ramonyx:ai:end -->";
const ALL_AGENTS: readonly AiAgent[] = ["claude", "cursor", "copilot", "opencode"];
const MCP_PACKAGE = "@ramonyx/mcp-docs-server";

function read(absolute: string): string | null {
  try {
    return readFileSync(absolute, "utf8");
  } catch {
    return null;
  }
}

function readJson(absolute: string): Record<string, unknown> | null {
  const text = read(absolute);
  if (text === null) {
    return null;
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function write(absolute: string, content: string, dryRun: boolean): void {
  if (dryRun) {
    return;
  }
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content);
}

/** Ambil versi stabil dari range dependency (`^1.0.0`, `~1.2.3`, `workspace:*`). */
function pinnedVersion(appDir: string): string {
  const pkg = readJson(join(appDir, "package.json"));
  const dependencies =
    typeof pkg?.dependencies === "object" && pkg.dependencies !== null
      ? (pkg.dependencies as Record<string, unknown>)
      : {};
  const value = dependencies.ramonyx;
  if (typeof value === "string") {
    const match = /(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/.exec(value);
    if (match?.[1] !== undefined) {
      return match[1];
    }
  }
  // Fallback: versi CLI devtools memakai nomor rilis yang sama dengan paket framework.
  const cli = readJson(fileURLToPath(new URL("../package.json", import.meta.url)));
  return typeof cli?.version === "string" ? cli.version : "1.0.0";
}

function packageScripts(appDir: string): string[] {
  const pkg = readJson(join(appDir, "package.json"));
  const scripts =
    typeof pkg?.scripts === "object" && pkg.scripts !== null
      ? (pkg.scripts as Record<string, unknown>)
      : {};
  return ["dev", "build", "start", "test"].filter((name) => typeof scripts[name] === "string");
}

function agentsDoc(
  appDir: string,
  routes: Awaited<ReturnType<typeof routeEntries>> | null,
  mcp: boolean,
): string {
  const pkg = readJson(join(appDir, "package.json"));
  const name = typeof pkg?.name === "string" ? pkg.name : "Ramonyx app";
  const scripts = packageScripts(appDir);
  const commandLines =
    scripts.length === 0
      ? ["- `pnpm dev` — Vite + SSR (or your package manager equivalent)."]
      : [
          `- \`${scripts.includes("dev") ? "pnpm dev" : "npm run dev"}\` — Vite + SSR.`,
          ...(scripts.includes("build")
            ? [`- \`${scripts.includes("dev") ? "pnpm" : "npm"} build\` — client + server build.`]
            : []),
          ...(scripts.includes("start")
            ? [
                `- \`${scripts.includes("dev") ? "pnpm" : "npm"} start\` — production server (\`NODE_ENV=production\`).`,
              ]
            : []),
          ...(scripts.includes("test")
            ? [`- \`${scripts.includes("dev") ? "pnpm" : "npm"} test\` — application tests.`]
            : []),
        ];
  const pages = routes?.pages.slice(0, 60) ?? [];
  const api = routes?.api.slice(0, 60) ?? [];
  const routeLines =
    pages.length === 0 && api.length === 0
      ? ["- (No routes detected yet; create `src/routes/page.tsx`.)"]
      : [
          ...pages.map(
            (page) =>
              `- \`${page.path}\` — \`${page.file}\`${page.loader || page.action ? ` [${[page.loader ? "loader" : "", page.action ? "action" : ""].filter(Boolean).join("+")}]` : ""}`,
          ),
          ...api.map(
            (route) =>
              `- \`${route.path}\` — API ${route.methods.join("/") || "?"} — \`${route.file}\``,
          ),
        ];
  return `# Agent guide — ${name}

This project uses Ramonyx (file routing, SSR React, secure defaults). Start with the project
map, then read the relevant source files before changing behavior.

## Commands

${commandLines.join("\n")}

## Project map

- \`src/app.ts\` — \`createApp()\`, middleware, security headers.
- \`src/routes/**/page.tsx\` — pages; \`loader\` for reads, \`action\` for form mutations.
- \`src/routes/api/**\` — API routes; exported HTTP methods become allowed methods.
- \`src/routes/**/middleware.ts\` — per-folder middleware (root → leaf).
- \`ramonyx.config.ts\` — port/host and app options (streaming, validation).

### Routes

${routeLines.join("\n")}

## Rules

- Loaders/actions run on the server. Validate params/query/body at the trust boundary before use.
- Use a page \`action\` for mutations; native form POST must keep working without JavaScript.
- Loader data must be JSON-serializable. Do not import \`node:*\`, databases, or secrets into client
  components/islands; put server-only code in \`*.server.ts\` or API routes.
- Secrets come from env/bindings. Session cookies are \`HttpOnly\`, \`Secure\`, \`SameSite=Lax\`.
- Preserve CSRF, CSP, and security-header middleware. Keep rate limits and body limits in place.
- Do not assume a feature exists: check \`machine/features.json\` or ask the MCP docs server.

## Verification before claiming success

\`\`\`bash
ramonyx check --json     # config, entry, routes, client/server boundaries
ramonyx routes --json    # current page/API manifest
pnpm typecheck           # if the project has it
pnpm test                # if the project has it
\`\`\`

## Framework help

${
  mcp
    ? `Use the Ramonyx MCP server (pinned to this project's version): \`${MCP_PACKAGE}\`.
Tools: \`search_docs\`, \`get_page\`, \`get_feature_status\`, \`get_rules\`, \`list_adrs\`, plus
\`get_project_context\`, \`list_routes\`, \`get_route\`, \`get_recipe\`, \`search_api\`.
Start at [For Agents](https://ramonyx.devmoon.net/docs/for-agents) and
[Recipes](https://ramonyx.devmoon.net/docs/recipes/).`
    : `Docs: https://ramonyx.devmoon.net/docs/for-agents
and https://ramonyx.devmoon.net/docs/recipes/.`
}
`;
}

function applyManaged(existing: string, block: string): string {
  const start = existing.indexOf(MARKER_START);
  const end = existing.indexOf(MARKER_END);
  if (start >= 0 && end > start) {
    const after = existing.slice(end + MARKER_END.length).replace(/^\r?\n/, "");
    return `${existing.slice(0, start)}${block}${after}`;
  }
  return `${existing.trimEnd()}\n\n${block}\n`;
}

function managedBlock(content: string): string {
  return `${MARKER_START}\n${content.trimEnd()}\n${MARKER_END}\n`;
}

function mergeMcpServers(
  existing: Record<string, unknown>,
  command: readonly string[],
  key: "mcpServers" | "mcp",
): Record<string, unknown> {
  const current = existing[key];
  const object =
    typeof current === "object" && current !== null && !Array.isArray(current)
      ? (current as Record<string, unknown>)
      : {};
  const entry =
    key === "mcpServers"
      ? { command: command[0], args: command.slice(1) }
      : { type: "local", command: [...command], enabled: true };
  return { ...existing, [key]: { ...object, ramonyx: entry } };
}

function normalizeAgents(value: readonly string[] | undefined): AiAgent[] {
  if (value === undefined || value.length === 0) {
    return [...ALL_AGENTS];
  }
  const result: AiAgent[] = [];
  for (const raw of value) {
    const name = raw.trim().toLowerCase();
    if (name === "all" || name === "*") {
      return [...ALL_AGENTS];
    }
    if (!(ALL_AGENTS as readonly string[]).includes(name)) {
      throw new Error(`agen tidak dikenal: "${raw}" (pilih ${ALL_AGENTS.join(", ")} atau all)`);
    }
    result.push(name as AiAgent);
  }
  return [...new Set(result)];
}

/** Jalankan `ai init|sync`; tidak menulis bila `dryRun`. */
export async function runAi(options: AiOptions): Promise<AiResult> {
  const appDir = resolve(options.appDir);
  const dryRun = options.dryRun === true;
  const force = options.force === true;
  const useMcp = options.mcp !== false;
  const agents = normalizeAgents(options.agents);
  const version = pinnedVersion(appDir);
  const command = useMcp ? ["npx", "-y", `${MCP_PACKAGE}@${version}`, "--app", "."] : null;
  const files: AiFileResult[] = [];
  const warnings: string[] = [];

  let routes: Awaited<ReturnType<typeof routeEntries>> | null = null;
  try {
    routes = await routeEntries(appDir);
  } catch (error) {
    warnings.push(
      `Tidak dapat memindai route (${error instanceof Error ? error.message : String(error)}); ` +
        "peta route memakai placeholder. Jalankan `ramonyx check --json` setelah memperbaiki config.",
    );
  }

  const doc = managedBlock(agentsDoc(appDir, routes, useMcp));
  const agentsPath = join(appDir, "AGENTS.md");
  const existingAgents = read(agentsPath);
  if (existingAgents === null) {
    write(agentsPath, doc, dryRun);
    files.push({ path: "AGENTS.md", action: dryRun ? "would-create" : "created" });
  } else if (existingAgents.includes(MARKER_START)) {
    const next = applyManaged(existingAgents, doc);
    if (next === existingAgents) {
      files.push({ path: "AGENTS.md", action: "unchanged" });
    } else {
      write(agentsPath, next, dryRun);
      files.push({ path: "AGENTS.md", action: dryRun ? "would-update" : "updated" });
    }
  } else if (force) {
    write(agentsPath, doc, dryRun);
    files.push({ path: "AGENTS.md", action: dryRun ? "would-update" : "updated" });
  } else {
    files.push({
      path: "AGENTS.md",
      action: "skipped",
      reason: "berkas sudah ada tanpa marker ramonyx; pakai --force untuk menimpa",
    });
    warnings.push("AGENTS.md sudah ada tanpa blok terkelola; tidak diubah.");
  }

  const addNew = (relative: string, content: string): void => {
    const absolute = join(appDir, relative);
    const existing = read(absolute);
    if (existing !== null) {
      if (existing === content) {
        files.push({ path: relative, action: "unchanged" });
      } else if (force) {
        write(absolute, content, dryRun);
        files.push({ path: relative, action: dryRun ? "would-update" : "updated" });
      } else {
        files.push({
          path: relative,
          action: "skipped",
          reason: "berkas sudah ada; pakai --force untuk menimpa",
        });
      }
      return;
    }
    write(absolute, content, dryRun);
    files.push({ path: relative, action: dryRun ? "would-create" : "created" });
  };

  const mergeJson = (relative: string, key: "mcpServers" | "mcp"): void => {
    if (command === null) {
      return;
    }
    const absolute = join(appDir, relative);
    const existing = readJson(absolute);
    if (existing === null && read(absolute) !== null) {
      files.push({
        path: relative,
        action: "skipped",
        reason: "JSON tidak valid; perbaiki manual",
      });
      warnings.push(`${relative} bukan JSON valid; konfigurasi MCP tidak diubah.`);
      return;
    }
    const base =
      existing ??
      (relative === "opencode.json" ? { $schema: "https://opencode.ai/config.json" } : {});
    const next = mergeMcpServers(base, command, key);
    const content = `${JSON.stringify(next, null, 2)}\n`;
    const before = read(absolute);
    if (before === content) {
      files.push({ path: relative, action: "unchanged" });
    } else {
      write(absolute, content, dryRun);
      files.push({
        path: relative,
        action:
          before === null
            ? dryRun
              ? "would-create"
              : "created"
            : dryRun
              ? "would-update"
              : "updated",
      });
    }
  };

  if (agents.includes("claude")) {
    addNew(
      "CLAUDE.md",
      "# Claude Code\n\n@AGENTS.md\n\nUse the Ramonyx MCP server for framework facts; do not guess APIs.\n",
    );
  }
  if (agents.includes("copilot")) {
    addNew(
      ".github/copilot-instructions.md",
      "# Ramonyx app instructions\n\nRead `AGENTS.md` before changing this project. Key rules: server-only\nloaders/actions, validate input at the boundary, keep CSRF/security middleware, and verify with\n`ramonyx check --json` plus the project tests.\n",
    );
  }
  if (agents.includes("cursor")) {
    addNew(
      ".cursor/rules/ramonyx.mdc",
      '---\ndescription: Ramonyx app rules\nglobs: ["src/**/*.ts", "src/**/*.tsx"]\nalwaysApply: true\n---\n\nRead `AGENTS.md`. Keep reads in loaders, mutations in actions, validate at trust boundaries,\nand never import server-only modules into client components.\n',
    );
  }
  if (agents.includes("opencode")) {
    addNew(
      ".opencode/skills/ramonyx/SKILL.md",
      "# Ramonyx skill\n\nUse this skill when working in a Ramonyx app.\n\n1. Read `AGENTS.md` and the target `src/routes/**` module.\n2. Keep reads in `loader` and mutations in `action`; validate at trust boundaries.\n3. Run `ramonyx check --json` and the relevant tests before claiming success.\n4. For framework questions, use MCP `search_docs`/`get_page`/`get_recipe` instead of guessing.\n",
    );
    mergeJson("opencode.json", "mcp");
  }
  if (useMcp) {
    mergeJson(".mcp.json", "mcpServers");
  }

  const ok = warnings.length === 0;
  return {
    schemaVersion: 1,
    ok,
    appDir,
    mode: options.mode,
    mcp: command === null ? null : { package: MCP_PACKAGE, version, command },
    files,
    warnings,
  };
}
