// Struktur navigasi situs publik (urutan eksplisit; halaman tak terdaftar masuk "More").
export interface NavItem {
  readonly slug: string;
  readonly label: string;
}

export interface NavSection {
  readonly title: string;
  readonly items: readonly NavItem[];
}

export const NAV: readonly NavSection[] = [
  {
    title: "Getting started",
    items: [{ slug: "getting-started", label: "Getting Started" }],
  },
  {
    title: "Core concepts",
    items: [
      { slug: "routing", label: "Routing" },
      { slug: "ssr-hydration", label: "SSR & Hydration" },
      { slug: "data-and-caching", label: "Data & Caching" },
    ],
  },
  {
    title: "Guides",
    items: [
      { slug: "assets-and-images", label: "Assets & Images" },
      { slug: "plugins", label: "Plugins" },
      { slug: "deployment", label: "Deployment" },
    ],
  },
  {
    title: "Security",
    items: [{ slug: "security/overview", label: "Security overview" }],
  },
  {
    title: "Reference",
    items: [{ slug: "api/core-contract", label: "API Reference" }],
  },
  {
    title: "For agents",
    items: [{ slug: "for-agents", label: "For Agents" }],
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
