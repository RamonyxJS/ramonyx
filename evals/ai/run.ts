// Harness eval AI deterministik (AI-ready DX).
//
// Setiap task = fixture + prompt + hidden-test. Mode bawaan memakai solusi referensi untuk
// memastikan harness hijau; `--solution empty` memastikan hidden-test benar-benar menangkap
// kegagalan. Dengan `--agent "<command>"` harness menjalankan agen nyata di workdir lalu
// menjalankan `ramonyx check` + hidden-test. **Tidak ada LLM judge** — hanya exit code.

import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const TASKS = join(HERE, "tasks");
const LOADER = join(ROOT, "tools", "register.mjs");
const CLI = join(ROOT, "packages", "devtools", "src", "cli.ts");

interface Task {
  readonly id: string;
  readonly title: string;
  readonly prompt: string;
  readonly recipe?: string;
  readonly hidden: string;
}

interface CommandResult {
  readonly ok: boolean;
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

interface TaskResult {
  readonly id: string;
  readonly title: string;
  readonly ok: boolean;
  readonly check: CommandResult;
  readonly hidden: CommandResult;
  readonly agent?: CommandResult;
}

interface Report {
  readonly schemaVersion: 1;
  readonly solution: string;
  readonly tasks: readonly TaskResult[];
  readonly summary: { readonly passed: number; readonly total: number };
}

interface Options {
  readonly solution: "reference" | "empty";
  readonly agent?: string;
  readonly tasks: readonly string[];
  readonly keep: boolean;
  readonly json: boolean;
  readonly brief: boolean;
  readonly out?: string;
  readonly work: string;
}

function parse(argv: readonly string[]): Options {
  let solution: "reference" | "empty" = "reference";
  let agent: string | undefined;
  let keep = false;
  let json = false;
  let brief = false;
  let out: string | undefined;
  let work = join(HERE, ".work");
  const tasks: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--solution": {
        const value = argv[++index];
        if (value !== "reference" && value !== "empty") {
          throw new Error("--solution harus reference atau empty");
        }
        solution = value;
        break;
      }
      case "--agent":
        agent = argv[++index];
        if (agent === undefined || agent.length === 0) {
          throw new Error("--agent butuh perintah shell");
        }
        break;
      case "--task": {
        const value = argv[++index];
        if (value === undefined || value.length === 0) {
          throw new Error("--task butuh id");
        }
        tasks.push(value);
        break;
      }
      case "--out":
        out = resolve(argv[++index] ?? "");
        break;
      case "--work":
        work = resolve(argv[++index] ?? "");
        break;
      case "--keep":
        keep = true;
        break;
      case "--json":
        json = true;
        break;
      case "--brief":
        brief = true;
        break;
      case "--help":
      case "-h":
        console.log(
          `pnpm eval:ai [--solution reference|empty] [--agent "<cmd>"] ` +
            `[--task <id>] [--keep] [--json] [--brief] [--out <file>]`,
        );
        process.exit(0);
        break;
      default:
        throw new Error(`argumen tidak dikenal: ${arg}`);
    }
  }
  return { solution, agent, tasks, keep, json, brief, out, work };
}

function command(
  command: string,
  args: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): CommandResult {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    timeout: 180_000,
  });
  return {
    ok: result.status === 0,
    code: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? result.error?.message ?? "",
  };
}

function overlay(source: string, destination: string): void {
  if (existsSync(source)) {
    cpSync(source, destination, { recursive: true });
  }
}

function readTask(directory: string): Task {
  const raw = JSON.parse(readFileSync(join(directory, "task.json"), "utf8")) as Partial<Task>;
  for (const field of ["id", "title", "prompt", "hidden"] as const) {
    if (typeof raw[field] !== "string" || (raw[field] as string).length === 0) {
      throw new Error(`${directory}/task.json: field ${field} wajib`);
    }
  }
  return raw as Task;
}

