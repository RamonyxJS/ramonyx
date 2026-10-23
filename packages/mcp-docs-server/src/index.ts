// MCP docs server Ramonyx (ADR-0078) — JSON-RPC 2.0 di atas stdio, **tanpa dependency eksternal**.
//
// Subset protokol yang didukung (didokumentasikan di docs/mcp.md):
//   initialize · notifications/* (diabaikan) · ping · tools/list · tools/call ·
//   resources/list · resources/read · resources/templates/list (kosong) · prompts/list (kosong) ·
//   logging/setLevel (diabaikan).
//
// Tidak didukung: HTTP/SSE transport, prompts, sampling, subscriptions, roots, batching.

import { createDocsIndex, type DocsIndex, MACHINE_FILES, resolveDocsRoot } from "./docs.ts";
import { type ProjectContext, type ProjectRoute, scanProject } from "./project.ts";

export type { DocEntry, DocHit, DocsIndex, MachineName } from "./docs.ts";
export { createDocsIndex, resolveDocsRoot } from "./docs.ts";
export type { ProjectContext, ProjectRoute } from "./project.ts";
export { scanProject } from "./project.ts";

/** Versi protokol MCP yang dipakai sebagai default (versi klien di-echo saat handshake). */
export const MCP_PROTOCOL_VERSION = "2025-06-18";

export interface McpServerOptions {
  /** Direktori docs eksplisit (default: resolusi otomatis — lihat `resolveDocsRoot`). */
  readonly docsRoot?: string;
  readonly cwd?: string;
  readonly moduleUrl?: string;
  /** Versi server (info handshake). */
  readonly version?: string;
  /**
   * Mode proyek: direktori aplikasi Ramonyx. Bila diisi, tools `get_project_context`,
   * `list_routes`, `get_route`, `get_recipe`, `search_api` dan resource
   * `ramonyx://project/manifest` ikut tersedia. Pemindaian **statis** (tidak mengeksekusi kode
   * pengguna); validasi mendalam tetap `ramonyx check`.
   */
  readonly appRoot?: string;
}

interface ToolDefinition {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
}

interface ToolResult {
  readonly content: readonly { readonly type: "text"; readonly text: string }[];
  readonly structuredContent?: unknown;
  readonly isError?: boolean;
}

function teks(text: string, structuredContent?: unknown, isError?: boolean): ToolResult {
  return {
    content: [{ type: "text", text }],
    ...(structuredContent !== undefined ? { structuredContent } : {}),
    ...(isError === true ? { isError: true } : {}),
  };
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function ok(id: unknown, result: unknown): Record<string, unknown> {
  return { jsonrpc: "2.0", id, result };
}

function err(id: unknown, code: number, message: string): Record<string, unknown> {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

const TOOLS: readonly ToolDefinition[] = [
  {
    name: "search_docs",
    title: "Cari dokumentasi Ramonyx",
    description:
      "Cari halaman dokumentasi Ramonyx (docs/**). Judul dan slug diprioritaskan, lalu isi. Mengembalikan slug yang bisa dipakai `get_page`.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: 'Kata kunci pencarian (mis. "revalidate", "csp")' },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 50,
          description: "Maksimum hasil (default 10)",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "get_page",
    title: "Baca satu halaman dokumentasi",
    description: "Kembalikan markdown lengkap satu halaman dokumentasi berdasarkan slug.",
    inputSchema: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description:
            "Slug halaman relatif ke docs/ tanpa `.md` (mis. `tutorial`, `adr/0078-...`)",
        },
      },
      required: ["slug"],
      additionalProperties: false,
    },
  },
  {
    name: "get_feature_status",
    title: "Status fitur framework",
    description:
      "Cari status fitur dari machine layer (features.json): implemented/partial/experimental/planned + sejak versi + bukti kode/test + batasan.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: 'Kata kunci id/nama/status fitur (mis. "revalidate", "plugin", "planned")',
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "get_rules",
    title: "Aturan menulis aplikasi Ramonyx",
    description:
      "Aturan menulis aplikasi di atas Ramonyx (rules.json): aturan, alasan, contoh benar/salah, dan penegakannya.",
    inputSchema: {
      type: "object",
      properties: {
        scope: {
          type: "string",
          description:
            "Filter scope (mis. `framework`, `app`) — opsional, tanpa filter mengembalikan semua",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "list_adrs",
    title: "Indeks keputusan arsitektur (ADR)",
    description:
      "Daftar ADR Ramonyx (adrs.json): id, judul, status, ringkasan keputusan, relasi, fitur terkait. Gunakan `get_page` dengan slug `adr/<berkas>` untuk isi lengkap.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Filter id/judul/keputusan (opsional)" },
      },
      additionalProperties: false,
    },
  },
];

