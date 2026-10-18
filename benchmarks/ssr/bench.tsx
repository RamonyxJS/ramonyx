import { mkdir, readFile, writeFile } from "node:fs/promises";
import { cpus } from "node:os";
import { dirname, relative, resolve } from "node:path";
import type { LoadedPage } from "@ramonyx/core";
import { createReactRenderer } from "@ramonyx/react";
import { createHandler } from "@ramonyx/server";
import { createPageRoutes } from "@ramonyx/ssr";
import { lazy, type ReactElement, Suspense } from "react";
import { median, type Spread, spread } from "../stats.ts";
import { compareSsrArtifacts, formatSsrReport, type SsrArtifact } from "./compare.ts";

// Bench SSR (protokol §8): **sinkron vs streaming** — halaman kecil → besar, plus skenario
// konten tertunda (Suspense, inti keunggulan streaming). Diukur in-process (tanpa socket):
// waktu handler+body, TTFB = byte pertama body, dan ukuran output. Warm-up + N ulangan →
// median + spread. Default menulis baseline ter-commit; mode **report-only** (`--out` lain +
// `--compare`) dipakai CI tanpa menyentuh baseline (ADR-0048). Jalankan lewat `pnpm bench:ssr`
// (NODE_ENV=production → React build produksi).

const args = process.argv.slice(2);
const argValue = (name: string): string | undefined => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const baselinePath = resolve(
  process.cwd(),
  argValue("--baseline") ?? "benchmarks/results/ssr-baseline.json",
);
const outPath = resolve(process.cwd(), argValue("--out") ?? "benchmarks/results/ssr-baseline.json");
const compare = args.includes("--compare");
const strict = args.includes("--strict");
const tolerancePercent = Number(argValue("--tolerance-pct") ?? "25");
const repeats = Math.max(1, Number(argValue("--repeats") ?? "9"));
const warmup = Math.max(0, Number(argValue("--warmup") ?? "3"));

if (process.env.NODE_ENV !== "production") {
  console.warn(
    "peringatan: NODE_ENV bukan production → React build dev (angka tidak representatif). Gunakan `pnpm bench:ssr`.",
  );
}

let baseline: SsrArtifact | undefined;
if (compare) {
  try {
    baseline = JSON.parse(await readFile(baselinePath, "utf8")) as SsrArtifact;
  } catch {
    console.log(`(baseline tidak ditemukan di ${baselinePath} — laporan tanpa perbandingan)`);
  }
}

const renderer = createReactRenderer();
const client = { script: "/assets/client.js" };

// ---- Halaman uji ----

