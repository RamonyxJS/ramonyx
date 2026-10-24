# __APP_NAME__ — docs/blog starter

A content-first Ramonyx app with a static export:

- `/` — post index
- `/blog/[slug]` — prerendered posts via `getStaticPaths()`
- `pnpm build:static` — HTML into `dist/static`, ready for Pages, Workers Assets, or any static host

## Run

```bash
pnpm install
pnpm dev
pnpm build:static
```

Add posts in `src/data/posts.ts`; the dynamic route and static path list update together. Replace
the in-memory post list with markdown/files or a CMS when you need real content workflow.

The docs site (`apps/docs` in the repository) is a larger example of the same SSR + static export
model.
