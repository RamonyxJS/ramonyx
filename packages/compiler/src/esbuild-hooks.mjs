/**
 * Hook loader (worker thread `node:module`): transform .ts/.tsx/.mts/.cts/.jsx memakai esbuild
 * dengan JSX automatic runtime (`react-jsx`). Dipasang oleh `register.mjs` —
 * padanan loader repo (`tools/register.mjs`) untuk aplikasi hasil instalasi npm (ADR-0049).
 *
 * Catatan: hanya transform, tanpa bundling — berkas .js/.mjs (mis. `vite`, `react`) lewat
 * apa adanya. Perubahan di sini sebaiknya juga dicerminkan di `tools/esbuild-loader.mjs`.
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
