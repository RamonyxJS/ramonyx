/**
 * Loader dev/test: transform .ts/.tsx (dan .mts/.cts/.jsx) memakai esbuild,
 * dengan JSX automatic runtime (`react-jsx`).
 *
 * Alasan tidak memakai tsx: tsx 4.23.15 tidak menghormati `compilerOptions.jsx`
 * dari tsconfig (JSX keluar sebagai `React.createElement` tanpa impor).
 * Vite tetap rencana untuk bundling/dev server (ADR-0005).
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { transform } from "esbuild";

const TRANSFORMED = /\.(ts|tsx|mts|cts|jsx)$/;

export async function load(url, context, nextLoad) {
  if (!url.startsWith("file:") || !TRANSFORMED.test(url)) {
    return nextLoad(url, context);
  }

  const path = fileURLToPath(url);
  const source = await readFile(path, "utf8");
  const loader = url.endsWith(".tsx") || url.endsWith(".jsx") ? "tsx" : "ts";

  const result = await transform(source, {
    loader,
    format: "esm",
    target: "es2023",
    sourcefile: path,
    tsconfigRaw: {
      compilerOptions: {
        jsx: "react-jsx",
        jsxImportSource: "react",
      },
    },
  });

  return { format: "module", source: result.code, shortCircuit: true };
}
