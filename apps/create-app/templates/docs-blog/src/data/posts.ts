export interface Post {
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly body: readonly string[];
  readonly published: string;
}

export const posts: readonly Post[] = [
  {
    slug: "hello-ramonyx",
    title: "A content site with no client runtime",
    summary: "Every page is server-rendered HTML that can also be exported statically.",
    published: "2026-10-24",
    body: [
      "This starter renders a blog index and a dynamic post route on the server. No client-side data fetching is required for reading.",
      "Run `pnpm build:static` to prerender every post into dist/static. The same route tree also runs with `pnpm build && pnpm start` for SSR.",
    ],
  },
  {
    slug: "markdown-next",
    title: "Replace the demo data with Markdown",
    summary:
      "The post list is deliberately small and typed so a file/markdown source can replace it.",
    published: "2026-10-24",
    body: [
      "`src/data/posts.ts` is the only content source. Swap it for a filesystem loader or a CMS client and keep the page contract.",
      "Keep slugs validated and escape rendered HTML; never interpolate untrusted Markdown output without sanitizing it.",
    ],
  },
  {
    slug: "deploy-anywhere",
    title: "Deploy to static hosting or a Node server",
    summary: "The same pages can be exported, served by Ramonyx, or bundled for an edge target.",
    published: "2026-10-24",
    body: [
      "Static export produces HTML and hashed assets, so it works on Pages, Workers Assets, or any object store with a CDN.",
      "For dynamic features later, switch to the Node or edge target and add API routes without changing the blog URLs.",
    ],
  },
];

export function findPost(slug: string): Post | null {
  return posts.find((post) => post.slug === slug) ?? null;
}
