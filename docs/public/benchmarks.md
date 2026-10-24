# Benchmarks

Performance claims need measurements you can run. The benchmark protocol is fixed: warm up, repeat,
report the distribution (median, spread) — never a single run, never an average hiding a tail.

## What is measured

| Benchmark | Metric | How |
| --- | --- | --- |
| HTTP | requests/s, p50/p95/p99 | autocannon against the playground |
| SSR | render time, TTFB, output size | synchronous vs streaming, in-process |
| Security | status/error counts, RSS under abuse/soak | 6 abuse scenarios + sustained load |
| Public framework comparison | requests/s, p50/p99 | same JSON route under Ramonyx, Hono, and Node |
| Startup | wall/startup/load/eval | Rust runtime CLI, median of N runs |
| Web Vitals | LCP, CLS, FCP, TTFB | Playwright on the production build |
| Image pipeline | before/after LCP/CLS with variants | throttled CDP + cold loads |

## Commands

```bash
pnpm bench                 # HTTP baseline (warm-up 3s + 5 runs, median/spread)
pnpm bench:report          # compare against baseline (report-only, tolerance 25%)
pnpm bench:ssr             # SSR sync vs streaming
pnpm bench:ssr:report      # comparison artifact
pnpm bench:security        # abuse cases + soak (RSS from /proc)
pnpm bench:public          # public framework comparison (same JSON route)
pnpm bench:image           # image pipeline before/after (playground)
benchmarks/runtime-startup.sh   # Rust runtime startup (needs a release build)
```

Results are written under `benchmarks/results/`. Web Vitals are measured by the e2e suite and
compared report-only against the committed baseline.

## Baselines are per environment

A baseline is only meaningful on the machine that produced it. Baselines are stored per
(platform × arch × Node major × CPU), and the strict comparison **refuses to compare across
environments** — it prints the mismatching fields instead of pretending.

- Development baselines are committed for the maintainer machine.
- GitHub-hosted CI runs benchmarks **report-only**: runners vary too much for a blocking gate.
- The dedicated `.github/workflows/bench-strict.yml` workflow runs `pnpm bench:gate` on a
  self-hosted runner labeled `ramonyx-bench`. It blocks only on that matching environment and waits
  for the runner when it is offline; normal PRs keep the report-only fallback in `ci.yml`.
- `VITALS_STRICT=1` turns the Web Vitals comparison into a gate; use it only on a stable runner.

## Refresh procedure (strict runner)

1. Run `pnpm bench` and `pnpm bench:ssr` on the self-hosted runner with the app idle.
2. Inspect the median/spread; commit the per-environment baseline files under
   `benchmarks/results/baselines/`.
3. Run `pnpm bench:gate` on the same runner to confirm the new baseline passes.
4. Keep the report-only artifacts from `ci.yml`; never copy a baseline between machines or CPU
   models (the guard rejects it).

## Rules

- Same hardware/OS/runtime/config for every comparison.
- Identical work per request; verify responses match.
- Report medians and spread; keep raw artifacts.
- No public performance claim without a runnable benchmark in the repo.

## Public framework comparison

`pnpm bench:public` runs the same `GET /api/hello` JSON route through **Ramonyx**, **Hono**, and a
**Node built-in http** lower bound. All three use the same Node `http` → `fetch` adapter and the
same autocannon configuration. The response body is checked for parity before load starts.

- Scenario: routing + JSON response only. **Not** an SSR, hydration, static-asset, database,
  TLS, or middleware benchmark.
- Protocol: 3 s warm-up, 5 interleaved runs × 10 s, 50 connections, pipelining 1.
- Output: `benchmarks/results/public/http-frameworks-<environment>.json` with every run,
  median/spread, environment, and versions.
- Defaults can be overridden with `--duration-seconds`, `--warmup-seconds`, `--repeats`,
  `--connections`, and `--out`.

### Result (maintainer machine, 2026-10-24)

Linux x64, 8 vCPU, AMD Ryzen 5 7520U, Node v24.22.0, Ramonyx 2.0.1, Hono 4.13.13,
autocannon 8.0.0. Median of five 10 s runs; ranges are min–max across runs.

| Target | Requests/s (median) | Range | p50 (ms) | p99 (ms) | Errors |
| --- | ---: | ---: | ---: | ---: | ---: |
| Node built-in http | 2438 | 2070–2558 | 19 | 38 | 0 |
| Hono | 2156 | 1848–2271 | 21 | 59 | 0 |
| Ramonyx | 1805 | 1500–1938 | 26 | 47 | 0 |

Raw artifact:
[`http-frameworks-linux-x64-node24-amd-ryzen-5-7520u-with-radeon-graphics.json`](https://github.com/RamonyxJS/ramonyx/blob/main/benchmarks/results/public/http-frameworks-linux-x64-node24-amd-ryzen-5-7520u-with-radeon-graphics.json).

**Interpretation limit:** this is one shared machine and a deliberately narrow scenario. It shows
framework overhead on a minimal JSON route, not a general performance ranking. The strict internal
gate and the SSR benchmark remain separate; do not combine these numbers with SSR or Web Vitals
claims. Rerun on your hardware with the command above before making a decision.
