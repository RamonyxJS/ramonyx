// Struktur navigasi situs publik. Urutan eksplisit; deskripsi dipakai indeks docs.
export interface NavItem {
  readonly slug: string;
  readonly label: string;
  readonly description?: string;
}

export interface NavSection {
  readonly title: string;
  readonly description: string;
  readonly items: readonly NavItem[];
}

export const NAV: readonly NavSection[] = [
  {
    title: "Start here",
    description: "Install the toolchain, see what ships, and understand the request model.",
    items: [
      {
        slug: "getting-started",
        label: "Getting Started",
        description: "Scaffold an app and run the request loop end to end.",
      },
      {
        slug: "whats-included",
        label: "What's Included",
        description: "Capability map with honest boundaries.",
      },
      {
        slug: "templates",
        label: "Templates",
        description: "Minimal, auth, Cloudflare, and docs/blog starters.",
      },
    ],
  },
  {
    title: "Build",
    description: "The framework surface: files, rendering, data, and the type system.",
    items: [
      {
        slug: "routing",
        label: "Routing",
        description: "Pages, API methods, middleware, and limits.",
      },
      {
        slug: "ssr-hydration",
        label: "SSR & Hydration",
        description: "Sync or streaming render, actions, and client navigation.",
      },
      {
        slug: "data-and-caching",
        label: "Data & Caching",
        description: "Loaders, dependency graphs, revalidation, and shared stores.",
      },
      {
        slug: "recipes",
        label: "Recipes",
        description: "Task-oriented guides: pages, actions, APIs, auth, cache, testing, deploy.",
      },
      {
        slug: "typed-routes",
        label: "Typed Routes",
        description: "Generated route maps and typed links through #routes.",
      },
      {
        slug: "i18n",
        label: "Internationalization",
        description: "Locale routing, ICU messages, and detection.",
      },
      {
        slug: "architecture",
        label: "Architecture",
        description: "Package map, runtime contract, and boundaries.",
      },
    ],
  },
  {
    title: "Extend",
    description: "The parts applications usually assemble themselves — done at the framework edge.",
    items: [
      {
        slug: "assets-and-images",
        label: "Assets & Images",
        description: "Hashed assets, responsive images, placeholders, and serving.",
      },
      {
        slug: "plugins",
        label: "Plugins",
        description: "Hooks, registry verification, and ramonyx add.",
      },
      {
        slug: "sessions-and-auth",
        label: "Sessions & Auth",
        description: "Sessions, reset tokens, OAuth, and authorization guards.",
      },
    ],
  },
  {
    title: "Operate",
    description: "Ship, observe, and recover. These pages assume a real deployment.",
    items: [
      {
        slug: "state-and-adapters",
        label: "State & Adapters",
        description: "Redis/KV contracts, TTLs, sinks, and failure modes.",
      },
      {
        slug: "deployment",
        label: "Deployment",
        description: "Node, static, edge, Vercel, and Deno presets.",
      },
      {
        slug: "security/overview",
        label: "Security overview",
        description: "Headers, CSRF, SSRF, supply chain, and limitations.",
      },
      {
        slug: "observability",
        label: "Observability",
        description: "Trace ids, structured logs, metrics, and sinks.",
      },
      {
        slug: "benchmarks",
        label: "Benchmarks",
        description: "Protocols, baselines, and the strict self-hosted gate.",
      },
      {
        slug: "troubleshooting",
        label: "Troubleshooting",
        description: "RMX error codes and boundary failures.",
      },
    ],
  },
  {
    title: "Reference",
    description: "Exact contracts and tool output, kept close to the implementation.",
    items: [
      {
        slug: "api/core-contract",
        label: "API Reference",
        description: "Runtime host, handler, route, and page contracts.",
      },
      {
        slug: "api/versioning",
        label: "Versioning",
        description: "1.0 stability and deprecation policy.",
      },
      {
        slug: "cli",
        label: "CLI",
        description: "dev, build, start, add, remove, and doctor.",
      },
      {
        slug: "devtools",
        label: "Devtools Panel",
        description: "Routes, timings, API mapping, and hydration status.",
      },
      {
        slug: "testing",
        label: "Testing",
        description: "Test host, utilities, and feedback loops.",
      },
    ],
  },
  {
    title: "Agents",
    description: "Machine-readable facts and the MCP docs server.",
    items: [
      {
        slug: "for-agents",
        label: "For Agents",
        description: "llms.txt, feature evidence, and MCP setup.",
      },
    ],
  },
];

export function flatNav(): NavItem[] {
  return NAV.flatMap((section) => section.items);
}

export function navLabel(slug: string): string {
  return flatNav().find((item) => item.slug === slug)?.label ?? slug;
}

export function prevNext(slug: string): { prev?: NavItem; next?: NavItem } {
  const items = flatNav();
  const index = items.findIndex((item) => item.slug === slug);
  if (index < 0) {
    return {};
  }
  return {
    ...(index > 0 ? { prev: items[index - 1] } : {}),
    ...(index < items.length - 1 ? { next: items[index + 1] } : {}),
  };
}

/** Judul bagian (untuk breadcrumb). */
export function sectionOf(slug: string): string | undefined {
  return NAV.find((section) => section.items.some((item) => item.slug === slug))?.title;
}

/** Nomor bagian 01..N, dipakai rail dan indeks. */
export function sectionNumber(slug: string): string {
  const index = NAV.findIndex((section) => section.items.some((item) => item.slug === slug));
  return String(Math.max(0, index) + 1).padStart(2, "0");
}
