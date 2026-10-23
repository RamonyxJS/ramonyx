// Gaya halaman sambutan template. Sengaja berupa string agar SSR dan bundle klien memakai
// stylesheet yang sama tanpa bergantung pada konfigurasi CSS global.
export const WELCOME_CSS = `
:root {
  color-scheme: light dark;
  --rw-bg: #f3f1e8;
  --rw-surface: #fbfaf5;
  --rw-ink: #14170f;
  --rw-muted: #626858;
  --rw-line: #d5d2c2;
  --rw-line-strong: #b9b5a2;
  --rw-blue: #233fce;
  --rw-blue-soft: #e4e7fb;
  --rw-orange: #d95a2b;
  --rw-dark: #151811;
  --rw-dark-2: #1c2117;
  --rw-dark-fg: #edf0e2;
  --rw-dark-muted: #a7ae9a;
  --rw-dark-line: #30362a;
  --rw-mono: ui-monospace, SFMono-Regular, "Cascadia Mono", Menlo, Consolas, monospace;
  --rw-sans: "Avenir Next", "Segoe UI", ui-sans-serif, system-ui, sans-serif;
  --rw-serif: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif;
  --rw-max: 1180px;
  --rw-radius: 4px;
}

html { scroll-behavior: smooth; }
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--rw-bg);
  color: var(--rw-ink);
  font: 400 16px/1.6 var(--rw-sans);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
::selection { background: var(--rw-blue); color: #fff; }
a { color: inherit; text-decoration-color: color-mix(in srgb, var(--rw-blue) 45%, transparent); text-underline-offset: 3px; }
a:hover { text-decoration-color: var(--rw-blue); }
:focus-visible { outline: 2px solid var(--rw-blue); outline-offset: 3px; }
code, pre { font-family: var(--rw-mono); }
button, input { font: inherit; }

.rw-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  overflow-x: clip;
  background-image: linear-gradient(90deg, transparent 0, transparent calc(100% - 1px), var(--rw-line) calc(100% - 1px));
  background-size: 25% 100%;
  background-repeat: repeat-x;
}

.rw-main { width: min(100% - 48px, var(--rw-max)); margin: 0 auto; flex: 1; }

.rw-top {
  width: min(100% - 48px, var(--rw-max));
  margin: 0 auto;
  min-height: 72px;
  display: flex;
  align-items: center;
  gap: 28px;
  border-bottom: 1px solid var(--rw-line);
}
.rw-brand {
  display: inline-flex;
  align-items: center;
  gap: 11px;
  text-decoration: none;
  font-family: var(--rw-serif);
  font-size: 25px;
  line-height: 1;
  letter-spacing: -0.015em;
}
.rw-mark {
  width: 12px;
  height: 12px;
  background: var(--rw-blue);
  transform: rotate(45deg);
  flex: 0 0 auto;
}
.rw-brand small {
  font: 500 10px/1 var(--rw-mono);
  letter-spacing: 0.08em;
  color: var(--rw-muted);
  border-left: 1px solid var(--rw-line-strong);
  padding-left: 11px;
}
.rw-nav { display: flex; align-items: center; gap: 20px; margin-left: auto; }
.rw-nav a {
  text-decoration: none;
  color: var(--rw-muted);
  font-size: 14px;
  padding: 5px 0;
  border-bottom: 1px solid transparent;
}
.rw-nav a:hover { color: var(--rw-ink); border-bottom-color: var(--rw-blue); }
.rw-nav .rw-nav-strong {
  color: var(--rw-ink);
  border: 1px solid var(--rw-line-strong);
  border-radius: var(--rw-radius);
  padding: 7px 12px;
  background: var(--rw-surface);
}
.rw-nav .rw-nav-strong:hover { border-color: var(--rw-ink); }

.rw-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(360px, 0.92fr);
  gap: 64px;
  align-items: center;
  padding: 84px 0 78px;
  border-bottom: 1px solid var(--rw-line);
}
.rw-hero-copy { max-width: 650px; }
.rw-kicker {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 0 0 26px;
  color: var(--rw-muted);
  font: 500 12px/1.4 var(--rw-mono);
}
.rw-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--rw-orange);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--rw-orange) 16%, transparent);
  flex: 0 0 auto;
}
.rw-hero h1 {
  margin: 0 0 24px;
  font-family: var(--rw-serif);
  font-weight: 400;
  font-size: clamp(52px, 7.2vw, 94px);
  line-height: 0.94;
  letter-spacing: -0.035em;
  text-wrap: balance;
}
.rw-hero h1 span { color: var(--rw-blue); }
.rw-lede {
  max-width: 48ch;
  margin: 0 0 30px;
  color: var(--rw-muted);
  font-size: clamp(17px, 1.5vw, 19px);
  line-height: 1.55;
}
.rw-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 10px 22px; }
.rw-button, .rw-quiet {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  text-decoration: none;
  font-size: 14px;
  font-weight: 600;
  border-radius: var(--rw-radius);
}
.rw-button {
  min-height: 43px;
  padding: 0 17px;
  background: var(--rw-blue);
  color: #fff;
  border: 1px solid var(--rw-blue);
}
.rw-button:hover { background: color-mix(in srgb, var(--rw-blue) 84%, #000); }
.rw-quiet { color: var(--rw-ink); padding: 8px 0; border-bottom: 1px solid var(--rw-line-strong); border-radius: 0; }
.rw-quiet:hover { border-bottom-color: var(--rw-blue); }
.rw-stack {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
  margin: 38px 0 0;
  padding: 0;
  list-style: none;
  color: var(--rw-muted);
  font: 12px/1.4 var(--rw-mono);
}
.rw-stack li::before { content: "/"; color: var(--rw-line-strong); margin-right: 7px; }

.rw-status {
  position: relative;
  background: var(--rw-dark);
  color: var(--rw-dark-fg);
  border: 1px solid var(--rw-dark-line);
  border-radius: var(--rw-radius);
  padding: 19px;
  box-shadow: 12px 12px 0 var(--rw-blue-soft);
}
.rw-status::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(135deg, transparent 0 78%, rgba(255,255,255,.035) 78%);
}
.rw-status-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding-bottom: 13px;
  border-bottom: 1px solid var(--rw-dark-line);
  font: 500 10px/1.4 var(--rw-mono);
  letter-spacing: 0.09em;
  color: var(--rw-dark-muted);
}
.rw-live { display: inline-flex; align-items: center; gap: 6px; color: #a8dfad; letter-spacing: 0; }
.rw-live::before {
  content: "";
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #7bdc85;
  animation: rw-pulse 2.4s ease-out infinite;
}
.rw-url {
  margin: 16px 0 3px;
  font: 500 14px/1.4 var(--rw-mono);
  color: #cbd6ff;
  overflow-wrap: anywhere;
}
.rw-status-sub { margin: 0; color: var(--rw-dark-muted); font-size: 12px; }
.rw-status .rw-brandline {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 21px 0 14px;
  padding-top: 17px;
  border-top: 1px solid var(--rw-dark-line);
  font-family: var(--rw-serif);
  font-size: 21px;
}
.rw-status .rw-brandline img { width: 25px; height: 25px; display: block; }
.rw-tree {
  margin: 0;
  padding: 15px;
  background: rgba(0,0,0,.18);
  border: 1px solid var(--rw-dark-line);
  border-radius: 2px;
  color: #c9d2bd;
  font: 11.5px/1.75 var(--rw-mono);
  overflow-x: auto;
}
.rw-tree b { color: #f0c6a9; font-weight: 500; }
.rw-tree em { color: #8fa5ff; font-style: normal; }
.rw-status-foot {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 14px;
  color: var(--rw-dark-muted);
  font: 10px/1.4 var(--rw-mono);
}

.rw-section { padding: 68px 0 0; }
.rw-section-head {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr) minmax(220px, 0.55fr);
  gap: 20px;
  align-items: start;
  padding-bottom: 23px;
  border-bottom: 1px solid var(--rw-line);
}
.rw-index { color: var(--rw-orange); font: 500 12px/1.4 var(--rw-mono); padding-top: 8px; }
.rw-section h2 {
  margin: 0;
  font-family: var(--rw-serif);
  font-size: clamp(30px, 3.6vw, 47px);
  font-weight: 400;
  line-height: 1;
  letter-spacing: -0.025em;
}
.rw-section-head p { margin: 3px 0 0; color: var(--rw-muted); font-size: 14px; line-height: 1.5; }

.rw-steps {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border-bottom: 1px solid var(--rw-line);
}
.rw-step { padding: 25px 24px 28px 0; border-right: 1px solid var(--rw-line); }
.rw-step + .rw-step { padding-left: 24px; }
.rw-step:last-child { border-right: 0; }
.rw-step-index { color: var(--rw-muted); font: 500 11px/1.4 var(--rw-mono); }
.rw-step h3 { margin: 18px 0 7px; font-family: var(--rw-serif); font-size: 25px; font-weight: 400; line-height: 1.1; }
.rw-step p { margin: 0 0 16px; color: var(--rw-muted); font-size: 14px; line-height: 1.55; }
.rw-step code { display: inline-block; padding: 4px 7px; background: var(--rw-blue-soft); color: var(--rw-blue); border-radius: 2px; font-size: 11.5px; }
.rw-step a { color: var(--rw-blue); font-size: 13px; font-weight: 600; text-decoration: none; }
.rw-step a:hover { text-decoration: underline; }

.rw-demo {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 0;
  border-bottom: 1px solid var(--rw-line);
}
.rw-demo-panel { padding: 34px 32px 36px 0; }
.rw-demo-panel + .rw-demo-panel { padding-left: 32px; border-left: 1px solid var(--rw-line); }
.rw-label { color: var(--rw-orange); font: 500 10px/1.4 var(--rw-mono); letter-spacing: 0.08em; }
.rw-demo h2 { margin: 12px 0 9px; font-family: var(--rw-serif); font-size: clamp(27px, 3vw, 37px); font-weight: 400; line-height: 1.04; letter-spacing: -0.02em; }
.rw-demo p { max-width: 52ch; margin: 0 0 20px; color: var(--rw-muted); font-size: 14px; line-height: 1.55; }
.rw-counter {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--rw-line-strong);
  border-radius: var(--rw-radius);
  background: var(--rw-surface);
  color: var(--rw-ink);
  padding: 10px 15px;
  cursor: pointer;
  font-weight: 600;
  font-size: 14px;
}
.rw-counter:hover { border-color: var(--rw-blue); color: var(--rw-blue); }
.rw-counter strong { font-family: var(--rw-mono); font-size: 13px; color: var(--rw-blue); }
.rw-form { display: grid; gap: 9px; max-width: 410px; }
.rw-form label { color: var(--rw-muted); font: 11px/1.4 var(--rw-mono); }
.rw-form-row { display: flex; gap: 8px; }
.rw-form input {
  width: 100%;
  min-height: 42px;
  padding: 9px 11px;
  color: var(--rw-ink);
  background: var(--rw-surface);
  border: 1px solid var(--rw-line-strong);
  border-radius: var(--rw-radius);
}
.rw-form input:focus { outline: 2px solid var(--rw-blue); outline-offset: 1px; }
.rw-form button {
  flex: 0 0 auto;
  min-height: 42px;
  padding: 0 14px;
  border: 1px solid var(--rw-ink);
  border-radius: var(--rw-radius);
  background: var(--rw-ink);
  color: var(--rw-bg);
  cursor: pointer;
  font-weight: 600;
  font-size: 13px;
}
.rw-form button:hover { background: var(--rw-blue); border-color: var(--rw-blue); color: #fff; }
.rw-error, .rw-success { margin: 10px 0 0; font-size: 13px; }
.rw-error { color: var(--rw-orange); }
.rw-success { color: var(--rw-blue); }
.rw-api-link { margin-top: 16px; font: 12px/1.5 var(--rw-mono); color: var(--rw-muted); }
.rw-api-link a { color: var(--rw-blue); }

.rw-features {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border-bottom: 1px solid var(--rw-line);
}
.rw-feature { min-height: 150px; padding: 24px 22px 27px 0; border-right: 1px solid var(--rw-line); }
.rw-feature + .rw-feature { padding-left: 22px; }
.rw-feature:last-child { border-right: 0; }
.rw-feature h3 { margin: 0 0 8px; font-family: var(--rw-serif); font-size: 21px; font-weight: 400; }
.rw-feature p { margin: 0; color: var(--rw-muted); font-size: 13px; line-height: 1.5; }

.rw-notfound {
  max-width: 760px;
  padding: 76px 0 90px;
}
.rw-notfound h1 {
  margin: 0 0 16px;
  font-family: var(--rw-serif);
  font-size: clamp(42px, 6vw, 72px);
  font-weight: 400;
  line-height: 0.98;
  letter-spacing: -0.03em;
}
.rw-notfound p { color: var(--rw-muted); }
.rw-notfound code { color: var(--rw-blue); font-size: 0.92em; }
.rw-notfound .rw-button { margin-top: 12px; color: #fff; }
.rw-footer {
  width: min(100% - 48px, var(--rw-max));
  margin: 0 auto;
  padding: 23px 0 28px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  color: var(--rw-muted);
  font-size: 12px;
}
.rw-footer nav { display: flex; gap: 16px; }
.rw-footer a { text-decoration: none; color: var(--rw-ink); }
.rw-footer a:hover { color: var(--rw-blue); }

@keyframes rw-pulse {
  0% { box-shadow: 0 0 0 0 rgba(123,220,133,.45); }
  70% { box-shadow: 0 0 0 7px rgba(123,220,133,0); }
  100% { box-shadow: 0 0 0 0 rgba(123,220,133,0); }
}

@media (max-width: 940px) {
  .rw-hero { grid-template-columns: 1fr; gap: 42px; padding: 60px 0 58px; }
  .rw-status { max-width: 560px; }
  .rw-section-head { grid-template-columns: 42px minmax(0, 1fr); }
  .rw-section-head p { grid-column: 2; margin-top: 10px; }
  .rw-features { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .rw-feature:nth-child(2) { border-right: 0; }
  .rw-feature:nth-child(n+3) { border-top: 1px solid var(--rw-line); }
}

@media (max-width: 680px) {
  .rw-main, .rw-top, .rw-footer { width: min(100% - 32px, var(--rw-max)); }
  .rw-top { min-height: 62px; gap: 14px; }
  .rw-brand { font-size: 22px; }
  .rw-brand small { display: none; }
  .rw-nav { gap: 12px; }
  .rw-nav a:not(.rw-nav-strong) { display: none; }
  .rw-hero h1 { font-size: clamp(47px, 14vw, 68px); }
  .rw-status { padding: 16px; box-shadow: 7px 7px 0 var(--rw-blue-soft); }
  .rw-steps, .rw-demo, .rw-features { grid-template-columns: 1fr; }
  .rw-step, .rw-step + .rw-step, .rw-feature, .rw-feature + .rw-feature { padding: 22px 0; border-right: 0; border-left: 0; }
  .rw-step + .rw-step, .rw-feature + .rw-feature, .rw-demo-panel + .rw-demo-panel { border-top: 1px solid var(--rw-line); }
  .rw-demo-panel, .rw-demo-panel + .rw-demo-panel { padding: 28px 0; border-left: 0; }
  .rw-section { padding-top: 50px; }
  .rw-section-head { grid-template-columns: 32px minmax(0, 1fr); gap: 13px; }
  .rw-form-row { flex-direction: column; }
  .rw-footer { align-items: flex-start; flex-direction: column; gap: 10px; }
}

@media (prefers-color-scheme: dark) {
  :root {
    --rw-bg: #0d100b;
    --rw-surface: #151a12;
    --rw-ink: #edf0e2;
    --rw-muted: #9ba38f;
    --rw-line: #2a3024;
    --rw-line-strong: #414a39;
    --rw-blue: #aebaff;
    --rw-blue-soft: #20263d;
    --rw-orange: #f08a5e;
  }
  ::selection { color: #0d100b; }
  .rw-button, .rw-notfound .rw-button { color: #12150e; }
  .rw-button:hover { color: #fff; }
  .rw-status { box-shadow: 12px 12px 0 #1b2238; }
  .rw-status .rw-tree { background: rgba(0,0,0,.24); }
}

@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  .rw-live::before { animation: none; }
}
`;
