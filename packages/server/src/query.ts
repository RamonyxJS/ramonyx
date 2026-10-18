export type QueryValue = string | string[];
export type QueryRecord = Record<string, QueryValue>;

/** URLSearchParams → objek; key berulang menjadi array. */
export function parseQuery(searchParams: URLSearchParams): QueryRecord {
  const result: QueryRecord = {};
  for (const key of new Set(searchParams.keys())) {
    const values = searchParams.getAll(key);
    const first = values[0];
    if (first === undefined) {
      continue;
    }
    // defineProperty: key "__proto__" menjadi milik sendiri, tidak menyentuh prototype objek.
    Object.defineProperty(result, key, {
      value: values.length > 1 ? values : first,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return result;
}
