import type { StandardIssue, StandardSchema } from "./types.ts";

export interface ValidationIssue {
  readonly path: readonly PropertyKey[];
  readonly message: string;
}

export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };

/** Tipe input yang diharapkan schema. */
export type InferInput<S> = S extends StandardSchema<infer Input, unknown> ? Input : never;

/** Tipe output yang dihasilkan schema. */
export type InferOutput<S> = S extends StandardSchema<unknown, infer Output> ? Output : never;

function normalizePath(issue: StandardIssue): readonly PropertyKey[] {
  const path = issue.path ?? [];
  return path.map((segment) =>
    typeof segment === "object" && segment !== null && "key" in segment ? segment.key : segment,
  );
}

function normalizeIssues(issues: readonly StandardIssue[]): readonly ValidationIssue[] {
  return issues.map((issue) => ({ path: normalizePath(issue), message: issue.message }));
}

/**
 * Menjalankan validasi Standard Schema dan menormalkan hasilnya.
 * Schema boleh memvalidasi secara sinkron maupun asinkron.
 */
export async function validate<T>(
  schema: StandardSchema<unknown, T>,
  value: unknown,
): Promise<ValidationResult<T>> {
  const result = await schema["~standard"].validate(value);
  if ("issues" in result) {
    return { ok: false, issues: normalizeIssues(result.issues) };
  }
  return { ok: true, value: result.value };
}
