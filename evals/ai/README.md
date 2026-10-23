# AI eval (deterministic)

A small, deterministic hidden-test harness for agent workflows. There is **no LLM judge** and no
timing claim: a task passes only when `ramonyx check --json` and its hidden test both exit `0`.

## Baseline

```bash
pnpm eval:ai:baseline
```

- `baseline-reference.json` — reference solutions applied: **3/3 pass** (harness sanity).
- `baseline-empty.json` — no changes: **0/3 pass** (hidden tests catch missing work).
- `--brief` stores only pass/fail codes in the baseline JSON; rerun without it (or inspect the
  human output) for full failure text.

These numbers validate the harness, not an AI model. Run a real agent with:
 
```bash
pnpm eval:ai --agent "<agent command>"
# or one task:
pnpm eval:ai --agent "<agent command>" --task page-loader --keep
```

The agent runs in a copied fixture workdir (`evals/ai/.work/<task>`) with `EVAL_APP`,
`EVAL_TASK_ID`, `EVAL_PROMPT`, and `EVAL_WORKDIR` in its environment. `--keep` preserves the
workdir for inspection; `--json --out <file>` writes a machine-readable report.

## Tasks

| Task | Checks |
| --- | --- |
| `page-loader` | Page module exports a loader with serializable data + `ramonyx check` |
| `form-action` | `actionSchema` rejects empty input; action result + `ramonyx check` |
| `fix-boundary` | Removes `node:fs` from a client page; `ramonyx check` must be clean |

Fixtures live in `fixtures/basic`; a task may add `fixture/` overlay and `solution/` overlay. Hidden
tests import the app from `EVAL_APP` (absolute path) so they cannot accidentally test the reference
source. Never add timings to the report; it is a pass/fail contract, and speed claims need a
separate measured benchmark.

## Adding a task

1. Create `tasks/<id>/task.json` (`id`, `title`, `prompt`, `hidden`).
2. Add `hidden.test.ts` using `process.env.EVAL_APP`.
3. Add the smallest `solution/` overlay that makes it pass.
4. Run `pnpm eval:ai --solution reference` and `--solution empty`; the first must be green, the
   second must fail the new task.
