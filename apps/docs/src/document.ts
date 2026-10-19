// Dokumen HTML + design system situs publik (dogfood: Ramonyx SSR).
// Tema: gelap default, terang via `data-theme="light"` (dipilih klien; default mengikuti sistem).

import type { DocumentRenderer } from "@ramonyx/ssr";

const GAYA = `
:root {
  --bg: #0a0c08;
  --surface: #10140d;
  --surface-2: #151b11;
  --fg: #eef1e8;
  --muted: #a2ad9c;
  --accent: #c9f45a;
  --accent-ink: #0d1206;
  --line: #242c1e;
  --line-kuat: #38452f;
  --kode-bg: #0c100a;
  --merah: #ff8f7a;
  --radius: 10px;
  --max: 1160px;
  --font-display: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, ui-serif, serif;
  --font-sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, "Cascadia Mono", Menlo, Consolas, monospace;
}
html[data-theme="light"] {
  --bg: #f6f7f2; --surface: #ffffff; --surface-2: #eef1e7; --fg: #12150f; --muted: #5a6554;
  --accent: #3d6b00; --accent-ink: #f7fbe9; --line: #d9dfd0; --line-kuat: #b9c4ac;
  --kode-bg: #ffffff; --merah: #b42318;
}
@media (prefers-color-scheme: light) {
  html:not([data-theme]) {
    --bg: #f6f7f2; --surface: #ffffff; --surface-2: #eef1e7; --fg: #12150f; --muted: #5a6554;
    --accent: #3d6b00; --accent-ink: #f7fbe9; --line: #d9dfd0; --line-kuat: #b9c4ac;
    --kode-bg: #ffffff; --merah: #b42318;
  }
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
body {
  margin: 0; background: var(--bg); color: var(--fg);
  font: 16px/1.65 var(--font-sans);
  -webkit-font-smoothing: antialiased;
  background-image: radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--line) 60%, transparent) 1px, transparent 0);
  background-size: 28px 28px;
}
a { color: inherit; text-decoration-color: color-mix(in srgb, var(--accent) 70%, transparent); text-underline-offset: 3px; }
a:hover { text-decoration-color: var(--accent); }
code, pre, kbd { font-family: var(--font-mono); }
h1, h2, h3, h4 { font-family: var(--font-display); font-weight: 600; line-height: 1.12; letter-spacing: -0.015em; margin: 0 0 0.5em; }
p { margin: 0 0 1em; }
.dim { color: var(--muted); }
.mono { font-family: var(--font-mono); }
.shell { min-height: 100vh; display: flex; flex-direction: column; }
.wrap { width: min(100% - 40px, var(--max)); margin-inline: auto; }

/* ── Topbar ─────────────────────────────────────────────── */
.topbar { position: sticky; top: 0; z-index: 40; backdrop-filter: blur(12px);
  background: color-mix(in srgb, var(--bg) 82%, transparent); border-bottom: 1px solid var(--line); }
.topbar-dalam { display: flex; align-items: center; gap: 22px; height: 62px; }
.merek { display: inline-flex; align-items: baseline; gap: 8px; text-decoration: none; font-weight: 700; letter-spacing: -0.01em; }
.merek .tag { font-family: var(--font-mono); font-size: 11px; text-transform: uppercase; letter-spacing: 0.14em;
  color: var(--accent); border: 1px solid var(--line-kuat); border-radius: 999px; padding: 2px 8px; }
.topnav { display: flex; gap: 18px; margin-left: 8px; font-size: 14px; }
.topnav a { text-decoration: none; color: var(--muted); }
.topnav a:hover, .topnav a[aria-current="page"] { color: var(--fg); }
.topbar-aksi { margin-left: auto; display: flex; align-items: center; gap: 10px; }
.tombol { display: inline-flex; align-items: center; gap: 8px; border-radius: 8px; padding: 8px 14px;
  font-size: 14px; font-weight: 600; text-decoration: none; border: 1px solid var(--line-kuat); color: var(--fg); }
.tombol:hover { border-color: var(--accent); }
.tombol.utama { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
.tombol.utama:hover { filter: brightness(1.06); }
.tombol-ikon { background: none; border: 1px solid var(--line-kuat); color: var(--fg); border-radius: 8px;
  width: 34px; height: 34px; cursor: pointer; font-size: 15px; }
.tombol-ikon:hover { border-color: var(--accent); }
.cari-pemicu { display: inline-flex; align-items: center; gap: 10px; background: var(--surface);
  border: 1px solid var(--line); color: var(--muted); border-radius: 8px; padding: 7px 10px; cursor: pointer;
  font: inherit; font-size: 13px; }
.cari-pemicu:hover { border-color: var(--line-kuat); color: var(--fg); }
.cari-pemicu kbd { font-size: 11px; border: 1px solid var(--line-kuat); border-radius: 5px; padding: 1px 5px; }

/* ── Landing ───────────────────────────────────────────── */
.landing { flex: 1; }
.hero { padding: 84px 0 40px; border-bottom: 1px solid var(--line); }
.hero-grid { display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 56px; align-items: center; }
.eyebrow { font-family: var(--font-mono); font-size: 12px; text-transform: uppercase; letter-spacing: 0.18em;
  color: var(--accent); margin-bottom: 22px; display: flex; align-items: center; gap: 10px; }
.eyebrow::before { content: ""; width: 26px; height: 1px; background: var(--accent); }
.hero h1 { font-size: clamp(42px, 6.4vw, 76px); margin-bottom: 22px; }
.hero h1 em { font-style: normal; color: var(--accent); }
.hero .sub { font-size: clamp(17px, 1.6vw, 20px); color: var(--muted); max-width: 34ch; margin-bottom: 30px; }
.hero-aksi { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
.hero-catatan { font-family: var(--font-mono); font-size: 12px; color: var(--muted); margin-top: 16px; }
.terminal { background: var(--surface); border: 1px solid var(--line-kuat); border-radius: 12px;
  box-shadow: 0 30px 80px -40px rgba(0, 0, 0, 0.7); overflow: hidden; }
.terminal-bar { display: flex; align-items: center; gap: 6px; padding: 10px 14px; border-bottom: 1px solid var(--line);
  background: var(--surface-2); font-family: var(--font-mono); font-size: 11px; color: var(--muted); }
.terminal-bar i { width: 9px; height: 9px; border-radius: 50%; background: var(--line-kuat); display: inline-block; }
.terminal-bar span { margin-left: 8px; }
.terminal-isi { padding: 18px 18px 22px; font-family: var(--font-mono); font-size: 13.5px; line-height: 1.75; }
.terminal-isi .prompt { color: var(--accent); }
.terminal-isi .komentar { color: var(--muted); }
.terminal-isi .cursor { display: inline-block; width: 8px; height: 15px; background: var(--accent);
  vertical-align: -2px; animation: blink 1.1s steps(1) infinite; }
@keyframes blink { 50% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .terminal-isi .cursor { animation: none; } }

.bukti { border-bottom: 1px solid var(--line); }
.bukti-grid { display: grid; grid-template-columns: repeat(4, 1fr); }
.bukti-sel { padding: 26px 22px; border-right: 1px solid var(--line); }
.bukti-sel:last-child { border-right: 0; }
.bukti-angka { font-family: var(--font-display); font-size: 34px; line-height: 1; margin-bottom: 8px; }
.bukti-label { font-family: var(--font-mono); font-size: 11px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--muted); }

.bagian { padding: 84px 0; border-bottom: 1px solid var(--line); }
.bagian-kepala { display: grid; grid-template-columns: 220px 1fr; gap: 40px; margin-bottom: 44px; }
.bagian-nomor { font-family: var(--font-mono); font-size: 12px; color: var(--accent); letter-spacing: 0.16em; text-transform: uppercase; }
.bagian h2 { font-size: clamp(30px, 3.6vw, 46px); margin: 0 0 10px; }
.bagian-intro { color: var(--muted); max-width: 62ch; }
.narasi { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; align-items: center; }
.narasi + .narasi { margin-top: 64px; }
.narasi.terbalik .narasi-teks { order: 2; }
.narasi h3 { font-size: 26px; margin-bottom: 10px; }
.narasi p { color: var(--muted); }
.daftar-poin { list-style: none; margin: 18px 0 0; padding: 0; display: grid; gap: 10px; }
.daftar-poin li { display: grid; grid-template-columns: 18px 1fr; gap: 10px; font-size: 14.5px; color: var(--muted); }
.daftar-poin li::before { content: "→"; color: var(--accent); font-family: var(--font-mono); }
.kode-panel { background: var(--surface); border: 1px solid var(--line-kuat); border-radius: 12px; overflow: hidden; }
.kode-panel .code { margin: 0; border: 0; border-radius: 0; }
.kode-panel .code-head { background: var(--surface-2); }
.kode-panel pre { margin: 0; padding: 16px 18px; overflow-x: auto; font-size: 13px; line-height: 1.7; }

.reveal { opacity: 0; transform: translateY(14px); transition: opacity 0.6s ease, transform 0.6s ease; }
html.js .reveal.in, .reveal.in { opacity: 1; transform: none; }
@media (prefers-reduced-motion: reduce) { .reveal { opacity: 1; transform: none; transition: none; } }

.demo-tab { display: inline-flex; border: 1px solid var(--line-kuat); border-radius: 8px; overflow: hidden; margin-bottom: 18px; }
.demo-tab button { background: none; border: 0; color: var(--muted); font: inherit; font-size: 13px; padding: 8px 16px; cursor: pointer; }
.demo-tab button[aria-selected="true"] { background: var(--accent); color: var(--accent-ink); font-weight: 600; }
.ekosistem { display: flex; flex-wrap: wrap; gap: 10px; }
.chip { font-family: var(--font-mono); font-size: 12px; border: 1px solid var(--line-kuat); border-radius: 999px; padding: 6px 12px; color: var(--muted); }

/* ── Docs ──────────────────────────────────────────────── */
.docs { flex: 1; display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: 48px;
  width: min(100% - 40px, var(--max)); margin-inline: auto; padding: 40px 0 80px; }
.sidebar { position: sticky; top: 82px; align-self: start; max-height: calc(100vh - 100px); overflow-y: auto;
  border-right: 1px solid var(--line); padding-right: 20px; }
.sidebar-seksi { margin-bottom: 26px; }
.sidebar-judul { font-family: var(--font-mono); font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.16em;
  color: var(--muted); margin-bottom: 8px; }
.sidebar ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
.sidebar a { display: block; padding: 5px 8px; border-radius: 6px; font-size: 14px; text-decoration: none; color: var(--muted); }
.sidebar a:hover { background: var(--surface); color: var(--fg); }
.sidebar a[aria-current="page"] { background: var(--surface); color: var(--fg); border-left: 2px solid var(--accent); }
.docs-utama { min-width: 0; }
.remah { font-family: var(--font-mono); font-size: 11.5px; color: var(--muted); margin-bottom: 18px; }
.remah a { text-decoration: none; }
.remah a:hover { text-decoration: underline; }
.dokumen { max-width: 74ch; }
.dokumen h1 { font-size: clamp(32px, 4vw, 46px); margin-bottom: 18px; }
.dokumen h2 { font-size: 27px; margin-top: 44px; padding-top: 12px; border-top: 1px solid var(--line); }
.dokumen h3 { font-size: 20px; margin-top: 30px; }
.dokumen .jangkar { margin-left: -0.85em; padding-right: 0.35em; color: var(--line-kuat); text-decoration: none; opacity: 0; }
.dokumen h2:hover .jangkar, .dokumen h3:hover .jangkar { opacity: 1; }
.dokumen p, .dokumen li { color: color-mix(in srgb, var(--fg) 88%, var(--muted)); }
.dokumen ul, .dokumen ol { padding-left: 1.3em; }
.dokumen li { margin-bottom: 4px; }
.dokumen blockquote { margin: 20px 0; padding: 12px 18px; border-left: 3px solid var(--accent);
  background: var(--surface); border-radius: 0 8px 8px 0; color: var(--muted); }
.dokumen table { border-collapse: collapse; width: 100%; margin: 18px 0; font-size: 14px; display: block; overflow-x: auto; }
.dokumen th, .dokumen td { border: 1px solid var(--line); padding: 8px 12px; text-align: left; vertical-align: top; }
.dokumen th { background: var(--surface); font-family: var(--font-mono); font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; }
.dokumen code { background: var(--surface-2); border: 1px solid var(--line); border-radius: 5px; padding: 1px 5px; font-size: 0.9em; }
.dokumen pre code { background: none; border: 0; border-radius: 0; padding: 0; font-size: inherit; }
.dokumen hr { border: 0; border-top: 1px solid var(--line); margin: 34px 0; }

/* Blok kode */
.code { margin: 22px 0; border: 1px solid var(--line-kuat); border-radius: 10px; background: var(--kode-bg); overflow: hidden; }
.code-head { display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: var(--surface);
  border-bottom: 1px solid var(--line); font-family: var(--font-mono); font-size: 11.5px; color: var(--muted); }
.code-file { color: var(--fg); }
.code-lang { color: var(--muted); }
.copy { margin-left: auto; background: none; border: 1px solid var(--line-kuat); color: var(--muted);
  border-radius: 6px; padding: 2px 9px; font: inherit; font-size: 11px; cursor: pointer; display: none; }
html.js .copy { display: inline-block; }
.copy:hover { color: var(--fg); border-color: var(--accent); }
.code-body pre { margin: 0; padding: 14px 16px; overflow-x: auto; font-size: 13px; line-height: 1.7; background: var(--kode-bg) !important; }
.code-body .shiki { background: var(--kode-bg) !important; }
.shiki span { color: var(--shiki-dark); }
html[data-theme="light"] .shiki span { color: var(--shiki-light); }
@media (prefers-color-scheme: light) { html:not([data-theme]) .shiki span { color: var(--shiki-light); } }

.toc { position: sticky; top: 82px; align-self: start; font-size: 13px; border-left: 1px solid var(--line); padding-left: 16px; }
.toc-judul { font-family: var(--font-mono); font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.16em; color: var(--muted); margin-bottom: 8px; }
.toc ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.toc a { color: var(--muted); text-decoration: none; }
.toc a:hover { color: var(--accent); }
.toc .kedalaman-3 { padding-left: 12px; }
.docs-tata { display: grid; grid-template-columns: minmax(0, 74ch) 200px; gap: 40px; }
.docs-kaki { display: flex; justify-content: space-between; gap: 16px; margin-top: 56px; padding-top: 20px; border-top: 1px solid var(--line); }
.docs-kaki a { text-decoration: none; font-size: 14px; }
.docs-kaki .label { display: block; font-family: var(--font-mono); font-size: 10.5px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.12em; }
.sunting { font-family: var(--font-mono); font-size: 11.5px; color: var(--muted); margin-top: 12px; display: inline-block; }

/* Pencarian */
.cari-lapis { position: fixed; inset: 0; z-index: 60; background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(4px);
  display: flex; align-items: flex-start; justify-content: center; padding: 12vh 20px 20px; }
.cari-tutup { position: absolute; inset: 0; background: transparent; border: 0; cursor: default; }
.cari-panel { position: relative; width: min(640px, 100%); background: var(--surface); border: 1px solid var(--line-kuat);
  border-radius: 12px; overflow: hidden; box-shadow: 0 40px 120px -40px rgba(0, 0, 0, 0.8); }
.cari-input { width: 100%; border: 0; border-bottom: 1px solid var(--line); background: none; color: var(--fg);
  font: inherit; font-size: 16px; padding: 16px 18px; outline: none; }
.cari-hasil { max-height: 55vh; overflow-y: auto; padding: 8px; display: grid; gap: 2px; }
.cari-hasil p { margin: 10px 10px; }
.cari-entri { display: grid; gap: 2px; padding: 10px 12px; border-radius: 8px; text-decoration: none; }
.cari-entri:hover { background: var(--surface-2); }
.cari-judul { font-weight: 600; }
.cari-potongan { font-size: 12.5px; color: var(--muted); }

/* Footer */
.kaki { border-top: 1px solid var(--line); margin-top: auto; }
.kaki-dalam { display: flex; flex-wrap: wrap; gap: 24px; justify-content: space-between; padding: 28px 0; font-size: 13px; color: var(--muted); }
.kaki a { text-decoration: none; }
.kaki a:hover { color: var(--fg); }
.kaki-links { display: flex; flex-wrap: wrap; gap: 18px; }

/* Responsif */
@media (max-width: 980px) {
  .hero-grid { grid-template-columns: 1fr; gap: 36px; }
  .bagian-kepala { grid-template-columns: 1fr; gap: 10px; }
  .narasi { grid-template-columns: 1fr; gap: 26px; }
  .narasi.terbalik .narasi-teks { order: 0; }
  .bukti-grid { grid-template-columns: repeat(2, 1fr); }
  .bukti-sel:nth-child(2) { border-right: 0; }
  .docs { grid-template-columns: 1fr; }
  .sidebar { position: static; max-height: none; border-right: 0; border-bottom: 1px solid var(--line); padding: 0 0 18px; }
  .docs-tata { grid-template-columns: 1fr; }
  .toc { position: static; border-left: 0; padding-left: 0; border-top: 1px solid var(--line); padding-top: 18px; }
}
@media (max-width: 640px) {
  .topnav { display: none; }
  .topbar-dalam { gap: 12px; }
  .bukti-grid { grid-template-columns: 1fr; }
  .bukti-sel { border-right: 0; border-bottom: 1px solid var(--line); }
  .bukti-sel:last-child { border-bottom: 0; }
  .cari-pemicu span { display: none; }
}
`;

/**
 * Dokumen HTML kustom (judul + gaya + script hydration). `basePath` (mis. `/ramonyx` di
 * GitHub Pages) di-emit sebagai `<base href>` → semua URL relatif tetap benar di subpath.
 */
export function createDocument(basePath = ""): DocumentRenderer {
  const base = basePath === "" || basePath === "/" ? "/" : `${basePath.replace(/\/$/, "")}/`;
  return ({ title, body, head = "", scripts = "" }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<base href="${base}" />
<meta name="description" content="Ramonyx — full-stack TypeScript framework with file routing, streaming SSR, server actions, secure defaults, and an experimental Rust/V8 runtime." />
<meta name="theme-color" content="#0a0c08" />
<meta name="color-scheme" content="dark light" />
<title>${title.length > 0 ? `${title} · Ramonyx` : "Ramonyx — full-stack TypeScript, secure by default"}</title>
<style>${GAYA}</style>${head.length > 0 ? `\n${head}` : ""}
</head>
<body>
<div id="ramonyx-root">${body}</div>${scripts.length > 0 ? `\n${scripts}` : ""}
</body>
</html>
`;
}