const PROJECT_TOOLS: readonly ToolDefinition[] = [
  {
    name: "get_project_context",
    title: "Konteks proyek Ramonyx",
    description:
      "Ringkasan proyek aktif (mode --app): package, versi ramonyx, config, entry, jumlah route, dan peringatan. Pindai statis; jalankan `ramonyx check --json` untuk validasi.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "list_routes",
    title: "Daftar route proyek",
    description:
      "Daftar halaman dan route API proyek (path, file, loader/action, method, middleware). Filter opsional berdasarkan path/file dan jenis.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Filter path atau file (substring, opsional)" },
        kind: {
          type: "string",
          enum: ["page", "api"],
          description: "Batasi ke halaman atau route API (opsional)",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_route",
    title: "Detail satu route",
    description:
      "Detail route berdasarkan path URL (mis. `/blog/[slug]` atau `/api/health`). Kembalikan file, ekspor loader/action, method API, layout, dan middleware.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path route, dengan atau tanpa leading slash" },
        kind: {
          type: "string",
          enum: ["page", "api"],
          description: "Opsional bila path yang sama ada di halaman dan API",
        },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },
  {
    name: "get_recipe",
    title: "Resep tugas Ramonyx",
    description:
      "Baca resep task-oriented dari docs (recipes/<id>). Berikan `id` (mis. `form-action`) atau `query` untuk mencari resep yang cocok.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "ID resep, mis. `page-loader` (opsional)" },
        query: { type: "string", description: "Kata kunci resep (opsional bila id kosong)" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "search_api",
    title: "Cari API framework",
    description:
      "Cari nilai/tipe API publik dari machine layer api.json berdasarkan nama simbol, package, atau sumber.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Nama simbol/package (substring)" },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          description: "Maksimum hasil (default 20)",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
];

function teksField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function routeLine(route: ProjectRoute): string {
  if (route.kind === "api") {
    return `- \`${route.path}\` — API ${route.methods?.join("/") || "?"} — \`${route.file}\``;
  }
  const tanda = [route.loader ? "loader" : "", route.action ? "action" : ""]
    .filter((item) => item.length > 0)
    .join("+");
  return `- \`${route.path}\` — \`${route.file}\`${tanda.length > 0 ? ` [${tanda}]` : ""}`;
}

