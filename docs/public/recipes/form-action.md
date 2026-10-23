---
recipe: form-action
title: Handle a form with a server action
summary: Validate FormData, mutate on the server, redirect or return a result, and keep no-JS submission working.
when: A page needs a mutation without a separate JSON API endpoint.
files: src/routes/notes/page.tsx
verify: ramonyx check --json && ramonyx dev
---

# Handle a form with a server action

```tsx title="src/routes/notes/page.tsx"
import type { PageActionContext } from "ramonyx";
import type { PageProps } from "@ramonyx/react";

export const actionSchema = {
  "~standard": {
    version: 1 as const,
    vendor: "app",
    validate: (input: unknown) => {
      const name = String((input as Record<string, unknown>)?.text ?? "").trim();
      return name.length > 0
        ? { value: { text: name } }
        : { issues: [{ message: "Text is required", path: ["text"] }] };
    },
  },
};

export async function action({ formData, revalidate }: PageActionContext) {
  const text = String(formData.get("text") ?? "").trim();
  await db.notes.create({ text });
  await revalidate({ tags: ["notes"] });
  return { message: "Saved" };
}

export default function Notes({ data, action }: PageProps<{ notes: { id: string; text: string }[] }>) {
  return (
    <main>
      <form method="post">
        <input name="text" aria-label="Note text" />
        <button type="submit">Save</button>
      </form>
      {action?.message ? <p role="status">{action.message}</p> : null}
      <ul>{data.notes.map((note) => <li key={note.id}>{note.text}</li>)}</ul>
    </main>
  );
}
```

- The action POSTs to the same path; successful mutation re-renders the page with `action` result.
- Return `{ redirect: "/notes" }` for PRG (`303`) or `{ errors, status }` on failure.
- `actionSchema` runs before the action and returns `400` with field issues on invalid input.
- Without JavaScript the browser submits normally; with JavaScript the client intercepts it.
- Invalidate related loader data with `context.revalidate()` or `actionRevalidate`.

## Verify

```bash
ramonyx check --json
ramonyx dev
```

Submit the form with JavaScript disabled and enabled. Read [SSR & Hydration](../ssr-hydration.md)
and [Data & Caching](../data-and-caching.md).
