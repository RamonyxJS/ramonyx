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
    result[key] = values.length > 1 ? values : first;
  }
  return result;
}