function cocok(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

/** Server MCP: `handleLine` memproses satu baris JSON-RPC dan mengembalikan respons (atau null). */
export function createMcpServer(options: McpServerOptions = {}) {
  // `docsRoot` eksplisit tetap divalidasi/dipetakan lewat resolveDocsRoot — mencegah `--docs`
  // menunjuk direktori `docs/` dan menyedot docs/internal (ADR-0082).
  const index: DocsIndex = createDocsIndex(
    resolveDocsRoot({ ...options, explicit: options.docsRoot }),
  );
  const project: ProjectContext | undefined =
    options.appRoot === undefined
      ? undefined
      : scanProject(options.appRoot, {
          ...(options.version === undefined ? {} : { serverVersion: options.version }),
        });
  const tools: readonly ToolDefinition[] =
    project === undefined ? TOOLS : [...TOOLS, ...PROJECT_TOOLS];
  const serverInfo = {
    name: "ramonyx-docs",
    title: project === undefined ? "Ramonyx Docs" : "Ramonyx Docs + Project",
    version: options.version ?? "0.0.0",
  };

  const instructions =
    "Dokumentasi Ramonyx (framework full-stack TypeScript + runtime Rust eksperimental). Alur: " +
    "`search_docs` → `get_page` untuk halaman; `get_feature_status` untuk status/bukti fitur; " +
    "`get_rules` untuk aturan menulis aplikasi; `list_adrs` untuk keputusan arsitektur. " +
    "Resource `ramonyx://machine/*` menyediakan berkas machine layer mentah (stats/features/rules/adrs/…)." +
    (project === undefined
      ? ""
      : " Mode proyek aktif: `get_project_context` → `list_routes`/`get_route` untuk peta aplikasi, " +
        "`get_recipe` untuk langkah tugas, `search_api` untuk simbol API. Pemindaian proyek statis; " +
        "untuk validasi jalankan `ramonyx check --json` dan `ramonyx routes --json`.");

  function toolCall(id: unknown, params: unknown): Record<string, unknown> {
    const p = (typeof params === "object" && params !== null ? params : {}) as Record<
      string,
      unknown
    >;
    const name = teksField(p.name);
    const args = (
      typeof p.arguments === "object" && p.arguments !== null ? p.arguments : {}
    ) as Record<string, unknown>;

    if (name === "search_docs") {
      const query = teksField(args.query);
      if (query.length === 0) {
        return err(id, -32602, "search_docs: argumen `query` (string) wajib.");
      }
      const limit = typeof args.limit === "number" ? Math.trunc(args.limit) : undefined;
      const hasil = index.searchDocs(query, limit);
      const text =
        hasil.length === 0
          ? `Tidak ada halaman yang cocok dengan "${query}".`
          : hasil.map((hit) => `- **${hit.title}** — \`${hit.slug}\`\n  ${hit.excerpt}`).join("\n");
      return ok(id, teks(text, { query, results: hasil }));
    }

    if (name === "get_page") {
      const slug = teksField(args.slug);
      if (slug.length === 0) {
        return err(id, -32602, "get_page: argumen `slug` (string) wajib.");
      }
      const doc = index.getDoc(slug);
      if (doc === null) {
        return ok(
          id,
          teks(
            `Halaman "${slug}" tidak ditemukan. Cari dengan \`search_docs\` untuk menemukan slug yang benar.`,
            undefined,
            true,
          ),
        );
      }
      return ok(id, teks(doc.text));
    }

    if (name === "get_feature_status") {
      const query = teksField(args.query);
      if (query.length === 0) {
        return err(id, -32602, "get_feature_status: argumen `query` (string) wajib.");
      }
      const fitur = index
        .features()
        .filter(
          (entry) =>
            cocok(teksField(entry.id), query) ||
            cocok(teksField(entry.name), query) ||
            cocok(teksField(entry.status), query),
        );
      if (fitur.length === 0) {
        return ok(
          id,
          teks(`Tidak ada fitur yang cocok dengan "${query}".`, { query, features: [] }, true),
        );
      }
      return ok(id, teks(json(fitur), { query, features: fitur }));
    }

    if (name === "get_rules") {
      const scope = teksField(args.scope);
      const aturan = index
        .rules()
        .filter((entry) => scope.length === 0 || teksField(entry.scope) === scope);
      if (aturan.length === 0) {
        return ok(
          id,
          teks(`Tidak ada aturan${scope ? ` untuk scope "${scope}"` : ""}.`, undefined, true),
        );
      }
      const text = aturan
        .map((entry) => {
          const baris = [
            `### ${teksField(entry.id)}${entry.scope ? ` (${teksField(entry.scope)})` : ""}`,
            teksField(entry.rule),
          ];
          if (entry.rationale) {
            baris.push("", `Alasan: ${teksField(entry.rationale)}`);
          }
          if (entry.good) {
            baris.push("", "Benar:", "```", teksField(entry.good), "```");
          }
          if (entry.bad) {
            baris.push("", "Salah:", "```", teksField(entry.bad), "```");
          }
          if (entry.enforcement) {
            baris.push("", `Penegakan: ${teksField(entry.enforcement)}`);
          }
          return baris.join("\n");
        })
        .join("\n\n");
      return ok(id, teks(text, { scope: scope || null, rules: aturan }));
    }

    if (name === "list_adrs") {
      const query = teksField(args.query);
      const adrs = index
        .adrs()
        .filter(
          (entry) =>
            query.length === 0 ||
            cocok(teksField(entry.id), query) ||
            cocok(teksField(entry.title), query) ||
            cocok(teksField(entry.decision), query),
        );
      if (adrs.length === 0) {
        return ok(
          id,
          teks(`Tidak ada ADR yang cocok dengan "${query}".`, { query, adrs: [] }, true),
        );
      }
      const text = adrs
        .map((entry) => {
          const kepala = `- **${teksField(entry.id)}** (${teksField(entry.status) || "?"}) — ${teksField(entry.title)}`;
          const keputusan = teksField(entry.decision);
          return keputusan.length > 0 ? `${kepala}\n  ${keputusan.slice(0, 220)}` : kepala;
        })
        .join("\n");
      return ok(id, teks(text, { query: query || null, adrs }));
    }

    if (project !== undefined) {
      if (name === "get_project_context") {
        const nama = project.package.name ?? "(tanpa package.json)";
        const baris = [
          `# Proyek Ramonyx: ${nama}`,
          `Root: \`${project.root}\``,
          `Package: ${project.package.name ?? "?"} ${project.package.version ?? ""}`.trim(),
          `ramonyx: ${project.ramonyxVersion ?? "tidak dideklarasikan"}`,
          `Config: ${project.configFile ?? "(default)"}`,
          `Entry: ${project.entry ?? "(tidak ditemukan)"}`,
          `Route: ${project.pages.length} halaman, ${project.api.length} API`,
        ];
        if (project.warnings.length > 0) {
          baris.push("", "Peringatan:", ...project.warnings.map((warning) => `- ${warning}`));
        }
        if (project.pages.length > 0) {
          baris.push("", "Halaman:", ...project.pages.slice(0, 100).map(routeLine));
          if (project.pages.length > 100) {
            baris.push(`- … ${project.pages.length - 100} halaman lagi (gunakan list_routes)`);
          }
        }
        if (project.api.length > 0) {
          baris.push("", "API:", ...project.api.slice(0, 100).map(routeLine));
        }
        baris.push("", "Validasi: `ramonyx check --json`; manifest CLI: `ramonyx routes --json`.");
        return ok(id, teks(baris.join("\n"), project));
      }

      if (name === "list_routes") {
        const query = teksField(args.query).toLowerCase();
        const kind = teksField(args.kind);
        const filter = (route: ProjectRoute): boolean => {
          if (kind.length > 0 && route.kind !== kind) {
            return false;
          }
          return (
            query.length === 0 ||
            route.path.toLowerCase().includes(query) ||
            route.file.toLowerCase().includes(query)
          );
        };
        const pages = project.pages.filter(filter);
        const api = project.api.filter(filter);
        const lines = [...pages.map(routeLine), ...api.map(routeLine)];
        const text = lines.length === 0 ? "Tidak ada route yang cocok." : lines.join("\n");
        return ok(id, teks(text, { query: query || null, kind: kind || null, pages, api }));
      }

      if (name === "get_route") {
        const rawPath = teksField(args.path).trim();
        if (rawPath.length === 0) {
          return err(id, -32602, "get_route: argumen `path` (string) wajib.");
        }
        const wanted =
          rawPath === "/" ? "/" : `/${rawPath.replace(/^\/+/, "").replace(/\/+$/, "")}`;
        const kind = teksField(args.kind);
        const found = [...project.pages, ...project.api].filter(
          (route) => route.path === wanted && (kind.length === 0 || route.kind === kind),
        );
        if (found.length === 0) {
          return ok(
            id,
            teks(
              `Route "${wanted}" tidak ditemukan. Gunakan \`list_routes\` untuk melihat path yang tersedia.`,
              { path: wanted, routes: [] },
              true,
            ),
          );
        }
        const detail = found
          .map((route) => {
            const lines = [
              `## ${route.kind === "page" ? "Halaman" : "API"} \`${route.path}\``,
              `File: \`${route.file}\``,
            ];
            if (route.kind === "page") {
              lines.push(
                `Loader: ${route.loader ? "ya" : "tidak"}; Action: ${route.action ? "ya" : "tidak"}`,
              );
              if (route.layouts !== undefined && route.layouts.length > 0) {
                lines.push(`Layout: ${route.layouts.map((file) => `\`${file}\``).join(", ")}`);
              }
              if (route.error !== null && route.error !== undefined) {
                lines.push(`Error boundary: \`${route.error}\``);
              }
            } else {
              lines.push(`Method: ${route.methods?.join(", ") || "(tidak ada ekspor method)"}`);
            }
            if (route.middleware !== undefined && route.middleware.length > 0) {
              lines.push(`Middleware: ${route.middleware.map((file) => `\`${file}\``).join(", ")}`);
            }
            return lines.join("\n");
          })
          .join("\n\n");
        return ok(id, teks(detail, { path: wanted, routes: found }));
      }

      if (name === "get_recipe") {
        const idValue = teksField(args.id)
          .replace(/^recipes\//, "")
          .replace(/\.md$/, "");
        const query = teksField(args.query);
        let doc = null;
        if (idValue.length > 0) {
          doc = index.getDoc(`recipes/${idValue}`);
        } else if (query.length > 0) {
          const hit = index
            .searchDocs(query, 50)
            .find((entry) => entry.slug.startsWith("recipes/"));
          doc = hit === undefined ? null : index.getDoc(hit.slug);
        } else {
          return err(id, -32602, "get_recipe: berikan `id` atau `query`.");
        }
        if (doc === null) {
          const tersedia = index
            .listDocs()
            .filter((entry) => entry.slug.startsWith("recipes/") && entry.slug !== "recipes")
            .map((entry) => `- \`${entry.slug.replace(/^recipes\//, "")}\` — ${entry.title}`)
            .join("\n");
          return ok(
            id,
            teks(
              `Resep tidak ditemukan.${tersedia.length > 0 ? `\n\nResep tersedia:\n${tersedia}` : ""}`,
              undefined,
              true,
            ),
          );
        }
        return ok(
          id,
          teks(doc.text, {
            slug: doc.slug,
            title: doc.title,
            id: doc.slug.replace(/^recipes\//, ""),
          }),
        );
      }

      if (name === "search_api") {
        const query = teksField(args.query);
        if (query.length === 0) {
          return err(id, -32602, "search_api: argumen `query` (string) wajib.");
        }
        const raw = index.readMachine("api");
        let packages: readonly Record<string, unknown>[] = [];
        if (raw !== null) {
          try {
            const parsed = JSON.parse(raw.text) as { packages?: unknown };
            packages = Array.isArray(parsed.packages)
              ? (parsed.packages as Record<string, unknown>[])
              : [];
          } catch {
            packages = [];
          }
        }
        const limit = typeof args.limit === "number" ? Math.trunc(args.limit) : 20;
        const hasil: {
          package: string;
          name: string;
          kind: "value" | "type";
          source: string;
          version: string | null;
        }[] = [];
        for (const pkg of packages) {
          const packageName = teksField(pkg.name);
          const source = teksField(pkg.source);
          const version = typeof pkg.version === "string" ? pkg.version : null;
          for (const kind of ["values", "types"] as const) {
            const values = Array.isArray(pkg[kind]) ? (pkg[kind] as unknown[]) : [];
            for (const value of values) {
              const symbol = teksField(value);
              if (cocok(symbol, query) || cocok(packageName, query) || cocok(source, query)) {
                hasil.push({
                  package: packageName,
                  name: symbol,
                  kind: kind === "values" ? "value" : "type",
                  source,
                  version,
                });
              }
            }
          }
        }
        hasil.sort(
          (a, b) =>
            a.name.localeCompare(b.name) ||
            a.package.localeCompare(b.package) ||
            a.kind.localeCompare(b.kind),
        );
        const potong = hasil.slice(0, Math.max(1, Math.min(100, limit)));
        const text =
          potong.length === 0
            ? `Tidak ada API yang cocok dengan "${query}".`
            : potong
                .map(
                  (entry) =>
                    `- \`${entry.name}\` (${entry.kind}) — ${entry.package}@${entry.version ?? "?"} — \`${entry.source}\``,
                )
                .join("\n");
        return ok(id, teks(text, { query, results: potong }));
      }
    }

    return err(id, -32602, `Tool tidak dikenal: "${name}". Lihat tools/list.`);
  }

  function resourcesList(): readonly Record<string, unknown>[] {
    const items: Record<string, unknown>[] = [];
    for (const name of index.machineNames()) {
      const file = MACHINE_FILES[name];
      items.push({
        uri: `ramonyx://machine/${name}`,
        name: `machine/${file}`,
        title: `Machine layer: ${file}`,
        mimeType: file.endsWith(".json") ? "application/json" : "text/plain",
        description: `Berkas machine layer publik (docs/public/machine/${file})`,
      });
    }
    for (const doc of index.listDocs()) {
      items.push({
        uri: `ramonyx://docs/${doc.slug}`,
        name: doc.slug,
        title: doc.title,
        mimeType: "text/markdown",
      });
    }
    if (project !== undefined) {
      items.push({
        uri: "ramonyx://project/manifest",
        name: "project/manifest.json",
        title: "Manifest proyek (statis)",
        mimeType: "application/json",
        description: "Peta package/config/entry/route proyek aktif",
      });
    }
    return items;
  }

  function resourceRead(id: unknown, params: unknown): Record<string, unknown> {
    const p = (typeof params === "object" && params !== null ? params : {}) as Record<
      string,
      unknown
    >;
    const uri = teksField(p.uri);
    if (uri === "ramonyx://project/manifest") {
      if (project === undefined) {
        return err(
          id,
          -32602,
          "Resource proyek tidak tersedia; jalankan server dengan `--app <dir>`.",
        );
      }
      return ok(id, {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(project, null, 2),
          },
        ],
      });
    }
    if (uri.startsWith("ramonyx://machine/")) {
      const name = uri.slice("ramonyx://machine/".length);
      const berkas = index.readMachine(name);
      if (berkas === null) {
        return err(id, -32602, `Resource tidak dikenal: ${uri}`);
      }
      return ok(id, {
        contents: [
          {
            uri,
            mimeType: berkas.file.endsWith(".json") ? "application/json" : "text/plain",
            text: berkas.text,
          },
        ],
      });
    }
    if (uri.startsWith("ramonyx://docs/")) {
      const slug = uri.slice("ramonyx://docs/".length);
      const doc = index.getDoc(slug);
      if (doc === null) {
        return err(id, -32602, `Resource tidak dikenal: ${uri}`);
      }
      return ok(id, { contents: [{ uri, mimeType: "text/markdown", text: doc.text }] });
    }
    return err(id, -32602, `URI resource tidak didukung: "${uri}". Gunakan resources/list.`);
  }

  function handleMessage(msg: unknown): Record<string, unknown> | null {
    if (Array.isArray(msg)) {
      return err(null, -32600, "Batch JSON-RPC tidak didukung.");
    }
    if (typeof msg !== "object" || msg === null) {
      return err(null, -32600, "Request JSON-RPC tidak valid.");
    }
    const pesan = msg as Record<string, unknown>;
    const id = pesan.id;
    const notifikasi = id === undefined || id === null;

    if (pesan.jsonrpc !== "2.0" || typeof pesan.method !== "string") {
      return notifikasi ? null : err(id, -32600, "Request JSON-RPC tidak valid (jsonrpc/method).");
    }

    const method = pesan.method;
    switch (method) {
      case "initialize": {
        const params = (
          typeof pesan.params === "object" && pesan.params !== null ? pesan.params : {}
        ) as Record<string, unknown>;
        const diminta = teksField(params.protocolVersion);
        return ok(id, {
          protocolVersion: diminta.length > 0 ? diminta : MCP_PROTOCOL_VERSION,
          capabilities: {
            tools: { listChanged: false },
            resources: { subscribe: false, listChanged: false },
          },
          serverInfo,
          instructions,
        });
      }
      case "notifications/initialized":
      case "notifications/cancelled":
      case "notifications/roots/list_changed":
        return null;
      case "ping":
        return ok(id, {});
      case "logging/setLevel":
        return ok(id, {});
      case "tools/list":
        return ok(id, { tools });
      case "tools/call":
        return toolCall(id, pesan.params);
      case "resources/list":
        return ok(id, { resources: resourcesList() });
      case "resources/templates/list":
        return ok(id, { resourceTemplates: [] });
      case "resources/read":
        return resourceRead(id, pesan.params);
      case "prompts/list":
        return ok(id, { prompts: [] });
      default:
        return notifikasi
          ? null
          : err(id, -32601, `Method tidak didukung: "${method}" (subset ADR-0078).`);
    }
  }

  /** Proses satu baris (JSON-RPC) → baris respons, atau `null` untuk notifikasi. */
  function handleLine(line: string): string | null {
    if (line.trim().length === 0) {
      return null;
    }
    let msg: unknown;
    try {
      msg = JSON.parse(line);
    } catch {
      return JSON.stringify(err(null, -32700, "Parse error: baris bukan JSON."));
    }
    const respons = handleMessage(msg);
    return respons === null ? null : JSON.stringify(respons);
  }

  return {
    handleLine,
    handleMessage,
    index,
    tools,
    project,
    serverInfo,
    instructions,
  };
}

