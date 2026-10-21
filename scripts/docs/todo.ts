// Generator TODO.md dari TODO.json — SATU SUMBER backlog (ADR-0054).
// Deterministik; `pnpm docs:validate` memeriksa kesegaran.
interface TodoItem {
  id: string;
  title: string;
  theme: string;
  priority: string;
  size: string;
  status: string;
  what: string;
  why: string;
  done: string[];
  areas: string[];
  adrs?: string[];
  competitor: string;
  dependsOn?: string[];
  quickWin?: boolean;
  strategic?: boolean;
  source?: string;
}

interface DogfoodEntry {
  id: string;
  title: string;
  problem: string;
  fix: string;
  commit: string;
  area: string;
  status: "fixed" | "partial" | "open";
}

interface TodoFile {
  schemaVersion: 1;
  items: TodoItem[];
  dogfooding?: DogfoodEntry[];
}

const PRIORITY_LABEL: Record<string, string> = {
  p0: "P0 — blocker adopsi",
  p1: "P1 — paritas",
  p2: "P2 — diferensiasi & utang",
  p3: "P3 — nice-to-have",
};

export function generateTodoMd(todo: TodoFile): string {
  const lines: string[] = [];
  lines.push("# TODO — menuju paritas kompetitif");
  lines.push("");
  lines.push(
    "> **Sumber tunggal: `TODO.json`** — berkas ini hasil generate, jangan diedit manual.",
  );
  lines.push(
    "> Generate: `pnpm docs:generate` · Validasi: `pnpm docs:validate` · Konteks: `docs/PLAN-docs-consolidation.md` §3–4.",
  );
  lines.push(
    "> Prioritas: **P0** blocker adopsi · **P1** paritas · **P2** diferensiasi & utang yang diakui · **P3** nice-to-have. Ukuran: S (≤1 hari) · M (beberapa hari) · L (1–2 minggu).",
  );
  lines.push("> Status fitur saat ini (bukti + batasan): `docs/public/machine/features.json`.");
  lines.push("");

  const byPriority = (priority: string): TodoItem[] =>
    todo.items.filter((item) => item.priority === priority);
  const quickWins = todo.items.filter((item) => item.quickWin === true);
  const strategic = todo.items.filter((item) => item.strategic === true);

  lines.push("## Ringkasan");
  lines.push("");
  lines.push("| Prioritas | Jumlah | Item |");
  lines.push("| --- | --- | --- |");
  for (const priority of ["p0", "p1", "p2", "p3"]) {
    const items = byPriority(priority);
    lines.push(
      `| ${PRIORITY_LABEL[priority]} | ${items.length} | ${items.map((item) => `\`${item.id}\``).join(" · ")} |`,
    );
  }
  lines.push("");
  lines.push(
    `**Quick wins** (dampak besar, usaha kecil): ${quickWins.map((item) => `\`${item.id}\``).join(" · ")}`,
  );
  lines.push("");
  lines.push(
    `**Strategis** (butuh keputusan arsitektur): ${strategic.map((item) => `\`${item.id}\``).join(" · ")}`,
  );
  lines.push("");

  for (const priority of ["p0", "p1", "p2", "p3"]) {
    lines.push(`## ${PRIORITY_LABEL[priority]}`);
    lines.push("");
    for (const item of byPriority(priority)) {
      lines.push(`### \`${item.id}\` — ${item.title}`);
      lines.push("");
      const meta = [`tema: ${item.theme}`, `ukuran: ${item.size}`, `status: ${item.status}`];
      if (item.dependsOn && item.dependsOn.length > 0) {
        meta.push(`dependensi: ${item.dependsOn.map((id) => `\`${id}\``).join(", ")}`);
      }
      if (item.source) {
        meta.push(`sumber: ${item.source}`);
      }
      lines.push(`*${meta.join(" · ")}*`);
      lines.push("");
      lines.push(`- **Apa**: ${item.what}`);
      lines.push(`- **Kenapa penting untuk bersaing**: ${item.why}`);
      lines.push("- **Selesai bila**:");
      for (const criterion of item.done) {
        lines.push(`  - [ ] ${criterion}`);
      }
      lines.push(`- **Area kode**: ${item.areas.map((area) => `\`${area}\``).join(", ")}`);
      if (item.adrs && item.adrs.length > 0) {
        lines.push(`- **ADR**: ${item.adrs.join(", ")}`);
      }
      lines.push(`- **Pembanding**: ${item.competitor}`);
      lines.push("");
    }
  }

  const dogfooding = todo.dogfooding ?? [];
  if (dogfooding.length > 0) {
    lines.push("## Dogfooding findings");
    lines.push("");
    lines.push(
      "> Temuan nyata saat membangun ulang landing + Worker; commit merujuk perbaikan di repo.",
    );
    lines.push("");
    for (const entry of dogfooding) {
      lines.push(`### \`${entry.id}\` — ${entry.title}`);
      lines.push("");
      lines.push(`*status: ${entry.status} · area: ${entry.area} · commit: \`${entry.commit}\`*`);
      lines.push("");
      lines.push(`- **Masalah**: ${entry.problem}`);
      lines.push(`- **Perbaikan**: ${entry.fix}`);
      lines.push("");
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
}
