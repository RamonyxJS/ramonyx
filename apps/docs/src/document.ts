// Dokumen HTML + design system situs publik (dogfood: Ramonyx SSR).
// Arah: "onyx strata" — kertas porselen + tinta + kobalt, serif editorial untuk display,
// Plex Sans untuk teks, mono sistem untuk label/kode. Pita gelap untuk bagian teknis.
// Default terang; gelap via `data-theme="dark"` atau preferensi sistem.

import type { DocumentRenderer } from "@ramonyx/ssr";

export interface DocumentFonts {
  readonly serif: string;
  readonly serifItalic: string;
  readonly sans400: string;
  readonly sans500: string;
  readonly sans600: string;
}

const FONT_BAWAAN: DocumentFonts = {
  serif: "/assets/fonts/instrument-serif-latin.woff2",
  serifItalic: "/assets/fonts/instrument-serif-italic-latin.woff2",
  sans400: "/assets/fonts/plex-sans-400-latin.woff2",
  sans500: "/assets/fonts/plex-sans-500-latin.woff2",
  sans600: "/assets/fonts/plex-sans-600-latin.woff2",
};

const GAYA = (fonts: DocumentFonts): string => `
@font-face {
  font-family: "Instrument Serif"; font-style: normal; font-weight: 400;
  font-display: optional; src: url("${fonts.serif}") format("woff2");
}
@font-face {
  font-family: "Instrument Serif"; font-style: italic; font-weight: 400;
  font-display: optional; src: url("${fonts.serifItalic}") format("woff2");
}
@font-face {
  font-family: "IBM Plex Sans"; font-style: normal; font-weight: 400;
  font-display: swap; src: url("${fonts.sans400}") format("woff2");
}
@font-face {
  font-family: "IBM Plex Sans"; font-style: normal; font-weight: 500;
  font-display: swap; src: url("${fonts.sans500}") format("woff2");
}
@font-face {
  font-family: "IBM Plex Sans"; font-style: normal; font-weight: 600;
  font-display: swap; src: url("${fonts.sans600}") format("woff2");
}

:root {
  color-scheme: light;
  --paper: #f3f1e9;
  --paper-2: #eae7dc;
  --ink: #14160f;
  --ink-2: #34382c;
  --muted: #565c4e;
  --line: #d7d3c5;
  --line-2: #bcb7a5;
  --accent: #2340c8;
  --accent-ink: #f7f5ee;
  --accent-soft: #dfe3fb;
  --band: #11130d;
  --band-2: #171a10;
  --band-fg: #efede2;
  --band-muted: #a7ab9a;
  --band-line: #2b2f23;
  --band-accent: #a9b9ff;
  --code-bg: #0c0e08;
  --code-head: #151810;
  --code-fg: #e9ebdd;
  --code-muted: #969d89;
  --hero-blok: #2340c8;
  --hero-blok-garis: transparent;
  --radius: 3px;
  --max: 1200px;
  --font-display: "Instrument Serif", "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  --font-sans: "IBM Plex Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, "Cascadia Mono", Menlo, Consolas, monospace;
  --ease: cubic-bezier(0.2, 0.7, 0.2, 1);
}
html[data-theme="dark"] {
  color-scheme: dark;
  --paper: #0c0e09;
  --paper-2: #12150e;
  --ink: #e9ebdd;
  --ink-2: #c6c9ba;
  --muted: #9ba18f;
  --line: #262a1f;
  --line-2: #3a4030;
  --accent: #a9b9ff;
  --accent-ink: #0c0e09;
  --accent-soft: #1a1f33;
  --band: #14170f;
  --band-2: #191d12;
  --band-line: #2b2f23;
  --code-bg: #12150d;
  --code-head: #191d12;
  --hero-blok: #29335c;
  --hero-blok-garis: #3b487f;
}
@media (prefers-color-scheme: dark) {
  html:not([data-theme]) {
    color-scheme: dark;
    --paper: #0c0e09;
    --paper-2: #12150e;
    --ink: #e9ebdd;
    --ink-2: #c6c9ba;
    --muted: #9ba18f;
    --line: #262a1f;
    --line-2: #3a4030;
    --accent: #a9b9ff;
    --accent-ink: #0c0e09;
    --accent-soft: #1a1f33;
    --band: #14170f;
    --band-2: #191d12;
    --band-line: #2b2f23;
    --code-bg: #12150d;
    --code-head: #191d12;
    --hero-blok: #29335c;
    --hero-blok-garis: #3b487f;
  }
}

* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
body {
  margin: 0; overflow-x: clip;
  background: var(--paper);
  color: var(--ink);
  font: 400 16.5px/1.68 var(--font-sans);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
::selection { background: var(--accent); color: var(--accent-ink); }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
a { color: inherit; text-decoration-color: color-mix(in srgb, var(--accent) 45%, transparent); text-underline-offset: 3px; }
a:hover { text-decoration-color: var(--accent); }
code, pre, kbd { font-family: var(--font-mono); }
h1, h2, h3, h4 {
  font-family: var(--font-display);
  font-weight: 400;
  line-height: 1.05;
  letter-spacing: -0.015em;
  margin: 0 0 0.5em;
  text-wrap: balance;
}
p { margin: 0 0 1em; text-wrap: pretty; }
img { max-width: 100%; height: auto; }
.dim { color: var(--muted); }
.mono { font-family: var(--font-mono); }
.eyebrow {
  display: flex; align-items: center; gap: 9px;
  font-family: var(--font-mono); font-size: 12px; color: var(--accent); margin: 0 0 18px;
}
.wrap { width: min(100% - 48px, var(--max)); margin-inline: auto; }
.shell { min-height: 100vh; display: flex; flex-direction: column; }

/* ── Lewati navigasi ─────────────────────────────────────── */
.lewati {
  position: absolute; left: 16px; top: -56px; z-index: 100;
  background: var(--ink); color: var(--paper); padding: 10px 14px;
  text-decoration: none; border-radius: var(--radius);
}
.lewati:focus { top: 12px; }

/* ── Topbar ──────────────────────────────────────────────── */
.topbar {
  position: sticky; top: 0; z-index: 40;
  background: var(--paper);
  border-bottom: 1px solid var(--line);
}
.topbar-dalam { display: flex; align-items: center; gap: 26px; height: 66px; }
.merek {
  display: inline-flex; align-items: center; gap: 10px;
  text-decoration: none; font-family: var(--font-display);
  font-size: 23px; line-height: 1; letter-spacing: -0.01em;
}
.merek:hover { color: var(--ink); }
.merek-tanda {
  width: 11px; height: 11px; background: var(--accent);
  transform: rotate(45deg); display: inline-block; flex: 0 0 auto;
}
.merek-tag {
  font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.08em;
  color: var(--muted); border-left: 1px solid var(--line-2);
  padding-left: 10px; margin-left: 2px;
}
.topnav { display: flex; gap: 22px; margin-left: 10px; font-size: 14px; }
.topnav a {
  text-decoration: none; color: var(--muted); padding: 6px 0;
  border-bottom: 1px solid transparent; transition: color 0.18s var(--ease);
}
.topnav a:hover, .topnav a[aria-current="page"] { color: var(--ink); border-bottom-color: var(--accent); }
.topbar-aksi { margin-left: auto; display: flex; align-items: center; gap: 8px; }
.tombol {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  height: 36px; padding: 0 16px; font-size: 14px; font-weight: 500;
  text-decoration: none; border: 1px solid var(--line-2); border-radius: var(--radius);
  color: var(--ink); background: transparent; cursor: pointer;
  transition: background 0.18s var(--ease), color 0.18s var(--ease), border-color 0.18s var(--ease);
}
.tombol:hover { background: var(--ink); color: var(--paper); border-color: var(--ink); }
.tombol.utama { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
.tombol.utama:hover {
  background: color-mix(in srgb, var(--accent) 84%, #000);
  color: var(--accent-ink); border-color: transparent;
}
.tombol-ikon {
  width: 36px; height: 36px; display: inline-flex; align-items: center; justify-content: center;
  background: transparent; border: 1px solid var(--line-2); border-radius: var(--radius);
  color: var(--ink); cursor: pointer;
}
.tombol-ikon:hover { border-color: var(--ink); }
.tombol-ikon svg { width: 16px; height: 16px; }
.cari-pemicu {
  display: inline-flex; align-items: center; gap: 8px; height: 36px; padding: 0 10px;
  background: transparent; border: 1px solid var(--line); border-radius: var(--radius);
  color: var(--muted); cursor: pointer; font: 500 13px var(--font-sans);
}
.cari-pemicu:hover { border-color: var(--line-2); color: var(--ink); }
.cari-pemicu svg { width: 14px; height: 14px; }
.cari-pemicu kbd {
  font-size: 10px; color: var(--muted); border: 1px solid var(--line);
  border-radius: 2px; padding: 1px 5px; background: var(--paper-2);
}

/* ── Landing: hero ───────────────────────────────────────── */
.landing { flex: 1; }
.hero {
  position: relative; padding: 88px 0 76px;
  border-bottom: 1px solid var(--line); overflow: hidden;
}
.hero::before {
  content: ""; position: absolute; inset: 0; pointer-events: none;
  background-image: linear-gradient(90deg, var(--line) 1px, transparent 1px);
  background-size: 25% 100%;
  opacity: 0.28;
  mask-image: linear-gradient(180deg, #000 0%, transparent 92%);
}
.hero-grid {
  position: relative; display: grid; grid-template-columns: 1.08fr 0.92fr;
  gap: 64px; align-items: center;
}
.kicker {
  display: flex; align-items: center; gap: 9px;
  font-family: var(--font-mono); font-size: 12px; letter-spacing: 0.01em;
  color: var(--muted); margin: 0 0 26px;
}
.kicker-tanda {
  width: 6px; height: 6px; background: var(--accent);
  transform: rotate(45deg); display: inline-block; flex: 0 0 auto;
}
.hero h1 {
  font-size: clamp(52px, 7.2vw, 92px); line-height: 0.98;
  letter-spacing: -0.025em; margin: 0 0 26px;
}
.hero h1 em { font-style: italic; color: var(--accent); }
.lede {
  font-size: clamp(17px, 1.45vw, 20px); line-height: 1.55;
  color: var(--muted); max-width: 46ch; margin: 0 0 30px;
}
.aksi-baris { display: flex; flex-wrap: wrap; align-items: center; gap: 20px; }
.tautan-panah {
  display: inline-flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 500;
  text-decoration: none; border-bottom: 1px solid var(--line-2); padding-bottom: 2px;
}
.tautan-panah span { transition: transform 0.2s var(--ease); }
.tautan-panah:hover span { transform: translateX(3px); }
.install {
  display: flex; align-items: center; gap: 10px; margin-top: 26px;
  padding: 10px 12px; border: 1px solid var(--line); border-radius: var(--radius);
  background: var(--paper-2); max-width: 430px;
  font-family: var(--font-mono); font-size: 12.5px;
}
.install-prompt { color: var(--accent); }
.install code { flex: 1; overflow-x: auto; white-space: nowrap; color: var(--ink-2); }
.install .copy {
  margin-left: auto; background: transparent; border: 1px solid var(--line-2);
  color: var(--muted); border-radius: 2px; padding: 3px 8px;
  font: 500 10.5px var(--font-mono); cursor: pointer;
}
.install .copy:hover { color: var(--ink); border-color: var(--ink); }

.hero-visual { position: relative; }
.terminal-bingkai { position: relative; z-index: 0; }
.terminal-bingkai::before {
  content: ""; position: absolute; z-index: -1;
  inset: 22px -14px -22px 30px;
  background: var(--hero-blok);
  border: 1px solid var(--hero-blok-garis);
}
.terminal {
  position: relative; background: var(--band); color: var(--band-fg);
  border: 1px solid var(--band-line); border-radius: var(--radius); overflow: hidden;
  box-shadow: 0 30px 80px -46px rgba(0, 0, 0, 0.7);
}
.terminal-bar {
  display: flex; align-items: center; gap: 6px; padding: 11px 14px;
  border-bottom: 1px solid var(--band-line); background: var(--band-2);
  font-family: var(--font-mono); font-size: 10.5px; color: var(--band-muted);
}
.terminal-bar i { width: 7px; height: 7px; border-radius: 50%; background: #3a4030; display: inline-block; }
.terminal-bar span { margin-left: 8px; }
.terminal-isi {
  padding: 20px; font-family: var(--font-mono); font-size: 12.5px;
  line-height: 1.85; color: var(--code-fg);
}
.terminal-isi .baris { display: flex; gap: 8px; }
.terminal-isi .prompt { color: var(--band-accent); }
.terminal-isi .komentar { color: var(--code-muted); }
.terminal-isi .siap { color: var(--band-accent); }
.terminal-isi .cursor {
  display: inline-block; width: 7px; height: 13px; background: var(--band-accent);
  vertical-align: -2px; animation: kedip 1.1s steps(1) infinite;
}
@keyframes kedip { 50% { opacity: 0; } }
.penjaga {
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px;
  margin-top: 30px; padding-top: 12px; border-top: 1px solid var(--line);
  font-family: var(--font-mono); font-size: 10.5px; color: var(--muted);
}
.penjaga-label { color: var(--accent); }
.penjaga span + span::before { content: "·"; margin-right: 14px; color: var(--line-2); }

/* Animasi masuk hero (satu momen, bukan per-bagian). */
.hero-copy > *, .hero-visual { animation: naik 0.7s var(--ease) both; }
.hero-copy > :nth-child(2) { animation-delay: 0.06s; }
.hero-copy > :nth-child(3) { animation-delay: 0.12s; }
.hero-copy > :nth-child(4) { animation-delay: 0.18s; }
.hero-copy > :nth-child(5) { animation-delay: 0.24s; }
.hero-visual { animation-delay: 0.16s; }
@keyframes naik { from { opacity: 0; transform: translateY(12px); } }

/* ── Bukti (pita gelap) ──────────────────────────────────── */
.bukti { background: var(--band); color: var(--band-fg); border-bottom: 1px solid var(--band-line); }
.bukti-grid { display: grid; grid-template-columns: repeat(4, 1fr); }
.bukti-sel { padding: 34px 26px; border-right: 1px solid var(--band-line); }
.bukti-sel:last-child { border-right: 0; }
.bukti-angka {
  font-family: var(--font-display); font-size: 38px; line-height: 1;
  letter-spacing: -0.01em; margin-bottom: 10px;
}
.bukti-label { font-family: var(--font-mono); font-size: 10.5px; color: var(--band-muted); }

/* ── Bagian landing ──────────────────────────────────────── */
.bagian { padding: 96px 0; border-bottom: 1px solid var(--line); }
.bagian-kepala {
  display: grid; grid-template-columns: 180px 1fr;
  gap: 44px; margin-bottom: 48px;
}
.bagian-kicker {
  display: flex; align-items: center; gap: 9px; padding-top: 10px;
  font-family: var(--font-mono); font-size: 12px; color: var(--accent);
}
.bagian-kicker::after { content: ""; height: 1px; width: 34px; background: var(--line-2); }
.bagian h2 { font-size: clamp(34px, 4vw, 52px); margin: 0 0 12px; }
.bagian-intro { font-size: 17px; color: var(--muted); max-width: 62ch; margin: 0; }
.narasi { display: grid; grid-template-columns: 1fr 1.05fr; gap: 56px; align-items: center; }
.narasi.terbalik .narasi-teks { order: 2; }
.narasi-teks h3 { font-size: 26px; margin-bottom: 12px; }
.narasi-teks p { color: var(--muted); font-size: 15.5px; }
.daftar-poin { list-style: none; margin: 20px 0 0; padding: 0; display: grid; gap: 9px; }
.daftar-poin li {
  position: relative; padding-left: 22px;
  font-size: 14.5px; color: var(--ink-2); line-height: 1.55;
}
.daftar-poin li::before {
  content: ""; position: absolute; left: 0; top: 0.5em;
  width: 7px; height: 7px;
  border: 1px solid var(--accent); transform: rotate(45deg);
}
.daftar-poin a { color: var(--accent); text-decoration: none; }
.daftar-poin a:hover { text-decoration: underline; }
.narasi-teks code, .bagian-intro code, .docs-intro code, .galat code {
  background: color-mix(in srgb, var(--ink) 6%, transparent);
  border: 1px solid var(--line); border-radius: 2px;
  padding: 1px 5px; font-size: 0.88em; white-space: nowrap;
}
.bagian-gelap .narasi-teks code, .bagian-gelap .bagian-intro code {
  background: rgba(255, 255, 255, 0.07); border-color: var(--band-line);
  color: var(--band-fg);
}
.bagian-gelap :focus-visible, .kaki :focus-visible,
.cari-panel :focus-visible, .kode-panel :focus-visible {
  outline-color: var(--band-accent);
}

/* Panel kode landing (selalu gelap, seperti blok kode docs). */
.kode-panel {
  margin: 0; border: 1px solid #2a2e22; border-radius: var(--radius);
  background: var(--code-bg); overflow: hidden;
  box-shadow: 0 20px 55px -44px rgba(0, 0, 0, 0.8);
}
.kode-kepala {
  display: flex; align-items: center; gap: 10px; padding: 9px 14px;
  background: var(--code-head); border-bottom: 1px solid #262a1e;
  font-family: var(--font-mono); font-size: 10.5px; color: var(--code-muted);
}
.kode-berkas { color: var(--code-fg); }
.kode-bahasa { color: var(--code-muted); }
.kode-panel pre {
  margin: 0; padding: 18px 18px 20px; overflow-x: auto;
  font-size: 12.8px; line-height: 1.75; color: var(--code-fg); tab-size: 2;
}
.kode-panel pre:focus-visible { outline-color: var(--band-accent); outline-offset: -2px; }
.kode-panel .prompt { color: var(--band-accent); }
.tab-catatan { margin: 14px 0 0; color: var(--muted); font-size: 14.5px; max-width: 70ch; }

/* Tarikan (pull quote) */
.tarikan { padding: 56px 0; background: var(--paper-2); border-bottom: 1px solid var(--line); }
.tarikan-dalam { display: grid; grid-template-columns: 180px 1fr; gap: 44px; align-items: start; }
.tarikan p {
  font-family: var(--font-display); font-size: clamp(28px, 3.4vw, 42px);
  line-height: 1.12; letter-spacing: -0.01em; margin: 0; max-width: 28ch;
}
.tarikan cite {
  display: block; margin-top: 12px; font-family: var(--font-mono);
  font-size: 10.5px; font-style: normal; color: var(--muted);
}

/* Tabs deploy */
.tabs {
  display: flex; gap: 28px; border-bottom: 1px solid var(--line);
  margin-bottom: 20px;
}
.tab {
  background: none; border: 0; border-bottom: 2px solid transparent;
  padding: 10px 0 12px; margin-bottom: -1px;
  font: 500 14px var(--font-sans); color: var(--muted); cursor: pointer;
}
.tab:hover { color: var(--ink); }
.tab[aria-selected="true"] { color: var(--ink); border-bottom-color: var(--accent); }
.tab:focus-visible { outline-offset: 6px; }

/* Pita gelap bagian agen */
.bagian-gelap { background: var(--band); color: var(--band-fg); border-bottom: 1px solid var(--band-line); }
.bagian-gelap .bagian-kicker { color: var(--band-accent); }
.bagian-gelap .bagian-kicker::after { background: var(--band-line); }
.bagian-gelap h2, .bagian-gelap h3 { color: var(--band-fg); }
.bagian-gelap .bagian-intro, .bagian-gelap .narasi-teks p { color: var(--band-muted); }
.bagian-gelap .daftar-poin li { color: var(--band-fg); }
.bagian-gelap .daftar-poin li::before { border-color: var(--band-accent); }
.bagian-gelap .daftar-poin a { color: var(--band-accent); }
.bagian-gelap .kode-panel { border-color: var(--band-line); box-shadow: none; }

/* Strip stack */
.strip { padding: 24px 0; border-bottom: 1px solid var(--line); }
.strip-dalam {
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px;
  font-family: var(--font-mono); font-size: 11.5px; color: var(--muted);
}
.strip-label { color: var(--ink); margin-right: 4px; }
.strip-dalam span + span::before { content: "·"; margin-right: 14px; color: var(--line-2); }

/* ── Footer ─────────────────────────────────────────────── */
.kaki { background: var(--band); color: var(--band-fg); margin-top: auto; }
.kaki-utama {
  display: grid; grid-template-columns: 1.4fr 1fr 1fr 1fr;
  gap: 40px; padding: 64px 0 48px;
}
.kaki-nama {
  display: block; font-family: var(--font-display); font-size: clamp(40px, 5vw, 64px);
  line-height: 1; letter-spacing: -0.02em; margin-bottom: 14px;
}
.kaki-tagline { color: var(--band-muted); max-width: 34ch; font-size: 14px; margin: 0; }
.kaki-judul {
  font-family: var(--font-mono); font-size: 10.5px; color: var(--band-muted);
  margin-bottom: 12px;
}
.kaki-kolom ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; font-size: 14px; }
.kaki-kolom a { text-decoration: none; color: var(--band-fg); }
.kaki-kolom a:hover { color: var(--band-accent); }
.kaki-bawah {
  display: flex; flex-wrap: wrap; justify-content: space-between; gap: 16px;
  padding: 18px 0 26px; border-top: 1px solid var(--band-line);
  font-family: var(--font-mono); font-size: 10.5px; color: var(--band-muted);
}

/* ── Docs ───────────────────────────────────────────────── */
.docs {
  flex: 1; display: grid; grid-template-columns: 250px minmax(0, 1fr);
  gap: 56px; width: min(100% - 48px, var(--max));
  margin-inline: auto; padding: 44px 0 96px;
}
.sidebar {
  position: sticky; top: 88px; align-self: start;
  max-height: calc(100vh - 112px); overflow-y: auto;
  border-right: 1px solid var(--line); padding: 0 24px 24px 0;
  scrollbar-width: thin;
}
.sidebar-seksi { margin-bottom: 22px; }
.sidebar-judul {
  font-family: var(--font-mono); font-size: 10px;
  letter-spacing: 0.04em; color: var(--muted); margin-bottom: 7px;
}
.sidebar ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 1px; }
.sidebar a {
  display: block; padding: 5px 8px; margin-left: -8px;
  border-left: 2px solid transparent; font-size: 13.5px;
  color: var(--muted); text-decoration: none; line-height: 1.35;
}
.sidebar a:hover { color: var(--ink); }
.sidebar a[aria-current="page"] { color: var(--ink); border-left-color: var(--accent); font-weight: 500; }
.sidebar-mobile { display: none; }
.sidebar-mobile summary {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 0; cursor: pointer; font-family: var(--font-mono);
  font-size: 12px; color: var(--ink); list-style: none;
}
.sidebar-mobile summary::-webkit-details-marker { display: none; }
.sidebar-mobile summary::after { content: "+"; color: var(--accent); font-size: 16px; }
.sidebar-mobile[open] summary::after { content: "−"; }
.sidebar-mobile .sidebar { position: static; display: block; max-height: none; padding: 8px 0 16px; border-right: 0; }
.sidebar-mobile .sidebar-seksi:last-child { margin-bottom: 8px; }

.docs-utama { min-width: 0; }
.remah {
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
  font-family: var(--font-mono); font-size: 10.5px; color: var(--muted);
  margin: 0 0 26px;
}
.remah a { text-decoration: none; }
.remah a:hover { color: var(--accent); }
.remah .pemisah { color: var(--line-2); }

.docs-intro { max-width: 64ch; margin-bottom: 44px; }
.docs-intro h1 { font-size: clamp(42px, 5vw, 60px); margin: 0 0 16px; }
.docs-intro p { color: var(--muted); font-size: 17px; }
.docs-intro a { color: var(--accent); }
.katalog { display: grid; grid-template-columns: 1fr 1fr; gap: 0 56px; }
.katalog-bagian { border-top: 1px solid var(--line); padding: 20px 0 34px; }
.katalog-bagian h2 { font-size: 24px; margin: 0 0 10px; }
.katalog-bagian ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 1px; }
.katalog-bagian a {
  display: flex; justify-content: space-between; gap: 12px;
  padding: 6px 0; text-decoration: none; font-size: 15.5px;
  color: var(--ink); border-bottom: 1px solid transparent;
}
.katalog-bagian a::after {
  content: "→"; color: var(--line-2);
  transition: color 0.18s var(--ease), transform 0.18s var(--ease);
}
.katalog-bagian a:hover::after { color: var(--accent); transform: translateX(3px); }

.dokumen { max-width: 72ch; }
.dokumen h1 { font-size: clamp(38px, 4.3vw, 50px); line-height: 1.02; margin: 0 0 22px; }
.dokumen h2 {
  font-size: 30px; margin: 52px 0 14px; padding-top: 16px;
  border-top: 1px solid var(--line);
}
.dokumen h3 {
  font-family: var(--font-sans); font-weight: 600; font-size: 17px;
  letter-spacing: -0.005em; margin: 32px 0 8px;
}
.dokumen p, .dokumen li { color: var(--ink-2); font-size: 16px; line-height: 1.72; }
.dokumen a { color: var(--accent); text-decoration-thickness: 1px; text-underline-offset: 2px; }
.dokumen strong { font-weight: 600; color: var(--ink); }
.dokumen ul, .dokumen ol { padding-left: 1.25em; margin: 0 0 1em; }
.dokumen li { margin-bottom: 0.35em; }
.dokumen li::marker { color: var(--accent); }
.dokumen .jangkar {
  margin-left: -0.85em; padding-right: 0.35em;
  color: var(--accent); text-decoration: none; opacity: 0;
}
.dokumen h2:hover .jangkar, .dokumen h3:hover .jangkar,
.dokumen .jangkar:focus-visible { opacity: 1; }
.dokumen blockquote {
  margin: 22px 0; padding: 2px 0 2px 18px;
  border-left: 2px solid var(--accent); color: var(--muted);
}
.dokumen blockquote p { color: var(--muted); }
.dokumen hr { border: 0; border-top: 1px solid var(--line); margin: 36px 0; }
.dokumen code {
  background: var(--paper-2); border: 1px solid var(--line);
  border-radius: 2px; padding: 1px 5px; font-size: 0.88em; color: var(--ink);
}
.dokumen pre code {
  background: none; border: 0; border-radius: 0; padding: 0;
  font-size: inherit; color: inherit;
}
.dokumen h1, .dokumen h2, .dokumen h3 { scroll-margin-top: 88px; }
.dokumen table {
  width: 100%; border-collapse: collapse; margin: 22px 0;
  font-size: 14px; display: block; overflow-x: auto;
}
.dokumen th {
  font-family: var(--font-mono); font-size: 10.5px; font-weight: 500;
  color: var(--muted); text-align: left; white-space: nowrap;
  border-bottom: 1px solid var(--line-2); padding: 8px 14px 8px 0;
}
.dokumen td {
  border-bottom: 1px solid var(--line);
  padding: 10px 14px 10px 0; vertical-align: top;
}
.dokumen tr:last-child td { border-bottom: 0; }
.dokumen td code { white-space: nowrap; }

/* Blok kode markdown (selalu gelap di kedua tema). */
.code {
  margin: 24px 0; border: 1px solid #2a2e22; border-radius: var(--radius);
  background: var(--code-bg); overflow: hidden;
}
.code-head {
  display: flex; align-items: center; gap: 10px; padding: 9px 14px;
  background: var(--code-head); border-bottom: 1px solid #262a1e;
  font-family: var(--font-mono); font-size: 10.5px; color: var(--code-muted);
}
.code-file { color: var(--code-fg); }
.code-lang { color: var(--code-muted); }
.copy {
  margin-left: auto; display: none; background: transparent;
  border: 1px solid #363c2c; color: var(--code-muted); border-radius: 2px;
  padding: 3px 9px; font: 500 10px var(--font-mono); cursor: pointer;
}
html.js .copy { display: inline-flex; }
.copy:hover { color: var(--code-fg); border-color: var(--band-accent); }
.code-body pre {
  margin: 0; padding: 18px; overflow-x: auto;
  font-size: 12.8px; line-height: 1.75;
  background: transparent !important; color: var(--code-fg); tab-size: 2;
}
.code-body pre:focus-visible { outline-color: var(--band-accent); outline-offset: -2px; }
.code-body .shiki { background: transparent !important; }
.shiki span { color: var(--shiki-dark); }

/* ToC */
.docs-tata { display: grid; grid-template-columns: minmax(0, 72ch) 190px; gap: 48px; }
.toc {
  position: sticky; top: 88px; align-self: start; font-size: 12.5px;
  border-left: 1px solid var(--line); padding-left: 16px;
}
.toc-judul {
  font-family: var(--font-mono); font-size: 10px;
  color: var(--muted); margin-bottom: 10px;
}
.toc ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 5px; }
.toc a { display: block; color: var(--muted); text-decoration: none; line-height: 1.35; }
.toc a:hover { color: var(--ink); }
.toc a[aria-current="location"] { color: var(--ink); font-weight: 500; }
.toc a[aria-current="location"]::before {
  content: ""; display: inline-block; width: 5px; height: 5px;
  background: var(--accent); transform: rotate(45deg);
  margin-right: 8px; margin-left: -13px; vertical-align: 2px;
}
.toc .kedalaman-3 { padding-left: 12px; }
.toc-mobile {
  display: none; margin: 0 0 32px;
  border-top: 1px solid var(--line); border-bottom: 1px solid var(--line);
}
.toc-mobile summary {
  padding: 12px 0; cursor: pointer; font-family: var(--font-mono);
  font-size: 11px; color: var(--ink); list-style: none;
}
.toc-mobile summary::-webkit-details-marker { display: none; }
.toc-mobile summary::after { content: " +"; color: var(--accent); }
.toc-mobile[open] summary::after { content: " −"; }
.toc-mobile ul { list-style: none; margin: 0; padding: 0 0 12px; display: grid; gap: 6px; }
.toc-mobile a { color: var(--muted); text-decoration: none; font-size: 14px; }
.toc-mobile a:hover { color: var(--ink); }

.docs-kaki {
  display: grid; grid-template-columns: 1fr 1fr; gap: 24px;
  margin-top: 64px; padding-top: 22px; border-top: 1px solid var(--line);
}
.docs-kaki > div + div { text-align: right; }
.docs-kaki .label {
  display: block; font-family: var(--font-mono); font-size: 10px;
  color: var(--muted); margin-bottom: 6px;
}
.docs-kaki a { text-decoration: none; font-size: 15px; font-weight: 500; }
.docs-kaki a:hover { color: var(--accent); }
.sunting {
  display: inline-block; margin-top: 14px; font-family: var(--font-mono);
  font-size: 11px; color: var(--muted);
}
.sunting:hover { color: var(--accent); }

/* ── Pencarian ──────────────────────────────────────────── */
.cari-lapis {
  position: fixed; inset: 0; z-index: 70;
  background: color-mix(in srgb, var(--band) 55%, transparent);
  backdrop-filter: blur(8px);
  display: flex; align-items: flex-start; justify-content: center;
  padding: 10vh 20px 20px;
}
.cari-tutup { position: absolute; inset: 0; background: transparent; border: 0; cursor: default; }
.cari-panel {
  position: relative; width: min(640px, 100%);
  background: var(--band); color: var(--band-fg);
  border: 1px solid var(--band-line); border-radius: var(--radius);
  overflow: hidden; box-shadow: 0 50px 140px -40px rgba(0, 0, 0, 0.8);
}
.cari-kepala {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; border-bottom: 1px solid var(--band-line);
  font-family: var(--font-mono); font-size: 10.5px; color: var(--band-muted);
}
.cari-kepala kbd { border: 1px solid var(--band-line); border-radius: 2px; padding: 1px 5px; }
.cari-input {
  width: 100%; border: 0; background: transparent; color: var(--band-fg);
  font: 400 19px var(--font-sans); padding: 18px; outline: none;
  border-bottom: 1px solid var(--band-line);
}
.cari-input::placeholder { color: var(--band-muted); }
.cari-input::-webkit-search-cancel-button { display: none; }
.cari-hasil { max-height: 54vh; overflow-y: auto; padding: 8px; }
.cari-hasil p { margin: 14px 12px; color: var(--band-muted); font-size: 13px; }
.cari-entri {
  display: grid; gap: 3px; padding: 10px 12px;
  border-left: 2px solid transparent; text-decoration: none; color: var(--band-fg);
}
.cari-entri:hover, .cari-entri[data-selected="true"] {
  background: color-mix(in srgb, var(--band-accent) 12%, var(--band-2));
  border-left-color: var(--band-accent);
}
.cari-judul { font-weight: 500; font-size: 14px; }
.cari-potongan { font-size: 12px; color: var(--band-muted); line-height: 1.45; }
.cari-kaki {
  padding: 10px 16px; border-top: 1px solid var(--band-line);
  font-family: var(--font-mono); font-size: 10px; color: var(--band-muted);
}

/* ── Halaman error ──────────────────────────────────────── */
.galat { flex: 1; padding: 96px 0 120px; }
.galat-kode {
  font-family: var(--font-display); font-size: clamp(90px, 16vw, 170px);
  line-height: 0.85; letter-spacing: -0.03em; margin: 0 0 16px;
}
.galat h1 { font-size: 32px; margin-bottom: 10px; }
.galat .aksi-baris { margin-top: 28px; }

/* ── Responsif ──────────────────────────────────────────── */
@media (max-width: 1100px) {
  .hero-grid { gap: 40px; }
  .bagian-kepala, .tarikan-dalam { grid-template-columns: 140px 1fr; gap: 28px; }
  .docs { grid-template-columns: 220px minmax(0, 1fr); gap: 36px; }
  .docs-tata { grid-template-columns: minmax(0, 1fr) 160px; gap: 32px; }
}
@media (max-width: 980px) {
  .hero { padding: 64px 0 56px; }
  .hero::before { display: none; }
  .hero-grid { grid-template-columns: 1fr; gap: 48px; }
  .hero-visual { max-width: 560px; }
  .bagian { padding: 72px 0; }
  .bagian-kepala, .tarikan-dalam { grid-template-columns: 1fr; gap: 12px; }
  .bagian-kicker { padding-top: 0; }
  .narasi { grid-template-columns: 1fr; gap: 28px; }
  .narasi.terbalik .narasi-teks { order: 0; }
  .bukti-grid { grid-template-columns: repeat(2, 1fr); }
  .bukti-sel:nth-child(2) { border-right: 0; }
  .bukti-sel:nth-child(-n + 2) { border-bottom: 1px solid var(--band-line); }
  .docs { grid-template-columns: minmax(0, 1fr); gap: 0; padding-top: 24px; }
  .sidebar { display: none; }
  .sidebar-mobile { display: block; border-bottom: 1px solid var(--line); margin-bottom: 28px; }
  .docs-tata { grid-template-columns: minmax(0, 1fr); gap: 0; }
  .toc { display: none; }
  .toc-mobile { display: block; }
  .katalog { grid-template-columns: 1fr; }
  .kaki-utama { grid-template-columns: 1fr 1fr; gap: 32px; }
}
@media (max-width: 700px) {
  .wrap { width: calc(100% - 32px); }
  .topbar-dalam { gap: 12px; }
  .topnav { display: none; }
  .merek-tag { display: none; }
  .cari-pemicu kbd { display: none; }
  .hero h1 { font-size: clamp(44px, 11vw, 64px); }
  .terminal-bingkai::before { display: none; }
  .bukti-grid { grid-template-columns: 1fr; }
  .bukti-sel { border-right: 0; border-bottom: 1px solid var(--band-line); padding: 24px 18px; }
  .bukti-sel:last-child { border-bottom: 0; }
  .bukti-angka { font-size: 30px; }
  .bagian { padding: 60px 0; }
  .docs { padding-top: 18px; }
  .docs-kaki { grid-template-columns: 1fr; gap: 18px; }
  .docs-kaki > div + div { text-align: left; }
  .kaki-utama { grid-template-columns: 1fr; padding: 48px 0 36px; }
  .kaki-bawah { flex-direction: column; gap: 6px; }
  .tab { padding: 8px 0 10px; }
  .tabs { gap: 20px; overflow-x: auto; }
  .tarikan { padding: 44px 0; }
  .install { max-width: none; }
}
@media (max-width: 480px) {
  .topbar-aksi .tombol.utama { display: none; }
  .hero-aksi { gap: 16px; }
}

/* ── Cetak ──────────────────────────────────────────────── */
@media print {
  .topbar, .sidebar, .sidebar-mobile, .toc, .toc-mobile, .docs-kaki, .kaki,
  .sunting, .lewati, .cari-lapis { display: none !important; }
  body { background: #fff; color: #000; }
  .docs { display: block; width: auto; padding: 0; }
  .dokumen { max-width: none; }
  .code { background: #f4f4f0 !important; border-color: #ccc; }
  .code-body pre, .shiki span { color: #111 !important; }
}
/* ══════════════════════════════════════════════════════════
   Landing 2.0 — onyx engine room
   ══════════════════════════════════════════════════════════ */
#ramonyx-root:focus { outline: none; }
.topbar { view-transition-name: site-header; }
::view-transition-old(root) { animation: vt-old 0.22s var(--ease) both; }
::view-transition-new(root) { animation: vt-new 0.34s var(--ease) both; }
@keyframes vt-old { to { opacity: 0; transform: translateY(-7px); } }
@keyframes vt-new { from { opacity: 0; transform: translateY(9px); } }

.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
}

/* ── Hero ───────────────────────────────────────────────── */
.hero-stage {
  position: relative; isolation: isolate; overflow: clip;
  border-bottom: 1px solid var(--line);
  background: var(--paper);
}
.hero-stage::before {
  content: ""; position: absolute; inset: 0; z-index: 0; pointer-events: none;
  background-image: linear-gradient(90deg, var(--line) 1px, transparent 1px);
  background-size: 25% 100%; opacity: 0.22;
  mask-image: linear-gradient(180deg, #000 0%, transparent 92%);
}
.particle-field {
  position: absolute; inset: 0; z-index: 0; width: 100%; height: 100%;
  pointer-events: none;
  mask-image: linear-gradient(180deg, #000 0%, #000 60%, transparent 100%);
}
.cursor-glow {
  position: fixed; left: 0; top: 0; z-index: 0; width: 440px; height: 440px;
  border-radius: 50%; pointer-events: none; opacity: 0; transition: opacity 0.4s var(--ease);
  background: radial-gradient(circle, color-mix(in srgb, var(--accent) 14%, transparent), transparent 68%);
  filter: blur(10px); mix-blend-mode: multiply;
}
html[data-theme="dark"] .cursor-glow { mix-blend-mode: screen; }
@media (prefers-color-scheme: dark) {
  html:not([data-theme]) .cursor-glow { mix-blend-mode: screen; }
}
.cursor-glow.is-active { opacity: 0.55; }
@media (hover: none), (max-width: 700px) { .cursor-glow { display: none; } }
html[data-theme="dark"] .cursor-glow.is-active { opacity: 0.3; }
@media (prefers-color-scheme: dark) { html:not([data-theme]) .cursor-glow.is-active { opacity: 0.3; } }
.hero-inner { position: relative; z-index: 1; padding-top: 30px; }
.hero-meta {
  display: flex; align-items: center; justify-content: space-between; gap: 20px;
  padding-bottom: 16px; border-bottom: 1px solid var(--line);
}
.hero-meta .kicker { margin: 0; font-size: 11px; color: var(--muted); }
.hero-meta-note { font-family: var(--font-mono); font-size: 9.5px; color: var(--muted); }
.hero-wordmark {
  display: flex; align-items: flex-end; justify-content: space-between;
  width: 100vw; margin-left: calc(50% - 50vw);
  padding: clamp(20px, 3vw, 40px) clamp(16px, 2.6vw, 42px) 0;
  overflow: hidden;
  font-family: var(--font-display); font-weight: 400;
  font-size: clamp(60px, 21vw, 330px); line-height: 0.68; letter-spacing: -0.06em;
  color: var(--ink);
}
.hero-wordmark { animation: wordmark-wipe 0.9s var(--ease) both; }
.hero-wordmark span { display: inline-block; }
@keyframes wordmark-wipe { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
.hero-stage .hero-grid {
  display: grid; grid-template-columns: minmax(0, 1.04fr) minmax(0, 0.96fr);
  gap: clamp(30px, 4.5vw, 70px); align-items: center;
  padding: clamp(30px, 4.5vw, 58px) 0 clamp(64px, 7vw, 102px);
}
.hero-copy { max-width: 680px; }
.hero-copy .kicker { margin-bottom: 18px; }
.hero-title {
  font-size: clamp(42px, 5.6vw, 82px); line-height: 0.94;
  letter-spacing: -0.025em; margin: 0 0 24px;
}
.hero-title em { font-style: italic; color: var(--accent); }
.hero-copy .lede { font-size: clamp(16px, 1.4vw, 19px); max-width: 44ch; margin-bottom: 28px; }
.hero-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 18px; }


.hero-copy > :nth-child(3) { animation-delay: 0.24s; }
.hero-copy > :nth-child(4) { animation-delay: 0.3s; }
.hero-copy > :nth-child(5) { animation-delay: 0.36s; }
.hero-console { animation-delay: 0.28s; }

.hero-console {
  min-width: 0; background: var(--band); color: var(--band-fg);
  border: 1px solid var(--band-line); border-radius: 3px; overflow: hidden;
  box-shadow: 14px 14px 0 -1px var(--accent-soft), 0 30px 80px -52px rgba(0, 0, 0, 0.65);
}
.console-bar {
  display: flex; align-items: center; gap: 6px; padding: 11px 14px;
  border-bottom: 1px solid var(--band-line); background: var(--band-2);
  font-family: var(--font-mono); font-size: 10px; color: var(--band-muted);
}
.console-bar i { width: 7px; height: 7px; border-radius: 50%; background: var(--band-line); display: inline-block; }
.console-bar span { margin-left: 8px; }
.console-bar .console-live { margin-left: auto; color: var(--band-accent); text-transform: uppercase; letter-spacing: 0.12em; font-size: 8.5px; }
.hero-console pre {
  margin: 0; padding: 20px 18px 18px; overflow-x: auto;
  font-family: var(--font-mono); font-size: 12px; line-height: 1.9;
  color: var(--code-fg); tab-size: 2;
}
.console-dim { color: var(--code-muted); }
.console-ready { color: var(--band-accent); }
.console-foot {
  display: flex; flex-wrap: wrap; gap: 6px 16px; padding: 11px 15px;
  border-top: 1px solid var(--band-line);
  font-family: var(--font-mono); font-size: 9px; color: var(--band-muted);
}
.terminal-prompt { color: var(--band-accent); }
.terminal-cursor {
  display: inline-block; width: 6px; height: 12px; background: var(--band-accent);
  vertical-align: -2px; animation: blink 1.05s steps(1) infinite;
}
@keyframes blink { 50% { opacity: 0; } }
.hero-scroll {
  position: relative; z-index: 1; display: flex; align-items: center; justify-content: center;
  gap: 10px; padding: 0 0 16px; font-family: var(--font-mono); font-size: 9.5px; color: var(--muted);
}
.hero-scroll span { display: inline-block; width: 40px; height: 1px; background: var(--line-2); }
.hero-scroll kbd {
  border: 1px solid var(--line); border-radius: 2px; padding: 0 4px;
  background: var(--paper-2); color: var(--ink);
}

/* ── Stats ──────────────────────────────────────────────── */
.stats-band { background: var(--band); color: var(--band-fg); border-bottom: 1px solid var(--band-line); }
.stats-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); }
.stat { padding: 25px 20px; border-right: 1px solid var(--band-line); min-width: 0; }
.stat:last-child { border-right: 0; }
.stat-value {
  font-family: var(--font-display); font-size: clamp(26px, 2.7vw, 38px);
  line-height: 1; margin-bottom: 8px; white-space: nowrap;
}
.stat-label { font-family: var(--font-mono); font-size: 9.5px; color: var(--band-muted); }

/* ── Story shell + rail ─────────────────────────────────── */
.story-shell {
  display: grid; grid-template-columns: 190px minmax(0, 1fr);
  gap: clamp(30px, 5vw, 70px); padding-top: 12px; padding-bottom: 96px;
}
.chapter-rail {
  position: sticky; top: 86px; align-self: start; height: calc(100vh - 110px);
  display: flex; flex-direction: column; padding-top: 38px;
  font-family: var(--font-mono); min-width: 0;
}
.rail-hint { font-size: 9.5px; line-height: 1.8; color: var(--muted); margin-bottom: 26px; }
.rail-hint kbd { color: var(--ink); border: 1px solid var(--line); padding: 0 4px; border-radius: 2px; }
.rail-track { position: absolute; left: 0; top: 118px; bottom: 150px; width: 1px; background: var(--line); }
.rail-track span {
  display: block; width: 100%; height: 100%; background: var(--accent);
  transform-origin: top; transform: scaleY(0); transition: transform 0.15s linear;
}
.rail-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 5px; }
.rail-list a {
  display: flex; align-items: baseline; gap: 10px; padding: 6px 8px 6px 18px;
  color: var(--muted); text-decoration: none; font-size: 11px; line-height: 1.35;
  border-left: 1px solid transparent;
}
.rail-list a:hover { color: var(--ink); }
.rail-list a[aria-current="true"] { color: var(--ink); border-left-color: var(--accent); }
.rail-num { font-size: 9px; color: var(--muted); }
.rail-list a[aria-current="true"] .rail-num { color: var(--accent); }
.rail-shortcuts { margin-top: auto; display: grid; gap: 6px; font-size: 9.5px; }
.rail-shortcuts a { color: var(--muted); text-decoration: none; display: flex; gap: 8px; align-items: center; }
.rail-shortcuts a:hover { color: var(--ink); }
.rail-shortcuts kbd { color: var(--accent); font-size: 9px; }
.rail-help {
  display: none; margin-top: 12px; background: none; border: 0; padding: 0;
  color: var(--muted); font: inherit; font-size: 9.5px; cursor: pointer; text-align: left;
}
html.js .rail-help { display: inline-flex; gap: 8px; align-items: center; }
.rail-help kbd { color: var(--accent); }
.story-mobile { display: none; }

/* ── Chapter ────────────────────────────────────────────── */
.chapter {
  scroll-margin-top: 84px; padding: clamp(56px, 6.5vw, 96px) 0;
  border-top: 1px solid var(--line); min-width: 0;
  content-visibility: auto; contain-intrinsic-size: auto 800px;
}
.chapter:first-child { border-top: 0; padding-top: 52px; }
.chapter-head {
  display: grid; grid-template-columns: 64px minmax(0, 1fr);
  gap: clamp(16px, 2.5vw, 30px); margin-bottom: clamp(30px, 4vw, 48px);
}
.chapter-num { font-family: var(--font-mono); font-size: 11px; color: var(--accent); padding-top: 8px; }
.chapter-kicker { font-family: var(--font-mono); font-size: 10px; color: var(--muted); margin: 0 0 12px; }
.chapter-title {
  font-size: clamp(34px, 4.4vw, 62px); line-height: 1; letter-spacing: -0.02em;
  margin: 0 0 14px; max-width: 18ch;
}
.chapter-intro { font-size: 16px; color: var(--muted); max-width: 58ch; margin: 0; }
.chapter-stage {
  display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  gap: clamp(26px, 4vw, 54px); align-items: start; min-width: 0;
}
.chapter-stage-reverse .chapter-copy { order: 2; }
.chapter-copy { min-width: 0; padding-top: 10px; }
.chapter-copy h3 { font-size: 23px; margin-bottom: 12px; }
.chapter-copy p { color: var(--muted); font-size: 14.5px; }
.chapter-points { list-style: none; margin: 0 0 24px; padding: 0; display: grid; gap: 10px; }
.chapter-points li {
  position: relative; padding-left: 22px; font-size: 14px; line-height: 1.55; color: var(--ink-2);
}
.chapter-points li::before {
  content: ""; position: absolute; left: 0; top: 0.52em; width: 7px; height: 7px;
  border: 1px solid var(--accent); transform: rotate(45deg);
}
.link-arrow {
  display: inline-flex; align-items: center; gap: 8px; text-decoration: none;
  font-size: 13.5px; font-weight: 500; border-bottom: 1px solid var(--line-2);
  padding-bottom: 3px; transition: border-color 0.18s var(--ease);
}
.link-arrow span { transition: transform 0.2s var(--ease); }
.link-arrow:hover span { transform: translateX(4px); }
.chapter-dark {
  background: var(--band); color: var(--band-fg);
  border: 1px solid var(--band-line); padding: clamp(26px, 3.6vw, 48px);
}
.chapter-dark .chapter-title, .chapter-dark h2, .chapter-dark h3 { color: var(--band-fg); }
.chapter-dark .chapter-head { background: var(--band); }
.chapter-dark .chapter-intro, .chapter-dark .chapter-copy p { color: var(--band-muted); }
.chapter-dark .chapter-num { color: var(--band-accent); }
.chapter-dark .chapter-kicker { color: var(--band-accent); }
.chapter-dark .chapter-points li { color: var(--band-fg); }
.chapter-dark .chapter-points li::before { border-color: var(--band-accent); }
.chapter-dark .link-arrow { color: var(--band-accent); border-color: var(--band-line); }
.experimental {
  display: inline-flex; align-items: center; gap: 7px; margin-top: 6px;
  font-family: var(--font-mono); font-size: 9px; color: var(--band-accent);
  border: 1px solid var(--band-line); padding: 4px 8px; text-transform: uppercase;
  letter-spacing: 0.1em;
}
.experimental::before { content: ""; width: 5px; height: 5px; background: var(--band-accent); transform: rotate(45deg); }

/* ── Shared visual panels ───────────────────────────────── */
.visual-code, .route-code, .runtime-panel {
  background: var(--code-bg); border: 1px solid #2a2e22; overflow: hidden; min-width: 0;
}
.visual-code-head, .route-code-head {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 8px 12px; background: var(--code-head); border-bottom: 1px solid #262a1e;
  font-family: var(--font-mono); font-size: 9.5px; color: var(--code-muted);
}
.visual-code-head span:first-child, .route-code-head span:first-child { color: var(--code-fg); }
.visual-code pre, .route-code pre, .runtime-panel pre {
  margin: 0; padding: 16px; overflow-x: auto; font-size: 11.5px; line-height: 1.75;
  color: var(--code-fg); tab-size: 2;
}
.visual-code pre:focus-visible, .route-code pre:focus-visible, .runtime-panel pre:focus-visible {
  outline-color: var(--band-accent); outline-offset: -2px;
}

/* ── Routing demo ───────────────────────────────────────── */
.route-demo { display: grid; gap: 14px; min-width: 0; }
.route-tree { background: var(--paper-2); border: 1px solid var(--line); }
.route-tree-head {
  display: flex; justify-content: space-between; gap: 12px; padding: 9px 12px;
  border-bottom: 1px solid var(--line); font-family: var(--font-mono); font-size: 9px;
  color: var(--muted);
}
.route-tree button {
  display: flex; justify-content: space-between; align-items: baseline; gap: 12px;
  width: 100%; border: 0; border-top: 1px solid var(--line); padding: 8px 12px;
  background: transparent; color: var(--ink); font-family: var(--font-mono);
  font-size: 10px; text-align: left; cursor: pointer;
}
.route-tree button:first-of-type { border-top: 0; }
.route-tree button:hover { background: var(--paper); }
.route-tree button.is-active { background: var(--ink); color: var(--paper); }
.route-pattern { color: var(--muted); white-space: nowrap; }
.route-tree button.is-active .route-pattern { color: var(--paper-2); }
.route-request {
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px;
  padding: 9px 12px; border: 1px solid var(--line); background: var(--paper-2);
  font-family: var(--font-mono); font-size: 10px; color: var(--muted);
}
.route-method { color: var(--accent); }
.route-request code { color: var(--ink); font-size: 10.5px; }
.route-status { color: var(--accent); }
.route-match { margin-left: auto; font-size: 9px; }
.route-flow { display: flex; flex-wrap: wrap; gap: 6px 16px; padding-top: 4px; font-family: var(--font-mono); font-size: 9px; color: var(--muted); }
.route-flow span { display: inline-flex; align-items: center; gap: 6px; }
.route-flow i { width: 5px; height: 5px; border: 1px solid currentColor; transform: rotate(45deg); }
.route-flow span.is-on { color: var(--accent); }

/* ── Streaming demo ─────────────────────────────────────── */
.stream-demo { border: 1px solid var(--line); background: var(--paper-2); padding: 13px; min-width: 0; }
.stream-toolbar {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding-bottom: 10px; border-bottom: 1px solid var(--line);
  font-family: var(--font-mono); font-size: 9px; color: var(--muted);
}
.stream-live { display: inline-flex; align-items: center; gap: 7px; color: var(--ink); }
.stream-live i { width: 5px; height: 5px; border-radius: 50%; background: var(--accent); }
.stream-toolbar button {
  background: none; border: 1px solid var(--line-2); color: var(--ink);
  border-radius: 2px; padding: 3px 8px; font: inherit; font-size: 9px; cursor: pointer;
}
.stream-toolbar button:hover { border-color: var(--accent); color: var(--accent); }
.stream-steps { list-style: none; margin: 0; padding: 10px 0 6px; display: grid; }
.stream-steps li {
  display: grid; grid-template-columns: 28px 92px minmax(0, 1fr); gap: 8px;
  padding: 7px 0; border-bottom: 1px solid var(--line); font-family: var(--font-mono);
  font-size: 9.5px; color: var(--muted); transition: color 0.25s var(--ease);
}
.stream-steps li:last-child { border-bottom: 0; }
.stream-steps li.is-on { color: var(--ink); }
.stream-steps li.is-on .stream-index { color: var(--accent); }
.stream-index { color: var(--muted); }
.stream-detail { color: var(--muted); text-align: right; }
.stream-chunks { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 5px; margin: 10px 0 12px; }
.stream-chunks span {
  border: 1px solid var(--line); padding: 7px 6px; text-align: center;
  font-family: var(--font-mono); font-size: 8px; color: var(--muted);
  transition: background 0.25s var(--ease), color 0.25s var(--ease);
}
.stream-chunks span.is-on { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }

/* ── Limits ─────────────────────────────────────────────── */
.limits-demo { border: 1px solid var(--line); background: var(--paper-2); padding: 18px; min-width: 0; }
.limits-head {
  display: flex; justify-content: space-between; gap: 12px; padding-bottom: 14px;
  border-bottom: 1px solid var(--line); font-family: var(--font-mono); font-size: 9px; color: var(--muted);
}
.limits-head span:first-child { display: inline-flex; align-items: center; gap: 7px; color: var(--ink); }
.limits-head i { width: 5px; height: 5px; border-radius: 50%; background: var(--accent); }
.limits-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; padding: 18px 0; }
.limit { min-width: 0; }
.limit-value { font-family: var(--font-display); font-size: clamp(32px, 3.4vw, 48px); line-height: 0.9; font-variant-numeric: tabular-nums; }
.limit-value small { font-family: var(--font-mono); font-size: 10px; color: var(--muted); margin-left: 3px; }
.limit-bar { height: 3px; background: var(--line); margin: 12px 0 9px; overflow: hidden; }
.limit-bar i { display: block; height: 100%; background: var(--accent); transform-origin: left; }
.limit-label { font-size: 11px; color: var(--ink); }
.limit-note { font-family: var(--font-mono); font-size: 8.5px; color: var(--muted); margin-top: 4px; }
.limits-tags { display: flex; flex-wrap: wrap; gap: 6px; padding-top: 13px; border-top: 1px solid var(--line); }
.limits-tags span {
  font-family: var(--font-mono); font-size: 8.5px; color: var(--muted);
  border: 1px solid var(--line); padding: 3px 7px;
}

/* ── Contract ───────────────────────────────────────────── */
.contract-demo { border: 1px solid var(--line); background: var(--paper-2); padding: 18px; min-width: 0; }
.contract-core {
  display: grid; gap: 2px; padding: 16px; border: 1px solid var(--line); background: var(--paper);
  text-align: center; margin-bottom: 14px;
}
.contract-core-label { font-family: var(--font-mono); font-size: 9px; color: var(--muted); }
.contract-core strong { font-family: var(--font-display); font-size: 27px; font-weight: 400; }
.contract-core span:last-child { font-family: var(--font-mono); font-size: 9px; color: var(--accent); }
.contract-targets { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; margin-bottom: 14px; }
.contract-targets button {
  display: grid; gap: 3px; text-align: left; padding: 10px;
  border: 1px solid var(--line); background: transparent; color: var(--muted);
  font: inherit; font-size: 12px; cursor: pointer;
}
.contract-targets button small { font-family: var(--font-mono); font-size: 8px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.contract-targets button:hover { border-color: var(--line-2); color: var(--ink); }
.contract-targets button.is-active { background: var(--ink); color: var(--paper); border-color: var(--ink); }
.contract-targets button.is-active small { color: var(--paper-2); }
.contract-panel { min-width: 0; }

/* ── Waitlist ───────────────────────────────────────────── */
.waitlist-panel { background: var(--paper-2); border: 1px solid var(--line); min-width: 0; }
.waitlist-panel .visual-code-head { background: var(--band-2); border-color: var(--band-line); color: var(--band-muted); }
.waitlist-panel .visual-code-head span:first-child { color: var(--band-fg); }
.waitlist-form { padding: 18px; display: grid; gap: 10px; }
.waitlist-form > label, .waitlist-form label:not(.hp) { font-family: var(--font-mono); font-size: 9.5px; color: var(--muted); }
.waitlist-row { display: flex; gap: 8px; }
.waitlist-row input {
  flex: 1; min-width: 0; border: 1px solid var(--line-2); background: var(--paper);
  color: var(--ink); padding: 10px 12px; font: inherit; font-size: 14px;
  border-radius: 2px; outline: none;
}
.waitlist-row input:focus { border-color: var(--accent); }
.waitlist-row .tombol { height: auto; min-height: 40px; white-space: nowrap; }
.hp { position: absolute; left: -9999px; width: 1px; height: 1px; overflow: hidden; }
.form-note { font-size: 10.5px; color: var(--muted); margin: 2px 0 0; }
.form-error { color: var(--merah); font-size: 12px; margin: 0; }
.form-success { color: var(--accent); font-size: 12px; margin: 0; }
.waitlist-static { padding: 20px; display: grid; gap: 14px; justify-items: start; }
.waitlist-static p { color: var(--muted); font-size: 13px; margin: 0; max-width: 42ch; }
.action-flow { display: flex; flex-wrap: wrap; gap: 6px 14px; margin-top: 24px; font-family: var(--font-mono); font-size: 9px; color: var(--muted); }
.action-flow span { display: inline-flex; align-items: center; gap: 6px; }
.action-flow i { width: 5px; height: 5px; border: 1px solid currentColor; transform: rotate(45deg); }
.action-flow span.is-on { color: var(--accent); }

/* ── Runtime ────────────────────────────────────────────── */
.runtime-panel { border-color: var(--band-line); }
.runtime-panel .visual-code-head { border-color: var(--band-line); background: var(--band-2); color: var(--band-muted); }
.runtime-panel .visual-code-head span:first-child { color: var(--band-fg); }

/* ── Terminal (live) ────────────────────────────────────── */
.agent-stack { display: grid; gap: 14px; min-width: 0; }
.terminal-live { border: 1px solid var(--line-2); background: var(--code-bg); overflow: hidden; min-width: 0; }
.terminal-live-bar { display: flex; align-items: center; gap: 8px; background: var(--code-head); border-bottom: 1px solid #262a1e; }
.terminal-live-tabs { display: flex; gap: 0; overflow-x: auto; }
.terminal-live-tabs button {
  background: none; border: 0; border-bottom: 1px solid transparent;
  padding: 8px 10px; color: var(--code-muted); font-family: var(--font-mono);
  font-size: 9.5px; cursor: pointer;
}
.terminal-live-tabs button.is-active { color: var(--code-fg); border-bottom-color: var(--band-accent); }
.terminal-live-actions { margin-left: auto; display: flex; gap: 4px; padding-right: 8px; }
.terminal-live-actions button {
  background: transparent; border: 1px solid #363c2c; color: var(--code-muted);
  border-radius: 2px; padding: 2px 7px; font-family: var(--font-mono); font-size: 8.5px; cursor: pointer;
}
.terminal-live-actions button:hover { color: var(--code-fg); border-color: var(--band-accent); }
.terminal-live-body { padding: 14px 16px 16px; }
.terminal-live-file { font-family: var(--font-mono); font-size: 9px; color: var(--code-muted); margin-bottom: 10px; }
.terminal-live-output { font-family: var(--font-mono); font-size: 11.5px; line-height: 1.8; min-height: 205px; color: var(--code-fg); }
.terminal-line { white-space: pre-wrap; overflow-wrap: anywhere; }
.terminal-output { color: var(--code-fg); }
.terminal-muted { color: var(--code-muted); }
.terminal-ready { color: var(--band-accent); }
.terminal-compact .terminal-live-output { min-height: 190px; }

/* ── Closing ────────────────────────────────────────────── */
.closing {
  position: relative; overflow: clip; background: var(--accent); color: var(--accent-ink);
  border-top: 1px solid var(--line);
}
.closing-mark {
  position: absolute; right: -0.08em; bottom: -0.24em; font-family: var(--font-display);
  font-size: clamp(140px, 28vw, 460px); line-height: 0.7; letter-spacing: -0.06em;
  color: var(--accent-ink); opacity: 0.07; pointer-events: none; white-space: nowrap;
}
.closing-inner { position: relative; z-index: 1; padding: clamp(64px, 9vw, 120px) 0; }
.closing-kicker { display: flex; align-items: center; gap: 9px; font-family: var(--font-mono); font-size: 10px; margin: 0 0 18px; }
.closing-kicker .kicker-tanda { background: var(--accent-ink); }
.closing h2 {
  font-size: clamp(54px, 9vw, 132px); line-height: 0.88; letter-spacing: -0.03em;
  margin: 0 0 22px; max-width: 12ch; color: var(--accent-ink);
}
.closing h2 em { font-style: italic; }
.closing-lede { max-width: 38ch; font-size: 16px; opacity: 0.78; margin: 0 0 30px; }
.closing-actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.closing .tombol { border-color: var(--accent-ink); color: var(--accent-ink); }
.closing .tombol:hover { background: var(--accent-ink); color: var(--accent); }
.closing .tombol.utama { background: var(--accent-ink); color: var(--accent); border-color: var(--accent-ink); }
.closing .tombol.utama:hover { filter: brightness(0.92); }
.closing-install { margin-top: 22px; background: color-mix(in srgb, var(--accent-ink) 10%, transparent); border-color: color-mix(in srgb, var(--accent-ink) 24%, transparent); }
.closing-install code { color: var(--accent-ink); }
.closing-install .copy { color: var(--accent-ink); border-color: color-mix(in srgb, var(--accent-ink) 30%, transparent); }
.closing-install .copy:hover { color: var(--accent-ink); border-color: var(--accent-ink); }

/* ── Micro ──────────────────────────────────────────────── */
.magnetic { display: inline-block; will-change: transform; }
.tilt { transform-style: preserve-3d; transition: transform 0.2s var(--ease); }

/* ── Scroll-driven reveal (native) ──────────────────────── */
html.js [data-reveal] { transform: translateY(12px); transition: transform 0.55s var(--ease); }
html.js [data-reveal].is-in { transform: none; }
@media (prefers-reduced-motion: reduce) {
  html.js [data-reveal] { transform: none; transition: none; }
}

/* ── Shortcut dialog ────────────────────────────────────── */
.shortcut-dialog {
  border: 1px solid var(--line-2); background: var(--paper); color: var(--ink);
  padding: 0; width: min(440px, calc(100vw - 32px)); box-shadow: 0 30px 100px -40px rgba(0,0,0,.6);
}
.shortcut-dialog::backdrop { background: color-mix(in srgb, var(--band) 55%, transparent); backdrop-filter: blur(6px); }
.shortcut-dialog-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; border-bottom: 1px solid var(--line);
  font-family: var(--font-mono); font-size: 10px; color: var(--muted);
}
.shortcut-dialog-head button {
  background: none; border: 1px solid var(--line); border-radius: 2px; padding: 2px 6px;
  color: var(--muted); font: inherit; font-size: 9px; cursor: pointer;
}
.shortcut-dialog dl { margin: 0; padding: 10px 16px 16px; display: grid; gap: 1px; }
.shortcut-dialog dl > div { display: flex; justify-content: space-between; gap: 20px; padding: 9px 0; border-bottom: 1px solid var(--line); }
.shortcut-dialog dl > div:last-child { border-bottom: 0; }
.shortcut-dialog dt { font-family: var(--font-mono); font-size: 11px; color: var(--accent); }
.shortcut-dialog dd { margin: 0; font-size: 12px; color: var(--muted); }
.shortcut-dialog kbd { border: 1px solid var(--line); padding: 1px 5px; border-radius: 2px; font-size: 9px; }

/* ── Responsive ─────────────────────────────────────────── */
@media (max-width: 1120px) {
  .story-shell { grid-template-columns: minmax(0, 1fr); gap: 0; }
  .story { min-width: 0; }
  .chapter-rail { display: none; }
  .story-mobile {
    display: block; position: sticky; top: 66px; z-index: 30;
    background: color-mix(in srgb, var(--paper) 92%, transparent);
    backdrop-filter: blur(12px); border-bottom: 1px solid var(--line); margin: 0 0 10px;
  }
  .story-mobile summary {
    display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 12px;
    padding: 11px 0; cursor: pointer; list-style: none;
    font-family: var(--font-mono); font-size: 10.5px; color: var(--ink);
  }
  .story-mobile summary::-webkit-details-marker { display: none; }
  .mobile-count { color: var(--accent); font-size: 9px; }
  .mobile-plus { color: var(--accent); font-size: 15px; }
  .story-mobile nav { display: grid; gap: 1px; padding: 4px 0 12px; }
  .story-mobile nav a {
    display: flex; gap: 10px; padding: 6px 0; text-decoration: none;
    color: var(--muted); font-family: var(--font-mono); font-size: 10.5px;
  }
  .story-mobile nav a span { color: var(--line-2); }
  .story-mobile nav a[aria-current="true"] { color: var(--ink); }
  .story-mobile nav a[aria-current="true"] span { color: var(--accent); }
  .story-shell { padding-top: 0; }
  .chapter:first-child { padding-top: 34px; }
}
@media (max-width: 980px) {
  .hero-stage .hero-grid { grid-template-columns: 1fr; gap: 34px; padding-bottom: 54px; }
  .hero-copy { max-width: 640px; }
  .hero-console { max-width: 620px; }
  .hero-meta-note { display: none; }
  .stats-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .stat:nth-child(3) { border-right: 0; }
  .stat:nth-child(-n+3) { border-bottom: 1px solid var(--band-line); }
  .chapter-stage { grid-template-columns: 1fr; gap: 28px; }
  .chapter-stage-reverse .chapter-copy { order: 0; }
  .chapter-title { max-width: 20ch; }
  .limits-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .kaki-utama { grid-template-columns: 1fr 1fr; gap: 32px; }
}
@media (max-width: 700px) {
  .hero-inner { padding-top: 22px; }
  .hero-meta { padding-bottom: 12px; }
  .hero-wordmark { font-size: clamp(58px, 21vw, 120px); padding-top: 20px; }
  .hero-title { font-size: clamp(40px, 11vw, 58px); }
  .hero-copy .lede { font-size: 15.5px; }
  .hero-console pre { font-size: 10.5px; padding: 16px 13px; }
  .console-foot { font-size: 8px; }
  .stats-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .stat { padding: 18px 15px; }
  .stat:nth-child(3) { border-right: 1px solid var(--band-line); }
  .stat:nth-child(2n) { border-right: 0; }
  .stat:nth-child(-n+4) { border-bottom: 1px solid var(--band-line); }
  .stat:last-child { border-bottom: 0; }
  .stat-value { font-size: 25px; }
  .chapter { padding: 46px 0; }
  .chapter-head { grid-template-columns: 1fr; gap: 6px; margin-bottom: 26px; }
  .chapter-num { padding-top: 0; }
  .chapter-title { font-size: clamp(32px, 9vw, 46px); }
  .chapter-intro { font-size: 14.5px; }
  .chapter-dark { padding: 24px 16px; }
  .waitlist-row { flex-direction: column; }
  .waitlist-row .tombol { width: 100%; }
  .limits-grid { grid-template-columns: 1fr; gap: 14px; }
  .limits-head { font-size: 8.5px; }
  .contract-targets { grid-template-columns: 1fr; }
  .closing h2 { font-size: clamp(48px, 15vw, 76px); }
  .closing-mark { font-size: 42vw; }
  .story-mobile { top: 66px; }
  .hero-scroll { font-size: 8.5px; }
  .kaki-utama { grid-template-columns: 1fr; padding: 48px 0 36px; }
  .kaki-bawah { flex-direction: column; gap: 6px; }
}
@media (max-width: 480px) {
  .hero-wordmark { font-size: 20.5vw; }
  .stats-grid { grid-template-columns: 1fr; }
  .stat { border-right: 0 !important; border-bottom: 1px solid var(--band-line); }
  .stat:last-child { border-bottom: 0; }
  .closing-actions { flex-direction: column; align-items: stretch; }
  .closing-actions .magnetic, .closing-actions .tombol { width: 100%; }
  .closing-actions .tombol { justify-content: center; }
}

@media (prefers-reduced-motion: reduce) {
  .hero-wordmark, .hero-wordmark span, .hero-copy > *, .hero-console, .hero-scroll,
  .chapter-head, .chapter-stage { animation: none !important; transform: none !important; opacity: 1 !important; clip-path: none !important; }
  .terminal-cursor { animation: none; }
  .cursor-glow { display: none; }
  .particle-field { opacity: 0.35; }
  ::view-transition-old(root), ::view-transition-new(root), ::view-transition-group(*) { animation: none !important; }
}

@media print {
  .particle-field, .cursor-glow, .chapter-rail, .story-mobile, .chapter-rail,
  .hero-console, .closing-mark { display: none !important; }
  .hero-stage, .stats-band, .chapter-dark, .closing { background: #fff !important; color: #000 !important; }
  .hero-wordmark, .hero-title, .closing h2 { color: #000 !important; }
  .chapter { break-inside: avoid; }
}
`;