export type McpServer = ReturnType<typeof createMcpServer>;

export interface StdioServerOptions extends McpServerOptions {
  readonly input?: AsyncIterable<Uint8Array | string>;
  readonly output?: { write(chunk: string): unknown };
}

/** Jalankan server di stdio: baris JSON-RPC masuk → respons keluar (newline-delimited). */
export async function runStdioServer(options: StdioServerOptions = {}): Promise<void> {
  const server = createMcpServer(options);
  const input = options.input ?? (process.stdin as unknown as AsyncIterable<Uint8Array>);
  const output = options.output ?? process.stdout;
  let buffer = "";
  for await (const chunk of input) {
    buffer += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    let indexBaris = buffer.indexOf("\n");
    while (indexBaris >= 0) {
      const line = buffer.slice(0, indexBaris);
      buffer = buffer.slice(indexBaris + 1);
      const respons = server.handleLine(line);
      if (respons !== null) {
        output.write(`${respons}\n`);
      }
      indexBaris = buffer.indexOf("\n");
    }
  }
  if (buffer.length > 0) {
    const respons = server.handleLine(buffer);
    if (respons !== null) {
      output.write(`${respons}\n`);
    }
  }
}

export interface McpHttpOptions extends McpServerOptions {
  /** Bearer token statis; bila diisi, semua request wajib `Authorization: Bearer <token>`. */
  readonly token?: string;
  /** Autorisasi kustom (mis. sesi/OIDC); dipanggil setelah bearer check. */
  readonly authorize?: (request: Request) => boolean | Promise<boolean>;
  /** Rate limit fixed-window in-memory per key (default IP dari x-forwarded-for). */
  readonly rateLimit?: {
    readonly limit: number;
    readonly windowMs: number;
    readonly key?: (request: Request) => string;
  };
  /** Batas body JSON-RPC; default 1 MiB. */
  readonly maxBodyBytes?: number;
}

