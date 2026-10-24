// Package-manager commands shared by the docs renderer and the client picker.
// Keep this module free of React/DOM imports so markdown rendering can use it on the server.

export type ManagerId = "npm" | "pnpm" | "yarn" | "bun";

export interface Manager {
  readonly id: ManagerId;
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

export const MANAGER_IDS = MANAGERS.map((manager) => manager.id);

export function isManagerId(value: string | null | undefined): value is ManagerId {
  return value === "npm" || value === "pnpm" || value === "yarn" || value === "bun";
}

type Variants = Record<ManagerId, string>;

function withComment(command: string, comment: string): string {
  return comment.length === 0 ? command : `${command}${comment}`;
}

function splitArgs(rest: string): { command: string; args: string; comment: string } {
  const commentIndex = rest.search(/\s+#/);
  const comment = commentIndex < 0 ? "" : rest.slice(commentIndex);
  const commandPart = commentIndex < 0 ? rest : rest.slice(0, commentIndex);
  const trimmed = commandPart.trim();
  const space = trimmed.indexOf(" ");
  return {
    command: space < 0 ? trimmed : trimmed.slice(0, space),
    args: space < 0 ? "" : trimmed.slice(space + 1),
    comment,
  };
}

function scriptVariants(script: string, args: string): Variants {
  const suffix = args.length === 0 ? "" : ` ${args}`;
  return {
    npm: script === "start" ? `npm start${suffix}` : `npm run ${script}${suffix}`,
    pnpm: `pnpm ${script}${suffix}`,
    yarn: `yarn ${script}${suffix}`,
    bun: `bun run ${script}${suffix}`,
  };
}

function installVariants(args: string): Variants {
  const suffix = args.length === 0 ? "" : ` ${args}`;
  return {
    npm: `npm install${suffix}`,
    pnpm: args.length === 0 ? "pnpm install" : `pnpm add${suffix}`,
    yarn: args.length === 0 ? "yarn" : `yarn add${suffix}`,
    bun: args.length === 0 ? "bun install" : `bun add${suffix}`,
  };
}

function removeVariants(args: string): Variants {
  const suffix = args.length === 0 ? "" : ` ${args}`;
  return {
    npm: `npm uninstall${suffix}`,
    pnpm: `pnpm remove${suffix}`,
    yarn: `yarn remove${suffix}`,
    bun: `bun remove${suffix}`,
  };
}

function runnerVariants(args: string, pnpmDlx: boolean): Variants {
  const suffix = args.length === 0 ? "" : ` ${args}`;
  return {
    npm: `npx${suffix}`,
    pnpm: pnpmDlx ? `pnpm dlx${suffix}` : `pnpm exec${suffix}`,
    yarn: pnpmDlx ? `yarn dlx${suffix}` : `yarn${suffix}`,
    bun: `bunx${suffix}`,
  };
}

function createVariants(args: string): Variants {
  const suffix = args.length === 0 ? "" : ` ${args}`;
  return {
    npm: `npm create${suffix}`,
    pnpm: `pnpm create${suffix}`,
    yarn: `yarn create${suffix}`,
    bun: `bun create${suffix}`,
  };
}

function testVariants(args: string): Variants {
  const suffix = args.length === 0 ? "" : ` ${args}`;
  return {
    npm: `npm test${suffix}`,
    pnpm: `pnpm test${suffix}`,
    yarn: `yarn test${suffix}`,
    bun: `bun run test${suffix}`,
  };
}

function auditVariants(args: string): Variants {
  const suffix = args.length === 0 ? "" : ` ${args}`;
  return {
    npm: `npm audit${suffix}`,
    pnpm: `pnpm audit${suffix}`,
    yarn: `yarn audit${suffix}`,
    bun: `bun audit${suffix}`,
  };
}

function lineVariants(line: string): Variants | null {
  const match = /^(\s*)(npm|pnpm|yarn|bun|npx)\b(.*)$/.exec(line);
  if (match === null) return null;
  const indent = match[1] ?? "";
  const manager = match[2] ?? "";
  const rest = match[3] ?? "";
  const { command, args, comment } = splitArgs(rest);

  let variants: Variants | null = null;
  if (manager === "npx") {
    variants = runnerVariants(`${command}${args.length === 0 ? "" : ` ${args}`}`.trim(), true);
  } else if (manager === "npm") {
    if (command === "install" || command === "i" || command === "add") {
      variants = installVariants(args);
    } else if (command === "uninstall" || command === "remove") {
      variants = removeVariants(args);
    } else if (command === "run") {
      const [script = "", ...tail] = args.split(/\s+/);
      variants = scriptVariants(script, tail.join(" "));
    } else if (command === "exec") {
      variants = runnerVariants(args, false);
    } else if (command === "create") {
      variants = createVariants(args);
    } else if (command === "test") {
      variants = testVariants(args);
    } else if (command === "audit") {
      variants = auditVariants(args);
    } else if (command === "start") {
      variants = scriptVariants("start", args);
    } else if (command.length > 0 && !command.startsWith("-")) {
      variants = scriptVariants(command, args);
    }
  } else if (manager === "pnpm") {
    if (command === "install" || command === "i") {
      variants = installVariants("");
    } else if (command === "add") {
      variants = installVariants(args);
    } else if (command === "remove" || command === "rm") {
      variants = removeVariants(args);
    } else if (command === "exec") {
      variants = runnerVariants(args, false);
    } else if (command === "dlx") {
      variants = runnerVariants(args, true);
    } else if (command === "create") {
      variants = createVariants(args);
    } else if (command === "test") {
      variants = testVariants(args);
    } else if (command === "audit") {
      variants = auditVariants(args);
    } else if (command === "start") {
      variants = scriptVariants("start", args);
    } else if (command.length > 0 && !command.startsWith("-")) {
      variants = scriptVariants(command, args);
    }
  } else if (manager === "yarn") {
    if (command.length === 0 || command === "install") {
      variants = installVariants("");
    } else if (command === "add") {
      variants = installVariants(args);
    } else if (command === "remove") {
      variants = removeVariants(args);
    } else if (command === "dlx") {
      variants = runnerVariants(args, true);
    } else if (command === "create") {
      variants = createVariants(args);
    } else if (command === "test") {
      variants = testVariants(args);
    } else if (command === "audit") {
      variants = auditVariants(args);
    } else if (command === "start") {
      variants = scriptVariants("start", args);
    } else if (command === "run") {
      const [script = "", ...tail] = args.split(/\s+/);
      variants = scriptVariants(script, tail.join(" "));
    } else if (command.length > 0) {
      variants = scriptVariants(command, args);
    }
  } else if (manager === "bun") {
    if (command === "install" || command === "i") {
      variants = installVariants("");
    } else if (command === "add") {
      variants = installVariants(args);
    } else if (command === "remove" || command === "rm") {
      variants = removeVariants(args);
    } else if (command === "run") {
      const [script = "", ...tail] = args.split(/\s+/);
      variants = scriptVariants(script, tail.join(" "));
    } else if (command === "x" || command === "bunx") {
      variants = runnerVariants(args, true);
    } else if (command === "create") {
      variants = createVariants(args);
    } else if (command === "test") {
      variants = testVariants(args);
    } else if (command === "audit") {
      variants = auditVariants(args);
    } else if (command === "start") {
      variants = scriptVariants("start", args);
    } else if (command.length > 0 && !command.startsWith("-")) {
      variants = scriptVariants(command, args);
    }
  }

  if (variants === null) return null;
  return {
    npm: `${indent}${withComment(variants.npm, comment)}`,
    pnpm: `${indent}${withComment(variants.pnpm, comment)}`,
    yarn: `${indent}${withComment(variants.yarn, comment)}`,
    bun: `${indent}${withComment(variants.bun, comment)}`,
  };
}

/** Return one variant per manager, or null when the block has no package-manager command. */
export function managerVariants(text: string): Variants | null {
  let found = false;
  const result: Variants = { npm: "", pnpm: "", yarn: "", bun: "" };
  const lines = text.split("\n");
  for (const line of lines) {
    const variants = lineVariants(line);
    if (variants === null) {
      for (const id of MANAGER_IDS) result[id] += `${line}\n`;
    } else {
      found = true;
      for (const id of MANAGER_IDS) result[id] += `${variants[id]}\n`;
    }
  }
  if (!found) return null;
  for (const id of MANAGER_IDS) result[id] = result[id].replace(/\n$/, "");
  return result;
}
