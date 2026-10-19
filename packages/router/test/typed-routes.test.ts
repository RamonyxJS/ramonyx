import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { fillHref } from "../src/index.ts";

test("fillHref: bangun URL dari pola + params (runtime)", () => {
  assert.equal(fillHref("/users/[id]", { id: "42" }), "/users/42");
  assert.equal(fillHref("/blog/[...slug]", { slug: "a/b" }), "/blog/a/b");
  assert.equal(fillHref("/tentang"), "/tentang");
  assert.throws(() => fillHref("/users/[id]"), /param kurang/, "param kurang → error runtime");
});

const workDir = fileURLToPath(new URL("../.tmp-test/typed-routes", import.meta.url));
const root = fileURLToPath(new URL("../../..", import.meta.url));

// Modul generate disimulasikan (bentuk sama dengan `generateRouteTypes` — ADR-0073):
// aplikasi mengimpor `routeHref` dari modul generate via path relatif (tanpa augmentasi modul,
// yang tidak merge di TS 7 untuk modul paket).
const MODUL_GENERATE = `import { fillHref } from "@ramonyx/router";

export type RouteParamsMap = {
  "/users/[id]": { id: string };
  "/tentang": undefined;
};

export type RoutePath = keyof RouteParamsMap;

export function routeHref<P extends RoutePath>(
  path: P,
  ...args: RouteParamsMap[P] extends undefined ? [] : [params: RouteParamsMap[P]]
): string {
  return fillHref(path, args[0] as Record<string, string> | undefined);
}
`;

test("typed routes: typecheck menerima pemakaian benar & menolak param/pola salah", () => {
  rmSync(workDir, { recursive: true, force: true });
  mkdirSync(workDir, { recursive: true });

  writeFileSync(`${workDir}/routes.ts`, MODUL_GENERATE);
  writeFileSync(
    `${workDir}/tsconfig.json`,
    JSON.stringify(
      {
        extends: "../../../../tsconfig.json",
        compilerOptions: { noEmit: true },
        include: ["."],
      },
      null,
      2,
    ),
  );

  const jalankanTsc = (): { ok: boolean; output: string } => {
    try {
      execFileSync("pnpm", ["exec", "tsc", "--project", `${workDir}/tsconfig.json`], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      return { ok: true, output: "" };
    } catch (error) {
      const failure = error as { stdout?: string; stderr?: string };
      return { ok: false, output: `${failure.stdout ?? ""}${failure.stderr ?? ""}` };
    }
  };

  try {
    // Positif: pola benar + params lengkap.
    writeFileSync(
      `${workDir}/benar.ts`,
      'import { routeHref } from "./routes.ts";\nconst url: string = routeHref("/users/[id]", { id: "42" });\nconst home: string = routeHref("/tentang");\nconsole.log(url, home);\n',
    );
    const positif = jalankanTsc();
    assert.ok(positif.ok, `pemakaian benar harus lolos: ${positif.output}`);

    // Negatif 1: nama param salah.
    writeFileSync(
      `${workDir}/benar.ts`,
      'import { routeHref } from "./routes.ts";\nconst url = routeHref("/users/[id]", { salah: "42" });\nconsole.log(url);\n',
    );
    const negatif1 = jalankanTsc();
    assert.ok(!negatif1.ok, "param salah harus gagal typecheck");
    assert.ok(
      /does not exist in type|not assignable/.test(negatif1.output),
      `error menunjuk ketidakcocokan params: ${negatif1.output}`,
    );

    // Negatif 2: pola tidak dikenal.
    writeFileSync(
      `${workDir}/benar.ts`,
      'import { routeHref } from "./routes.ts";\nconst url = routeHref("/tidak-ada");\nconsole.log(url);\n',
    );
    const negatif2 = jalankanTsc();
    assert.ok(!negatif2.ok, "pola tak dikenal harus gagal typecheck");
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
});
