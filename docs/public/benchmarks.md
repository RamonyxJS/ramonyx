# Benchmarks

Performance claims need measurements you can run. The benchmark protocol is fixed: warm up, repeat,
report the distribution (median, spread) — never a single run, never an average hiding a tail.

## What is measured

| Benchmark | Metric | How |
| --- | --- | --- |
| HTTP | requests/s, p50/p95/p99 | autocannon against the playground |
| SSR | render time, TTFB, output size | synchronous vs streaming, in-process |
| Security | status/error counts, RSS under abuse/soak | 6 abuse scenarios + sustained load |
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
- CI runs benchmarks **report-only**: GitHub-hosted runners vary too much for a blocking gate.
- `VITALS_STRICT=1` turns the Web Vitals comparison into a gate; use it only on a stable runner.

## Rules

- Same hardware/OS/runtime/config for every comparison.
- Identical work per request; verify responses match.
- Report medians and spread; keep raw artifacts.
- No public performance claim without a runnable benchmark in the repo.