/** Varian CSS landing: buang aturan docs, pertahankan topbar/footer/search/copy. */
function GAYA_LANDING(fonts: DocumentFonts): string {
  const full = GAYA(fonts);
  const docs = full.indexOf("/* ── Docs");
  const landing = full.indexOf("/* ══════════════════════════════════════════════════════════");
  const code = full.indexOf("/* Blok kode markdown");
  const codeEnd = full.indexOf("/* ToC */");
  const search = full.indexOf("/* ── Pencarian");
  const searchEnd = full.indexOf("/* ── Halaman error");
  if (docs < 0 || landing < 0 || code < 0 || codeEnd < 0 || search < 0 || searchEnd < 0) {
    return full;
  }
  const mobile = `@media (max-width: 700px) {
    .topbar-dalam { gap: 12px; }
    .topnav { display: none; }
    .merek-tag { display: none; }
    .cari-pemicu kbd { display: none; }
  }
  @media (max-width: 480px) {
    .topbar-aksi .tombol.utama { display: none; }
  }
`;
  return `${full.slice(0, docs)}${full.slice(code, codeEnd)}${full.slice(search, searchEnd)}${mobile}${full.slice(landing)}`;
}

/**
 * Dokumen HTML kustom (judul + gaya + script hydration). `basePath` (mis. `/ramonyx` di
 * GitHub Pages) di-emit sebagai `<base href>` → semua URL relatif tetap benar di subpath.
 * `fonts` diisi URL aset ber-hash dari resolver (`createAssetResolver`).
 */
