# Machine-readable docs (public)

Structured facts for humans and agents, generated from the **public** documentation only.

| File | Contents |
| --- | --- |
| `stats.json` | Version, package count, public ADR count, test counts — the single source of numbers |
| `features.json` | Feature status (implemented/partial/experimental/planned), packages, evidence, limitations |
| `rules.json` | Rules for writing apps (good/bad examples, enforcement) |
| `adrs.json` | Public architecture decisions (one-line decision + relations) |
| `glossary.json` | Terms and concept map |
| `api.json` / `cli.json` / `config.schema.json` | Extracted API, CLI, and config reference |
| `recipes.json` | Task recipes generated from `docs/public/recipes/*.md` |
| `case-studies.json` | Permissioned showcase status; empty until real apps and evidence are verified |
| `llms.txt` / `llms-full.txt` | Agent index and full public corpus |

Everything here is validated in CI: schemas, evidence paths (public only), ADR index, freshness, and
one-way links (public docs may never link to `docs/internal/`).

The server-side MCP package (`@ramonyx/mcp-docs-server`) serves these files plus the public pages.
