# Add a page with a loader

Use `loader` for request-time data on a page.

```tsx title="src/routes/page.tsx"
export async function loader() {
  return { title: "Hello" };
}
```

Run `ramonyx check --json` and `ramonyx routes --json` to verify.