const MCP_HTTP_MAX_BODY = 1_048_576;

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (header === null || !header.startsWith("Bearer ")) {
    return null;
  }
  return header.slice("Bearer ".length);
}

function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded !== null && forwarded.length > 0) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Transport HTTP untuk MCP docs server (POST JSON-RPC). Cocok dipasang di Node/edge handler;
 * autentikasi bearer opsional, rate limit in-memory, dan `202` untuk notifikasi.
 */
export function createMcpHttpHandler(
  options: McpHttpOptions = {},
): (request: Request) => Promise<Response> {
  const server = createMcpServer(options);
  const maxBody = options.maxBodyBytes ?? MCP_HTTP_MAX_BODY;
  const windows = new Map<string, { count: number; start: number }>();

  return async (request) => {
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
        status: 405,
        headers: { "content-type": "application/json", allow: "POST" },
      });
    }

    if (options.token !== undefined && bearerToken(request) !== options.token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json", "www-authenticate": "Bearer" },
      });
    }
    if (options.authorize !== undefined && !(await options.authorize(request))) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      });
    }

    if (options.rateLimit !== undefined) {
      const key = options.rateLimit.key?.(request) ?? clientKey(request);
      const now = Date.now();
      const current = windows.get(key);
      const entry =
        current === undefined || now - current.start >= options.rateLimit.windowMs
          ? { count: 0, start: now }
          : current;
      entry.count += 1;
      windows.set(key, entry);
      if (entry.count > options.rateLimit.limit) {
        return new Response(JSON.stringify({ error: "Too Many Requests" }), {
          status: 429,
          headers: {
            "content-type": "application/json",
            "retry-after": String(Math.max(1, Math.ceil(options.rateLimit.windowMs / 1_000))),
          },
        });
      }
    }

    const declared = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > maxBody) {
      return new Response(JSON.stringify({ error: "Payload Too Large" }), {
        status: 413,
        headers: { "content-type": "application/json" },
      });
    }
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > maxBody) {
      return new Response(JSON.stringify({ error: "Payload Too Large" }), {
        status: 413,
        headers: { "content-type": "application/json" },
      });
    }

    const response = server.handleLine(text);
    if (response === null) {
      return new Response(null, { status: 202 });
    }
    return new Response(response, {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  };
}
