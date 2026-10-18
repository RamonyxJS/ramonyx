// Generator llms.txt + llms-full.txt (ADR-0054; spec llmstxt.org v2).
// Deterministik (tanpa timestamp) agar `pnpm docs:validate` bisa memeriksa kesegaran.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SITE = "https://ramonyxjs.github.io/ramonyx";

const MACHINE_FILES = [
  "features.json",
  "adrs.json",
  "rules.json",
  "security.json",
  "glossary.json",
  "api.json",
  "cli.json",
  "stats.json",
  "config.schema.json",
] as const;

const HUMAN_DOCS = [
  "README.md",
  "docs/architecture.md",
  "docs/api/core-contract.md",
  "docs/BLUEPRINT.md",
  "docs/PRD.md",
  "docs/security/threat-model.md",
  "docs/benchmark-protocol.md",
  "docs/releasing.md",
  "docs/coding-standards.md",
  "AGENTS.md",
] as const;

function read(relative: string): string {
  return readFileSync(`${ROOT}${relative}`, "utf8");
}

export function generateLlms(): { llms: string; llmsFull: string } {
  const stats = JSON.parse(read("docs/machine/stats.json")) as { adrs: number; version: string };
  const llms = `# Ramonyx

> Framework full-stack TypeScript (runtime MVP Node.js) dengan SSR React, hydration, soft navigation, keamanan bawaan, dan runtime Rust/V8 eksperimental. Disiplin bukti: setiap klaim punya ADR/test/benchmark.

Dokumentasi lengkap: ${SITE}/ . Fakta terstruktur (sumber kebenaran status/angka): ${SITE}/machine/ .

## Machine-readable (sumber kebenaran fakta)

- [features.json](${SITE}/machine/features.json): status setiap fitur (implemented/partial/experimental/planned) + paket + bukti + batasan
- [adrs.json](${SITE}/machine/adrs.json): indeks ${stats.adrs} ADR — keputusan satu kalimat + relasi
- [rules.json](${SITE}/machine/rules.json): aturan menulis aplikasi di atas Ramonyx, dengan contoh benar/salah
- [security.json](${SITE}/machine/security.json): kontrol keamanan + status + celah yang diakui
- [glossary.json](${SITE}/machine/glossary.json): istilah + peta konsep
- [stats.json](${SITE}/machine/stats.json): versi, jumlah paket/ADR/test — satu-satunya tempat angka
- [api.json](${SITE}/machine/api.json) dan [cli.json](${SITE}/machine/cli.json): referensi API/CLI hasil ekstraksi kode
- [config.schema.json](${SITE}/machine/config.schema.json): bentuk ramonyx.config.ts (diverifikasi test)

## Dokumen inti

- [README](${SITE}/dokumen/README/): ikhtisar, instalasi, perintah
- [Architecture](${SITE}/dokumen/architecture/): peta paket + kontrak RuntimeHost
- [Core contract (API v0)](${SITE}/dokumen/api/core-contract/): kontrak API
- [BLUEPRINT](${SITE}/dokumen/BLUEPRINT/): sumber kebenaran teknis
- [Threat model](${SITE}/dokumen/security/threat-model/)
- [Benchmark protocol](${SITE}/dokumen/benchmark-protocol/)
- [Releasing](${SITE}/dokumen/releasing/)
- [Roadmap](${SITE}/dokumen/roadmap/phase-0-1/)
- [Status implementasi](${SITE}/dokumen/IMPLEMENTATION_STATUS/)
- [ADR index](${SITE}/dokumen/adr/README/)

## Untuk agen

- [llms-full.txt](${SITE}/llms-full.txt): seluruh machine layer + dokumen inti dalam satu berkas
- Markdown per halaman: tambahkan \`.md\` pada URL halaman (mis. ${SITE}/dokumen/architecture.md) — discovery via \`<link rel="alternate" type="text/markdown">\`
- [sitemap.md](${SITE}/sitemap.md): indeks semua halaman
- Skill agen: \`.agents/skills/ramonyx/SKILL.md\` di repo
`;

  const parts: string[] = [
    `# Ramonyx — llms-full`,
    ``,
    `> Teks lengkap untuk agen: seluruh machine layer (JSON) + dokumen inti. Sumber: repo RamonyxJS/ramonyx (${SITE}).`,
    `> Status/angka otoritatif ada di machine layer; teks ADR lengkap di docs/adr/*.md (indeks: adrs.json).`,
    ``,
  ];

  for (const file of MACHINE_FILES) {
    parts.push(
      `## docs/machine/${file}`,
      "",
      "```json",
      read(`docs/machine/${file}`).trimEnd(),
      "```",
      "",
    );
  }

  for (const doc of HUMAN_DOCS) {
    parts.push(`## ${doc}`, "", read(doc).trimEnd(), "");
  }

  return { llms, llmsFull: `${parts.join("\n")}\n` };
}
