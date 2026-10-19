#!/usr/bin/env node
// Gate kebijakan konten (ADR-0082): build publik tidak boleh memuat dokumen internal.
//
// Memeriksa:
//  1. Sumber: tidak ada tautan dari docs/public/** ke docs/internal/**.
//  2. Ekspor statis (apps/docs/dist/static, bila ada): penanda internal di HTML/JS/JSON,
//     llms.txt hanya path publik, sitemap tanpa slug internal, indeks pencarian publik.
//  3. Tarball MCP (dist/npm/ramonyx-mcp-docs-server-*.tgz, bila ada): hanya docs publik.
//
// Jalankan: node scripts/verify-no-leak.mjs

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const publik = join(root, "docs", "public");
const internal = join(root, "docs", "internal");
const dist = join(root, "apps", "docs", "dist", "static");
const npmDir = join(root, "dist", "npm");

const PENANDA = [
  "IMPLEMENTATION_STATUS",
  "PLAN-docs",
  "threat-model",
  "asvs-mapping",
  "plugin-isolation-assessment",
  "docs/internal",
  "PRD.md",
  "BLUEPRINT.md",
];

const masalah = [];
const gagal = (pesan) => masalah.push(pesan);

function walk(dir, filter, found = []) {
  if (!existsSync(dir)) {
    return found;
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(path, filter, found);
    } else if (filter(path)) {
      found.push(path);
    }
  }
  return found;
}

// 1. Tautan sumber publik → internal
for (const file of walk(publik, (p) => p.endsWith(".md"))) {
  const sumber = readFileSync(file, "utf8").replace(/```[\s\S]*?```/g, "");
  for (const match of sumber.matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = match[1] ?? "";
    if (target.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(target)) {
      continue;
    }
    const resolved = resolve(file, "..", target.split("#")[0] ?? "");
    if (resolved.startsWith(internal)) {
      gagal(`tautan publik → internal: ${relative(root, file)} → ${target}`);
    }
  }
}

// 2. Ekspor statis
if (existsSync(dist)) {
  const fileTeks = walk(dist, (p) => /\.(html|js|json|txt|md|xml)$/.test(p));
  for (const file of fileTeks) {
    const isi = readFileSync(file, "utf8");
    for (const penanda of PENANDA) {
      if (isi.includes(penanda)) {
        gagal(`penanda internal "${penanda}" di ${relative(root, file)}`);
      }
    }
  }

  // slug internal tidak boleh muncul di indeks pencarian
  const indeksPath = join(dist, "api", "indeks");
  if (existsSync(indeksPath)) {
    const indeks = JSON.parse(readFileSync(indeksPath, "utf8"));
    // Setiap entri indeks wajib berupa halaman publik; slug yang HANYA ada di internal ditolak.
    const slugInternal = new Set(
      walk(internal, (p) => p.endsWith(".md")).map((p) =>
        relative(internal, p).split("\\").join("/").replace(/\.md$/, ""),
      ),
    );
    for (const entry of indeks) {
      const berkasPublik = join(publik, `${entry.slug}.md`);
      if (!existsSync(berkasPublik)) {
        gagal(`slug non-publik di indeks pencarian: ${entry.slug}`);
      } else if (slugInternal.has(entry.slug)) {
      }
    }
  }

  // llms.txt: hanya path publik
  const llmsPath = join(dist, "machine", "llms.txt");
  if (existsSync(llmsPath)) {
    const llms = readFileSync(llmsPath, "utf8");
    for (const match of llms.matchAll(/docs\/([^\s)#]+)/g)) {
      const slug = (match[1] ?? "").replace(/\/$/, "").replace(/\.md$/, "");
      if (slug.length === 0) continue;
      if (!existsSync(join(publik, `${slug}.md`))) {
        gagal(`llms.txt menautkan halaman publik yang tidak ada: docs/${slug}`);
      }
    }
  }

  // sitemap: tanpa alias legacy
  const sitemapPath = join(dist, "sitemap.xml");
  if (existsSync(sitemapPath)) {
    const sitemap = readFileSync(sitemapPath, "utf8");
    if (sitemap.includes("/dokumen/")) {
      gagal("sitemap.xml memuat alias legacy /dokumen/");
    }
  }
} else {
  console.log("• ekspor statis belum ada (lewati pemeriksaan dist) — jalankan pnpm docs:export");
}

// 3. Tarball MCP
if (existsSync(npmDir)) {
  const tarball = readdirSync(npmDir).find(
    (file) => file.startsWith("ramonyx-mcp-docs-server-") && file.endsWith(".tgz"),
  );
  if (tarball !== undefined) {
    const { execFileSync } = await import("node:child_process");
    const daftar = execFileSync("tar", ["-tzf", join(npmDir, tarball)], { encoding: "utf8" });
    const terlarang = [
      "package/docs/PRD.md",
      "package/docs/IMPLEMENTATION_STATUS.md",
      "package/docs/BLUEPRINT.md",
      "package/docs/PLAN-docs-consolidation.md",
      "package/docs/security/threat-model.md",
      "package/docs/security/asvs-mapping.md",
      "package/docs/security/plugin-isolation-assessment.md",
      "package/docs/internal",
    ];
    for (const path of terlarang) {
      if (daftar.split("\n").some((baris) => baris === path || baris.startsWith(`${path}/`))) {
        gagal(`tarball MCP memuat dokumen internal: ${path}`);
      }
    }
  }
}

if (masalah.length === 0) {
  console.log("docs:no-leak OK — tidak ada konten internal di sumber/ekspor/tarball publik.");
  process.exit(0);
}
console.error(`docs:no-leak GAGAL — ${masalah.length} isu:`);
for (const item of masalah) {
  console.error(`  ✖ ${item}`);
}
process.exit(1);
