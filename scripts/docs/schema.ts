// Validator JSON Schema mini (subset sempit, tanpa dependency) untuk berkas machine — ADR-0054.
//
// Subset yang didukung: type (termasuk union), required, properties, additionalProperties
// (hanya `false`), items, enum, const, pattern, minLength, minimum, maximum, minItems,
// uniqueItems. Keyword di luar subset = error validasi (fail keras, bukan diam-diam dilewati).
//
// Fungsi murni; unit test di `tests/docs/schema.test.ts`.

export interface ValidationIssue {
  readonly path: string;
  readonly message: string;
}

type Schema = Record<string, unknown>;

const SUPPORTED_KEYWORDS = new Set([
  "$schema",
  "title",
  "description",
  "type",
  "required",
  "properties",
  "additionalProperties",
  "items",
  "enum",
  "const",
  "pattern",
  "minLength",
  "minimum",
  "maximum",
  "minItems",
  "uniqueItems",
]);

function typeOf(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? "integer" : "number";
  }
  return typeof value;
}

function matchesType(value: unknown, expected: string): boolean {
  const actual = typeOf(value);
  if (expected === "number") {
    return actual === "number" || actual === "integer";
  }
  return actual === expected;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stable(value: unknown): string {
  return JSON.stringify(value);
}

/** Validasi `value` terhadap `schema`; daftar isu kosong = valid. */
export function validateAgainstSchema(
  value: unknown,
  schema: Schema,
  path = "$",
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const keyword of Object.keys(schema)) {
    if (!SUPPORTED_KEYWORDS.has(keyword)) {
      issues.push({ path, message: `keyword skema tak didukung: ${keyword}` });
    }
  }
  if (issues.length > 0) {
    return issues;
  }

  const expectedType = schema.type;
  if (expectedType !== undefined) {
    const types = Array.isArray(expectedType)
      ? (expectedType as string[])
      : [expectedType as string];
    if (!types.some((candidate) => matchesType(value, candidate))) {
      issues.push({
        path,
        message: `tipe harus ${types.join("|")}, menerima ${typeOf(value)}`,
      });
      return issues;
    }
  }

  if ("const" in schema && stable(value) !== stable(schema.const)) {
    issues.push({ path, message: `harus sama dengan ${stable(schema.const)}` });
  }

  if (Array.isArray(schema.enum)) {
    const allowed = schema.enum as unknown[];
    if (!allowed.some((candidate) => stable(candidate) === stable(value))) {
      issues.push({ path, message: `harus salah satu dari ${allowed.map(stable).join(", ")}` });
    }
  }

  if (typeof value === "string") {
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value)) {
      issues.push({ path, message: `tidak cocok pola ${schema.pattern}` });
    }
    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      issues.push({ path, message: `panjang minimal ${schema.minLength}` });
    }
  }

  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      issues.push({ path, message: `harus ≥ ${schema.minimum}` });
    }
    if (typeof schema.maximum === "number" && value > schema.maximum) {
      issues.push({ path, message: `harus ≤ ${schema.maximum}` });
    }
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      issues.push({ path, message: `minimal ${schema.minItems} item` });
    }
    if (schema.uniqueItems === true) {
      const seen = new Set<string>();
      for (const [index, item] of value.entries()) {
        const key = stable(item);
        if (seen.has(key)) {
          issues.push({ path: `${path}[${index}]`, message: "duplikat item (uniqueItems)" });
        }
        seen.add(key);
      }
    }
    const items = schema.items;
    if (isPlainObject(items)) {
      for (const [index, item] of value.entries()) {
        issues.push(...validateAgainstSchema(item, items, `${path}[${index}]`));
      }
    }
  }

  if (isPlainObject(value)) {
    const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
    for (const key of required) {
      if (!(key in value)) {
        issues.push({ path, message: `properti wajib hilang: ${key}` });
      }
    }

    const properties = isPlainObject(schema.properties)
      ? (schema.properties as Record<string, Schema>)
      : {};
    for (const [key, child] of Object.entries(value)) {
      const childSchema = properties[key];
      if (childSchema !== undefined) {
        issues.push(...validateAgainstSchema(child, childSchema, `${path}.${key}`));
        continue;
      }
      if (schema.additionalProperties === false) {
        issues.push({ path: `${path}.${key}`, message: "properti tak dikenal" });
      }
    }
  }

  return issues;
}
