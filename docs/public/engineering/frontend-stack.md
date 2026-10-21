# Frontend stack decisions (docs site + landing)

This page records why the public site uses what it uses. Anything not listed here was rejected or
deferred — no silent dependencies.

## Site framework: Ramonyx itself (dogfood)

The public site is `apps/docs`, built with Ramonyx SSR + hydration + soft navigation. It is the
hardest dogfood we have: markdown rendering, search, code blocks, theming, and static export all run
through the framework on every docs deploy.

- **Why**: a documentation site is the first place a framework's rough edges show up. Using it keeps
  the public docs honest.
- **Cost**: features that are trivial in a static-site generator (MDX islands, plugin ecosystem)
  need framework-level work. We accept that cost for now.
- **Alternative rejected**: Next.js + Fumadocs. Faster to assemble, but it would hide exactly the
  regressions the dogfood is meant to catch, and would double the toolchain.

## Styling: hand-written CSS with design tokens (no Tailwind)

The site ships CSS custom properties (color, type scale, spacing, radius, motion) from the document
shell (`createDocument`). The visual system is **"onyx strata"**: porcelain paper, ink, and a cobalt
accent, with dark bands for technical sections; code panels stay dark in both site themes. The
landing uses a **landing-only CSS slice** (`DocumentOptions.path === "/"`) so docs layout rules do not
ship to the marketing page.

- **Why**: the docs app's client entry is generated from the page graph; wiring a CSS pipeline
  through the generated entry adds build coupling for little benefit at this size. Tokens give full
  control over the editorial look and keep the client bundle CSS-only.
- **Alternative rejected**: Tailwind v4. Good tool, but it would add a build plugin, a content
  scanning step, and class-name churn to a site whose visual system is a single tokenized stylesheet.
- **Revisit when**: the site grows beyond ~40 components or needs a component library.

## Typography: self-hosted OFL fonts

Display: **Instrument Serif** (400, roman + italic). Body/UI: **IBM Plex Sans** (400/500/600).
Code and labels use the system monospace stack. Latin subsets live in
`apps/docs/src/assets/fonts/` and go through the asset pipeline, so `@font-face` and the preload
links use the hashed resolver output. The display serif is `font-display: optional` and preloaded
(normal + italic); body Plex uses `swap`. Licenses and sources: `apps/docs/FONTS.md` (SIL OFL 1.1).

- **Why**: a distinctive editorial voice without a third-party font CDN or a build-time fetch.
- **Cost**: ~135 KB of WOFF2, served immutably with the other hashed assets.

## Animation and hydration

The landing wordmark uses a CSS clip wipe; chapters get a small transform transition from one
`IntersectionObserver` (`data-reveal`), and micro-interactions are pointer-driven. The hero particle
field is a **2D canvas**: it paints one static frame on load and redraws **one frame per pointer/scroll
batch** (no idle rAF loop), so it reacts without burning main-thread time. `prefers-reduced-motion`
disables the wipe, reveals, canvas motion, and magnetic effects. The docs ToC uses a rAF-throttled
scroll listener.

Hydration is deferred: `client.load: "interaction"` loads the client bundle on the first
pointer/wheel/key event, and `hydrateAll` runs on idle. This keeps the first paint/LCP CSS-only;
the trade-off is that interactivity is attached after the first input. A nonce bootstrap restores a
stored theme before paint. Long pages use `content-visibility: auto` with intrinsic sizes.

- **Why**: a content landing must be readable before JS; hydration was the largest LCP/TBT cost.
- **Open**: islands/partial hydration and route-level code splitting are not implemented; the
  client registry still imports all pages (recorded in `TODO.md`).
- **Alternative rejected**: Motion (Framer Motion). ~30 KB for effects we can express in CSS.

## Components: copy-in patterns, not a black-box library

Buttons, tabs, the command palette, and the table of contents follow copy-in patterns (ownership of
the code), without importing a component package.

## Markdown & code blocks

- `marked` (already used by the docs app) for markdown → HTML. The source is the public docs
  directory (trusted, not user input).
- **Shiki** for syntax highlighting at render time (server only — no highlighter in the client
  bundle). Code panels use the dark palette in both site themes, so the dark Shiki colors are used
  consistently.
- Fenced code metadata (` ```ts title="src/app.ts" `) renders a filename bar and a copy button.

## Search: static index + server API

A JSON index is generated from **public** docs only (slug, title, text). The command palette fetches
it once and filters in the browser; the SSR app also exposes `/api/cari` for programmatic search and
tests. Works on the static GitHub Pages export with no search service.

- **Alternative rejected**: Pagefind/Orama. Extra build/service dependency for a small docs set
  (page count in `machine/stats.json`); the index is small enough to filter client-side.

## Theme

Light by default; dark via `data-theme="dark"` or `prefers-color-scheme` when the user has not
chosen. The toggle stores the choice in `localStorage`; a tiny nonce-carrying bootstrap applies it
before paint, so a stored theme does not flash. Contrast targets WCAG AA in both themes.

## Hosting: Cloudflare Worker + static assets

The canonical site is a Cloudflare Worker (`pnpm build:worker`): `/` and `POST /` are the landing
edge SSR (streaming + waitlist action), everything else is the static docs export served by Workers
Assets. The waitlist uses a `WAITLIST` KV binding; `GITHUB_TOKEN` is optional for the stars cache.
`wrangler.toml` and the manual `deploy-worker.yml` are in the repo; GitHub Pages remains a static
mirror at `github.io/ramonyx` (base `/ramonyx`) without the custom domain. The edge artifact is
built landing-only (`pagePaths: ["/"]`) with a custom document; docs stay static.

- **Why**: GitHub Pages cannot execute actions or streaming; the Worker gives one origin with real
  server actions and keeps docs cheap.
- **Trade-off**: the landing's dynamic data is loader-based (resolved before render); deferred
  data/Suspense streaming is not implemented.

## Testing

Playwright for navigation, search (keyboard + snippets), code copy, theme toggle, the mobile docs
sidebar, and leak checks (`/docs/adr/0018` must be 404; internal search queries must return nothing).
`axe-core` for accessibility checks.
Lighthouse runs report-only (performance is measured, not gated, until the baselines are stable on
CI hardware).