function Rows({ count }: { count: number }) {
  const rows = Array.from({ length: count }, (_, index) => ({
    id: `baris-${index}`,
    value: index * 3,
  }));
  return (
    <table>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td>{row.id}</td>
            <td>{row.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SmallPage() {
  const items = Array.from({ length: 10 }, (_, index) => ({ id: `item-${index}` }));
  return (
    <main>
      <h1>Halaman kecil</h1>
      <p>Konten statis ringan untuk baseline.</p>
      <ul>
        {items.map((item) => (
          <li key={item.id}>{item.id}</li>
        ))}
      </ul>
    </main>
  );
}

function MediumPage() {
  return (
    <main>
      <h1>Halaman sedang</h1>
      <Rows count={2000} />
    </main>
  );
}

function LargePage() {
  return (
    <main>
      <h1>Halaman besar</h1>
      <Rows count={10000} />
    </main>
  );
}

function pageFor(path: string, component: unknown): LoadedPage {
  return {
    path,
    page: { default: component, metadata: { title: "SSR bench" } },
    layouts: [],
    error: undefined,
    directory: "/tmp",
  };
}

/** Konten tertunda `delayMs` → fallback dulu, konten menyusul (dibuat baru tiap ulangan). */
function suspensePage(delayMs: number): LoadedPage {
  const LazyRows = lazy(
    () =>
      new Promise<{ default: () => ReactElement }>((resolve) => {
        setTimeout(() => resolve({ default: () => <Rows count={400} /> }), delayMs);
      }),
  );

  function SuspensePage() {
    return (
      <main>
        <h1>Halaman dengan konten tertunda</h1>
        <Suspense fallback={<p>memuat konten…</p>}>
          <LazyRows />
        </Suspense>
      </main>
    );
  }

  return pageFor("/", SuspensePage);
}

interface Scenario {
  readonly id: string;
  readonly makePage: () => LoadedPage;
  /** Jalur sinkron harus menghasilkan byte identik dengan streaming (halaman statis). */
  readonly expectParity: boolean;
  /** Penanda konten yang hanya bisa muncul di jalur streaming (suspense). */
  readonly contentMarker?: string;
  readonly fallbackMarker?: string;
}

const scenarios: readonly Scenario[] = [
  { id: "small", makePage: () => pageFor("/", SmallPage), expectParity: true },
  { id: "medium", makePage: () => pageFor("/", MediumPage), expectParity: true },
  { id: "large", makePage: () => pageFor("/", LargePage), expectParity: true },
  {
    id: "suspense",
    makePage: () => suspensePage(50),
    expectParity: false,
    contentMarker: "baris-399",
    fallbackMarker: "memuat konten",
  },
];

// ---- Pengukuran ----

interface Sample {
  readonly syncTotalMs: number;
  readonly syncBytes: number;
  readonly syncText: string;
  readonly streamTtfbMs: number;
  readonly streamTotalMs: number;
  readonly streamBytes: number;
  readonly streamText: string;
}

const requestUrl = "http://bench.local/";

async function measureOnce(scenario: Scenario): Promise<Sample> {
  // GC eksplisit antar-sampel (butuh `--expose-gc`): tanpa ini, sampel besar kadang jatuh ke
  // "mode lambat" karena GC → spread liar (lihat catatan kalibrasi ADR-0048).
  (globalThis as { gc?: () => void }).gc?.();

  const syncHandler = createHandler({
    routes: createPageRoutes({ pages: [scenario.makePage()], renderer, client }),
  });
  const streamHandler = createHandler({
    routes: createPageRoutes({ pages: [scenario.makePage()], renderer, client, streaming: true }),
  });

  const syncStart = performance.now();
  const syncResponse = await syncHandler(new Request(requestUrl));
  const syncText = await syncResponse.text();
  const syncTotalMs = performance.now() - syncStart;

  const streamStart = performance.now();
  const streamResponse = await streamHandler(new Request(requestUrl));
  const reader = streamResponse.body?.getReader();
  if (reader === undefined) {
    throw new Error("respons streaming tanpa body");
  }

  const decoder = new TextDecoder();
  let streamText = "";
  let streamBytes = 0;
  let streamTtfbMs = -1;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (streamTtfbMs < 0) {
      streamTtfbMs = performance.now() - streamStart;
    }
    streamText += decoder.decode(value, { stream: true });
    streamBytes += value.byteLength;
  }
  streamText += decoder.decode();
  const streamTotalMs = performance.now() - streamStart;

  return {
    syncTotalMs,
    syncBytes: Buffer.byteLength(syncText),
    syncText,
    streamTtfbMs,
    streamTotalMs,
    streamBytes,
    streamText,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function aggregateScenario(
  scenario: Scenario,
  samples: readonly Sample[],
): Record<string, unknown> {
  const syncTotals = samples.map((sample) => sample.syncTotalMs);
  const ttfb = samples.map((sample) => sample.streamTtfbMs);
  const streamTotals = samples.map((sample) => sample.streamTotalMs);
  const syncBytes = samples.map((sample) => sample.syncBytes);
  const streamBytes = samples.map((sample) => sample.streamBytes);

  const flags: Record<string, boolean> = {};
  if (!scenario.expectParity) {
    if (scenario.contentMarker !== undefined) {
      flags.streamHasContent = samples.every((sample) =>
        sample.streamText.includes(scenario.contentMarker as string),
      );
      flags.syncHasContent = samples.every((sample) =>
        sample.syncText.includes(scenario.contentMarker as string),
      );
    }
    if (scenario.fallbackMarker !== undefined && scenario.contentMarker !== undefined) {
      // Fallback harus terkirim sebelum konten — inti janji streaming (shell lebih dulu).
      flags.fallbackBeforeContent = samples.every((sample) => {
        const fallback = sample.streamText.indexOf(scenario.fallbackMarker as string);
        const content = sample.streamText.indexOf(scenario.contentMarker as string);
        return fallback !== -1 && content !== -1 && fallback < content;
      });
    }
  }

  return {
    sync: { totalMs: round2(median(syncTotals)) },
    stream: { ttfbMs: round2(median(ttfb)), totalMs: round2(median(streamTotals)) },
    bytes: { sync: Math.round(median(syncBytes)), stream: Math.round(median(streamBytes)) },
    ...(scenario.expectParity
      ? { parity: samples.every((sample) => sample.syncText === sample.streamText) }
      : {
          note: "suspense: jalur sinkron hanya memuat fallback — konten menyusul lewat retry client",
        }),
    ...flags,
    spread: {
      "sync.totalMs": spread(syncTotals),
      "stream.ttfbMs": spread(ttfb),
      "stream.totalMs": spread(streamTotals),
    } satisfies Record<string, Spread>,
  };
}

// ---- Jalankan ----

const pages: Record<string, unknown> = {};
let gagal = false;

console.log(`bench SSR: warm-up ${warmup} + ${repeats} ulangan per skenario (React produksi)\n`);
for (const scenario of scenarios) {
  for (let index = 0; index < warmup; index += 1) {
    await measureOnce(scenario);
  }
  const samples: Sample[] = [];
  for (let index = 0; index < repeats; index += 1) {
    samples.push(await measureOnce(scenario));
  }

  const aggregate = aggregateScenario(scenario, samples);
  pages[scenario.id] = aggregate;

  const ringkas = aggregate as {
    sync: { totalMs: number };
    stream: { ttfbMs: number; totalMs: number };
    bytes: { sync: number; stream: number };
    parity?: boolean;
  };
  const paritas =
    scenario.expectParity === false ? "n/a (suspense)" : ringkas.parity === true ? "✓" : "✗";
  console.log(
    `${scenario.id.padEnd(9)} sync ${ringkas.sync.totalMs} ms | stream ttfb ${ringkas.stream.ttfbMs} ms, total ${ringkas.stream.totalMs} ms | ${ringkas.bytes.stream} B | paritas ${paritas}`,
  );

  if (scenario.expectParity && ringkas.parity !== true) {
    console.error(`PARITAS GAGAL untuk ${scenario.id}: keluaran streaming berbeda dari sinkron`);
    gagal = true;
  }
  if (!scenario.expectParity && scenario.contentMarker !== undefined) {
    const flags = aggregate as Record<string, unknown>;
    if (flags.streamHasContent !== true || flags.syncHasContent !== false) {
      console.error(
        `PERILAKU SUSPENSE TIDAK SESUAI untuk ${scenario.id}: ${JSON.stringify(flags)}`,
      );
      gagal = true;
    }
    if (scenario.fallbackMarker !== undefined && flags.fallbackBeforeContent !== true) {
      console.error(`Fallback tidak terkirim sebelum konten untuk ${scenario.id}`);
      gagal = true;
    }
  }
}

const payload = {
  generatedAt: new Date().toISOString(),
  scenario:
    "SSR in-process (createHandler tanpa socket): sinkron vs streaming — kecil(0.6 KB)/sedang(80 KB)/besar(400 KB) + suspense(50 ms); TTFB = byte pertama body",
  environment: {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    nodeEnv: process.env.NODE_ENV ?? "(tidak diset)",
    cpus: cpus().length,
    cpuModel: cpus()[0]?.model ?? "unknown",
  },
  tool: "benchmarks/ssr/bench.tsx",
  repeats,
  warmup,
  pages,
};

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`\nartefak: ${relative(process.cwd(), outPath)}`);

if (compare && baseline !== undefined) {
  const baselineEnv = baseline.environment as { cpuModel?: unknown } | undefined;
  const bedaEnv =
    baselineEnv?.cpuModel !== undefined && baselineEnv.cpuModel !== payload.environment.cpuModel;
  if (bedaEnv && strict) {
    // Gate lintas mesin tidak bermakna (ADR-0048): refus eksplisit, bukan lulus/gagal palsu.
    console.error(
      `--strict tidak bisa dipakai lintas mesin: baseline dari '${String(baselineEnv?.cpuModel)}', sekarang '${payload.environment.cpuModel}'. Jalankan di mesin baseline atau perbarui baseline.`,
    );
    process.exitCode = 1;
  }

  // Lantai 1 ms: metrik kecil (halaman ringan ~2 ms) masih dapat bergoyang ±1 ms di mesin
  // berisik; regresi nyata (halaman sedang/besar) tetap tertangkap (ADR-0048).
  const report = compareSsrArtifacts(baseline, payload as SsrArtifact, tolerancePercent, {
    minAbsoluteDelta: 1,
  });
  console.log(`\n${formatSsrReport(report)}`);
  if (report.breached && strict && !bedaEnv) {
    console.error("REGRESI melebihi toleransi (mode --strict)");
    process.exitCode = 1;
  }
}

if (gagal) {
  process.exitCode = 1;
}
