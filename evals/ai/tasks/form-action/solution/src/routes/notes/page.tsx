export const actionSchema = {
  "~standard": {
    version: 1 as const,
    vendor: "eval",
    validate: (input: unknown) => {
      const text = String((input as Record<string, unknown>)?.text ?? "").trim();
      return text.length > 0
        ? { value: { text } }
        : { issues: [{ message: "Text is required", path: ["text"] }] };
    },
  },
};

export async function action({ formData }: { formData: FormData }) {
  const text = String(formData.get("text") ?? "").trim();
  return { message: `Saved ${text}` };
}

export default function Notes() {
  return null;
}
