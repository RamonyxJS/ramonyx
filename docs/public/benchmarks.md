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