function short(result: CommandResult, work: string, brief = false): CommandResult {
  const limit = 4_000;
  const normalize = (value: string): string =>
    value.split(work).join("<app>").split(`${ROOT}/`).join("");
  if (brief) {
    return { ...result, stdout: "", stderr: "" };
  }
  return {
    ...result,
    stdout:
      normalize(result.stdout).length > limit
        ? `${normalize(result.stdout).slice(0, limit)}…`
        : normalize(result.stdout),
    stderr:
      normalize(result.stderr).length > limit
        ? `${normalize(result.stderr).slice(0, limit)}…`
        : normalize(result.stderr),
  };
}

function runTask(task: Task, options: Options): TaskResult {
  const source = join(TASKS, task.id);
  const work = join(options.work, task.id);
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  cpSync(join(HERE, "fixtures", "basic"), work, { recursive: true });
  overlay(join(source, "fixture"), work);
  if (options.solution === "reference") {
    overlay(join(source, "solution"), work);
  }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    EVAL_APP: work,
    EVAL_TASK_ID: task.id,
    EVAL_PROMPT: task.prompt,
    EVAL_WORKDIR: work,
  };
  let agent: CommandResult | undefined;
  if (options.agent !== undefined) {
    const result = spawnSync(options.agent, {
      cwd: work,
      env,
      shell: true,
      encoding: "utf8",
      timeout: 600_000,
    });
    agent = {
      ok: result.status === 0,
      code: result.status,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? result.error?.message ?? "",
    };
  }

  const check = command(
    process.execPath,
    ["--import", LOADER, CLI, "check", "--json", "--app", work],
    work,
    env,
  );
  const hidden = command(
    process.execPath,
    [
      "--import",
      LOADER,
      "--test",
      "--test-timeout=30000",
      "--test-force-exit",
      join(source, task.hidden),
    ],
    ROOT,
    env,
  );

  if (!options.keep) {
    rmSync(work, { recursive: true, force: true });
  }
  return {
    id: task.id,
    title: task.title,
    ok: check.ok && hidden.ok && (agent === undefined || agent.ok),
    check: short(check, work, options.brief),
    hidden: short(hidden, work, options.brief),
    ...(agent === undefined ? {} : { agent: short(agent, work, options.brief) }),
  };
}

function main(): void {
  const options = parse(process.argv.slice(2));
  const directories = readdirSync(TASKS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(TASKS, entry.name));
  const tasks = directories
    .map(readTask)
    .filter((task) => options.tasks.length === 0 || options.tasks.includes(task.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (tasks.length === 0) {
    throw new Error("tidak ada task; periksa --task");
  }

  const results = tasks.map((task) => runTask(task, options));
  const report: Report = {
    schemaVersion: 1,
    solution: options.agent === undefined ? options.solution : "agent",
    tasks: results,
    summary: {
      passed: results.filter((result) => result.ok).length,
      total: results.length,
    },
  };

  if (options.out !== undefined) {
    mkdirSync(dirname(options.out), { recursive: true });
    writeFileSync(options.out, `${JSON.stringify(report, null, 2)}\n`);
  }
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    for (const result of results) {
      console.log(`${result.ok ? "✓" : "✗"} ${result.id} — ${result.title}`);
      if (!result.ok) {
        if (!result.check.ok) {
          console.log("  ramonyx check gagal:");
          console.log(
            `  ${(result.check.stdout || result.check.stderr).trim().split("\n").join("\n  ")}`,
          );
        }
        if (!result.hidden.ok) {
          console.log("  hidden-test gagal:");
          console.log(
            `  ${(result.hidden.stdout || result.hidden.stderr).trim().split("\n").join("\n  ")}`,
          );
        }
        if (result.agent !== undefined && !result.agent.ok) {
          console.log("  agen keluar non-zero:");
          console.log(
            `  ${(result.agent.stderr || result.agent.stdout).trim().split("\n").join("\n  ")}`,
          );
        }
      }
    }
    console.log(
      `\n${report.summary.passed}/${report.summary.total} task lulus (${report.solution})`,
    );
  }
  if (report.summary.passed !== report.summary.total) {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error(`eval: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
