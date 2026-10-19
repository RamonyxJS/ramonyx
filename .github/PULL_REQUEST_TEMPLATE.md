## What & why

<!-- One paragraph: the change and the problem it solves. Link ADRs / TODO ids if relevant. -->

## Checklist

- [ ] `pnpm lint && pnpm typecheck && pnpm test` pass locally
- [ ] `pnpm docs:validate` passes (if `docs/` or `docs/machine/` changed) — run `pnpm docs:generate` first
- [ ] `pnpm test:e2e` passes (if app/runtime behavior changed)
- [ ] Facts/numbers live in `docs/machine/` (no numbers typed into prose); evidence paths exist
- [ ] Architectural decisions have an ADR (`docs/adr/` + index) and an `adrs.json` entry
- [ ] Public text is English; internal docs are Indonesian