export function createDocument(
  basePath = "",
  fonts: Partial<DocumentFonts> = {},
): DocumentRenderer {
  const base = basePath === "" || basePath === "/" ? "/" : `${basePath.replace(/\/$/, "")}/`;
  const f: DocumentFonts = { ...FONT_BAWAAN, ...fonts };
  const preload = [f.serif, f.serifItalic, f.sans400]
    .map((href) => `<link rel="preload" as="font" type="font/woff2" href="${href}" crossorigin />`)
    .join("\n");
  const favicon =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%2311130d'/%3E%3Cpath d='M16 5l11 11-11 11L5 16z' fill='%23a9b9ff'/%3E%3C/svg%3E";

  return ({ title, body, head = "", scripts = "", lang = "en", dir, path }) => `<!doctype html>
<html lang="${lang}"${dir === undefined ? "" : ` dir="${dir}"`}>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<base href="${base}" />
<meta name="description" content="Ramonyx — full-stack TypeScript framework with file routing, streaming SSR, server actions, secure defaults, and an experimental Rust/V8 runtime." />
<meta name="color-scheme" content="light dark" />
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#f3f1e9" />
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0c0e09" />
<meta property="og:site_name" content="Ramonyx" />
<link rel="icon" href="${favicon}" />
${preload}
<title>${title.length > 0 ? `${title} · Ramonyx` : "Ramonyx — full-stack TypeScript, secure by default"}</title>
<style>${path === "/" ? GAYA_LANDING(f) : GAYA(f)}</style>${head.length > 0 ? `\n${head}` : ""}
</head>
<body>
<div id="ramonyx-root">${body}</div>${scripts.length > 0 ? `\n${scripts}` : ""}
</body>
</html>
`;
}
