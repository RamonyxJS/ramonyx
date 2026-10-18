// Generator cli.json — menjalankan `ramonyx help` (CLI sungguhan) dan mem-parse outputnya (ADR-0054).
// Sumber kebenaran = kode CLI; berkas ini hanya cermin yang divalidasi kesegarannya.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

export interface CliCommand {
  name: string;
  summary: string;
}

export interface CliFlag {
  flag: string;
  argument: string | null;
  description: string;
}

export interface CliReference {
  schemaVersion: 1;
  generatedAt: string;
  usage: string;
  commands: CliCommand[];
  flags: CliFlag[];
}

export function generateCli(): CliReference {
  const usage = execFileSync(
    process.execPath,
    ["--import", "./tools/register.mjs", "packages/devtools/src/cli.ts", "help"],
    { cwd: ROOT, encoding: "utf8" },
  );

  const commands: CliCommand[] = [];
  const flags: CliFlag[] = [];
  for (const line of usage.split("\n")) {
    const commandMatch = line.match(/^\s{2}ramonyx (\w+)\s{2,}(.+)$/);
    if (commandMatch?.[1] && commandMatch[2]) {
      commands.push({ name: commandMatch[1], summary: commandMatch[2].trim() });
      continue;
    }
    const flagMatch = line.match(/^\s{2}(--[\w-]+)(?: (<[^>]+>))?\s{2,}(.+)$/);
    if (flagMatch?.[1] && flagMatch[3]) {
      flags.push({
        flag: flagMatch[1],
        argument: flagMatch[2]?.replace(/[<>]/g, "") ?? null,
        description: flagMatch[3].trim(),
      });
    }
  }

  if (commands.length === 0) {
    throw new Error("Tidak ada perintah yang terbaca dari `ramonyx help`");
  }

  return { schemaVersion: 1, generatedAt: new Date().toISOString(), usage, commands, flags };
}
