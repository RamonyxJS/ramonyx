import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { LoadedPage } from "@ramonyx/core";
import { lintClientBoundaries } from "../src/index.ts";

function page(file: string): LoadedPage {
  return { path: "/", page: {}, layouts: [], directory: "/tmp", pageFile: file };
}

test("lint boundaries: node builtin + server-only; *.server.ts tetap diizinkan", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ramonyx-boundary-"));
  try {
    const nodeFile = join(dir, "page.ts");
    const serverFile = join(dir, "server-page.ts");
    const layoutFile = join(dir, "layout.tsx");
    await writeFile(nodeFile, 'import { readFile } from "node:fs/promises";\nexport default 1;\n');
    await writeFile(serverFile, 'import { db } from "./db.server.ts";\nexport default db;\n');
    await writeFile(layoutFile, 'import "server-only";\nexport default 1;\n');
    const violations = await lintClientBoundaries([
      page(nodeFile),
      { ...page(serverFile), layoutFiles: [layoutFile] },
    ]);
    assert.deepEqual(violations.map((violation) => violation.reason).sort(), [
      "node-builtin",
      "server-only",
    ]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("lint boundaries: impor node transitif dari komponen ikut dilaporkan", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ramonyx-boundary-"));
  try {
    const pageFile = join(dir, "page.tsx");
    const cardFile = join(dir, "card.tsx");
    const serverFile = join(dir, "db.server.ts");
    await writeFile(
      pageFile,
      'import { Card } from "./card.tsx";\nexport default function Page() { return Card; }\n',
    );
    await writeFile(
      cardFile,
      'import { readFile } from "node:fs/promises";\nimport { db } from "./db.server.ts";\nexport function Card() { return [readFile, db]; }\n',
    );
    await writeFile(
      serverFile,
      'import { readFile } from "node:fs/promises";\nexport const db = readFile;\n',
    );

    const violations = await lintClientBoundaries([page(pageFile)]);
    assert.deepEqual(
      violations.map((violation) => ({
        file: violation.file,
        specifier: violation.specifier,
        reason: violation.reason,
      })),
      [{ file: cardFile, specifier: "node:fs/promises", reason: "node-builtin" }],
      "hanya file penyebab yang dilaporkan; db.server.ts tidak ditelusuri",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("lint boundaries: impor aman dan komentar tidak dilaporkan", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ramonyx-boundary-"));
  try {
    const file = join(dir, "page.ts");
    await writeFile(
      file,
      '// import { x } from "node:fs";\nimport { Link } from "@ramonyx/react";\nexport default 1;\n',
    );
    const violations = await lintClientBoundaries([page(file)]);
    assert.deepEqual(violations, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
