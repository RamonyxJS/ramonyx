---
adr: 0057
title: "Server actions: form mutations per page with progressive enhancement"
visibility: public
---

# ADR-0057: Server Actions — Form Mutations First-Class

- Status: Public summary (the full decision record lives in the internal log)
- Date: 2026-10-18

## Context

Forms are the most common mutation path. Requiring a separate API route plus client fetch code
duplicates validation and breaks without JavaScript. Full RPC frameworks add a mental model that
does not fit file routing.

## Decision

1. A page may export `action`, handling `POST` to **the same URL**.
2. `actionSchema` (Standard Schema) validates `FormData` before the action runs; invalid input
   returns `400` with field errors.
3. The action receives `params`, `formData`, `request`, `env`, `log`, `locale`, `json()`, and
   `revalidate()`; it returns `{ message, errors, data, status, headers, redirect }`.
4. Redirects use `303` (POST/Redirect/GET) so refresh does not resubmit.
5. The browser intercepts submissions when JavaScript is available; without JavaScript the form
   performs a normal POST and still works (progressive enhancement).

## Consequences

- Validation lives beside the UI that uses it.
- Actions share the page's loader context (including i18n locale).
- There is no global action router; actions are page-scoped by design.
- Optimistic UI and pending states are the app's responsibility.
