---
recipe: api-validation
title: Add an API route with validation
summary: Export HTTP methods from src/routes/api, validate params/query/body at the trust boundary, and return stable errors.
when: A client or service needs JSON rather than HTML.
files: src/routes/api/users/[id].ts
verify: ramonyx check --json && ramonyx routes --json
---

# Add an API route with validation

```ts
// src/routes/api/users/[id].ts
import { route } from "ramonyx";

const idSchema = {
  "~standard": {
    version: 1 as const,
    vendor: "app",
    validate: (input: unknown) => {
      const id = String((input as { id?: unknown })?.id ?? "");
      return /^[a-z0-9-]+$/.test(id)
        ? { value: { id } }
        : { issues: [{ message: "Invalid id", path: ["id"] }] };
    },
  },
};

export const GET = route({
  params: idSchema,
  handler: async ({ params, json }) => {
    const user = await db.users.find(params.id);
    return user === null ? json({ error: "Not found" }, 404) : json({ user });
  },
});

export const DELETE = route({
  params: idSchema,
  handler: async ({ params, text }) => {
    await db.users.delete(params.id);
    return text("", 204);
  },
});
```

- File path maps to URL: `api/users/[id].ts` → `/api/users/:id`.
- Exported `GET`/`POST`/`PUT`/`PATCH`/`DELETE`/`HEAD`/`OPTIONS` define allowed methods. Anything
  else returns `405` with `Allow`.
- `params`, `query`, and `body` accept Standard Schema; invalid input returns `400` with `issues`.
- Validate at the boundary, then trust the validated value inside the handler. Never interpolate
  raw input into SQL/shell/URLs.
- Use `json()`/`text()` helpers so status and headers are explicit.

## Verify

```bash
ramonyx routes --json   # methods + file for /api/users/[id]
ramonyx check --json
```

Next: [Routing](../routing.md), [Security](../security/) and [Sessions & Auth](../sessions-and-auth.md).
