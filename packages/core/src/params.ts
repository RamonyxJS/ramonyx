// Helper pola rute (dipakai prerender/SSG dan SEO sitemap — ADR-0056/0059).

const DYNAMIC_SEGMENT = /\[(\.\.\.)?([^\]]+)\]/;

/** `true` bila pola rute memuat segmen dinamis (`[slug]`, `[...slug]`). */
export function hasDynamicSegment(path: string): boolean {
  return DYNAMIC_SEGMENT.test(path);
}

/**
 * Isi pola rute (`[slug]`, `[...slug]`) dengan peta param; `null` bila ada param kurang.
 * `[...slug]` menerima nilai dengan `/` (catch-all multi-segmen).
 */
export function fillRouteParams(pattern: string, params: Record<string, string>): string | null {
  let missing = false;
  const filled = pattern.replace(
    /\[(\.\.\.)?([^\]]+)\]/g,
    (_match, _rest: string | undefined, name: string) => {
      const value = params[name];
      if (value === undefined) {
        missing = true;
        return "";
      }
      return value;
    },
  );
  if (missing) {
    return null;
  }
  return filled.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
}
