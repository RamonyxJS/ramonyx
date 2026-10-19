// Generator semua artefak turunan (ADR-0054): api.json, cli.json, llms.txt, llms-full.txt, TODO.md.
// `stats.json` terpisah (menjalankan suite): `pnpm docs:stats`.
// Setelah ini selalu jalankan `pnpm docs:validate`.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { generateApi } from "./api.ts";
import { generateCli } from "./cli.ts";
import { generateLlms } from "./llms.ts";
import { generateTodoMd } from "./todo.ts";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

const api = generateApi();
writeFileSync(`${ROOT}docs/public/machine/api.json`, `${JSON.stringify(api, null, 2)}\n`);
console.log(`✓ api.json (${api.packages.length} paket)`);

const cli = generateCli();
writeFileSync(`${ROOT}docs/public/machine/cli.json`, `${JSON.stringify(cli, null, 2)}\n`);
console.log(`✓ cli.json (${cli.commands.length} perintah, ${cli.flags.length} flag)`);

const llms = generateLlms();
writeFileSync(`${ROOT}docs/public/machine/llms.txt`, llms.llms);
writeFileSync(`${ROOT}docs/public/machine/llms-full.txt`, llms.llmsFull);
console.log(`✓ llms.txt (${llms.llms.length} byte) + llms-full.txt (${llms.llmsFull.length} byte)`);

const todo = JSON.parse(readFileSync(`${ROOT}TODO.json`, "utf8")) as never;
writeFileSync(`${ROOT}TODO.md`, generateTodoMd(todo));
console.log("✓ TODO.md");
