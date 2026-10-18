#!/usr/bin/env node
// Bin CLI `ramonyx` (ADR-0053). Shebang dipertahankan saat kompilasi rilis (tsc).
import { runCli } from "./commands.ts";

process.exitCode = await runCli(process.argv.slice(2));
