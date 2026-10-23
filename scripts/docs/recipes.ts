// Generator machine layer resep (AI-ready DX) — hanya dari `docs/public/recipes/*.md`.
//
// Frontmatter yang dibaca (bukan YAML penuh):
//   recipe: page-loader            (wajib, unik)
//   title: ...                     (wajib)
//   summary: ...                   (wajib)
//   when: ...                      (wajib)
//   files: a.ts, b.tsx             (opsional, dipisah koma)
//   verify: ramonyx check --json   (wajib)
//
// Keluaran deterministik (selain `generatedAt`) agar kesegaran bisa divalidasi.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const RECIPE_DIR = join(ROOT, "docs/public/recipes");

export interface RecipeEntry {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly when: string;
  readonly files: readonly string[];
  readonly verify: string;
  readonly slug: string;
  readonly docs: string;
}

export interface RecipeIndex {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly recipes: readonly RecipeEntry[];
}

function frontmatter(source: string): Record<string, string> {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(source);
  if (match === null) {
    return {};
  }
  const result: Record<string, string> = {};
  for (const line of (match[1] ?? "").split("\n")) {
    const pair = /^([a-zA-Z-]+):\s*(.*)$/.exec(line);
    if (pair?.[1] === undefined) {
      continue;
    }
    let value = (pair[2] ?? "").trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    }
    result[pair[1]] = value;
  }
  return result;
}

function list(value: string | undefined): string[] {
  if (value === undefined || value.trim().length === 0) {
    return [];
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function generateRecipes(): RecipeIndex {
  const recipes: RecipeEntry[] = [];
  for (const file of readdirSync(RECIPE_DIR).sort()) {
    if (!file.endsWith(".md") || file === "index.md") {
      continue;
    }
    const source = readFileSync(join(RECIPE_DIR, file), "utf8");
    const meta = frontmatter(source);
    const id = (meta.recipe ?? "").trim();
    const title = (meta.title ?? "").trim();
    const summary = (meta.summary ?? "").trim();
    const when = (meta.when ?? "").trim();
    const verify = (meta.verify ?? "").trim();
    if (!/^[a-z0-9-]+$/.test(id)) {
      throw new Error(`recipes/${file}: frontmatter \`recipe\` wajib cocok ^[a-z0-9-]+$`);
    }
    for (const [key, value] of [
      ["title", title],
      ["summary", summary],
      ["when", when],
      ["verify", verify],
    ] as const) {
      if (value.length < 3) {
        throw new Error(`recipes/${file}: frontmatter \`${key}\` wajib (min 3 karakter)`);
      }
    }
    recipes.push({
      id,
      title,
      summary,
      when,
      files: list(meta.files),
      verify,
      slug: `recipes/${id}`,
      docs: `docs/public/recipes/${file}`,
    });
  }
  recipes.sort((a, b) => a.id.localeCompare(b.id));
  if (recipes.length === 0) {
    throw new Error("docs/public/recipes: tidak ada resep");
  }
  const seen = new Set<string>();
  for (const recipe of recipes) {
    if (seen.has(recipe.id)) {
      throw new Error(`recipes: id duplikat "${recipe.id}"`);
    }
    seen.add(recipe.id);
  }
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    recipes,
  };
}
