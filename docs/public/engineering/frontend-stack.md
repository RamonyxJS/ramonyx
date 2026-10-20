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

The site ships a single stylesheet in the document shell (`createDocument`), built from CSS custom
properties (color, type scale, spacing, radius, motion).

- **Why**: the docs app's client entry is generated from the page graph; wiring a CSS pipeline
  through the generated entry adds build coupling for little benefit at this size. Tokens give full
  control over the retro-terminal/high-contrast look and keep the client bundle CSS-only.
- **Alternative rejected**: Tailwind v4. Good tool, but it would add a build plugin, a content
  scanning step, and class-name churn to a site whose visual system is ~600 lines of CSS.
- **Revisit when**: the site grows beyond ~40 components or needs a component library.

## Animation: CSS transitions + IntersectionObserver

Scroll reveals and hover states use CSS (`prefers-reduced-motion` respected) with one small
IntersectionObserver helper for section reveals.

- **Why**: the landing needs deliberate, sparse motion — not layout animation choreography. CSS
  keeps the bundle ~0 KB for animation.
- **Alternative rejected**: Motion (Framer Motion). ~30 KB for effects we can express in CSS.

## Components: copy-in patterns, not a black-box library

Buttons, tabs, callouts, and the command palette follow shadcn-style copy-in patterns (ownership of
the code), without importing a component package.

## Markdown & code blocks

- `marked` (already used by the docs app) for markdown → HTML. The source is the public docs
  directory (trusted, not user input).
- **Shiki** for syntax highlighting at render time (server only — no highlighter in the client
  bundle), with dual light/dark themes driven by CSS variables.
- Fenced code metadata (` ```ts title="src/app.ts" `) renders a filename bar and a copy button.

## Search: static index + server API

A JSON index is generated from **public** docs only (slug, title, text). The command palette fetches
it once and filters in the browser; the SSR app also exposes `/api/cari` for programmatic search and
tests. Works on the static GitHub Pages export with no search service.

- **Alternative rejected**: Pagefind/Orama. Extra build/service dependency for a 15-page site; the
  index is small enough to filter client-side.

## Theme

Dark by default, light theme via `data-theme="light"`, following `prefers-color-scheme` when the
user has not chosen. The toggle stores the choice in `localStorage`; a tiny nonce-carrying script
applies it before hydration (no layout flash in the common case). Contrast targets WCAG AA.

## Testing

Playwright for navigation, search, code copy, theme toggle, and leak checks (`/docs/adr/0018` must
be 404; internal search queries must return nothing). `axe-core` for accessibility checks.
Lighthouse runs report-only (performance is measured, not gated, until the baselines are stable on
CI hardware).
