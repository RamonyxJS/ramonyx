# Showcase and case studies

**No third-party case studies are published yet.** This page is the intake and verification process,
not a collection of invented logos or metrics.

The public documentation site itself is a first-party dogfood deployment, but it is not counted as
customer proof. Real case studies require a production app, the owner's permission, and evidence
that can be checked.

## What qualifies

- A real application running Ramonyx (production or a public staging environment).
- A public URL, or a private demo arranged for verification.
- Permission to publish the name, stack, screenshots, and any quoted material.
- Measured results with a method, date, environment, and raw data where possible.
- Explicit limitations: what did **not** improve, what is still manual, and what would be done
  differently.

## What we publish

Each case study follows this shape:

1. **Problem** — the constraint that made the team choose or evaluate Ramonyx.
2. **Architecture** — deployment target, rendering model, data/auth/storage choices.
3. **Migration** — what changed, what stayed, and how long it took.
4. **Results** — before/after metrics with methodology; no unsourced percentages.
5. **Limitations** — costs, trade-offs, incidents, and unfinished work.
6. **Quote** — only with written approval and a named role.

We do not publish customer data, secrets, private URLs, unverified testimonials, or metrics without
a source. A benchmark from a different machine is labeled as such.

## Submit

Open a **Case study submission** issue:

<https://github.com/RamonyxJS/ramonyx/issues/new?template=case_study.yml>

Include the app URL or demo contact, stack, deployment target, the problem, and any measurements.
A maintainer will verify the app and the evidence, agree on what may be public, and draft the page
with you. Publication is opt-in; submitting an issue does not grant permission to publish.

## Verification checklist

- [ ] App responds and appears to run Ramonyx (headers, repository, or owner confirmation).
- [ ] Owner confirms permission for the name, URL, screenshots, and quotes.
- [ ] Every metric has a date, environment, method, and raw artifact or reproducible command.
- [ ] Claims are scoped to the app, not generalized to all Ramonyx users.
- [ ] Limitations and residual risks are included.
- [ ] Security/privacy review removes customer data, secrets, and private infrastructure details.

The machine-readable status is in
[`machine/case-studies.json`](machine/case-studies.json); it remains empty until the checks above
pass. Agents should treat an empty list as "no published case studies", never as a reason to invent
one.
