// Internasionalisasi (ADR-0081) — primitif **edge-safe tanpa dependency**:
//   - negosiasi `Accept-Language` (parse + pilih locale terbaik),
//   - pembangun path ber-locale (untuk tautan/redirect/`hreflang`),
//   - penerjemah katalog: interpolasi `{nama}`, plural via `Intl.PluralRules`,
//     format angka/tanggal via `Intl.NumberFormat`/`Intl.DateTimeFormat`.
//
// Routing prefix locale (`/<locale>/...`) + `<html lang>`/`hreflang` ada di `@ramonyx/ssr`
// (`createPageRoutes({ i18n })`); helper di sini dipakai server, middleware, dan klien.

/** Opsi routing locale (dipakai `createPageRoutes({ i18n })` + helper di modul ini). */
export interface I18nRoutingOptions {
  readonly locales: readonly string[];
  readonly defaultLocale: string;
  /**
   * `true` → semua locale berprefix, termasuk default (`/id/...`); permintaan tanpa prefix
   * di-redirect. Default `false` → default locale tanpa prefix (`/...`), locale lain berprefix.
   */
  readonly prefixDefaultLocale?: boolean;
  /** Arah teks per locale (mis. `{ ar: "rtl" }`) — untuk `<html dir>`. */
  readonly directions?: Readonly<Record<string, "ltr" | "rtl">>;
}

/** Satu rentang bahasa dari `Accept-Language`. */
export interface LanguageRange {
  readonly tag: string;
  readonly quality: number;
}

/**
 * Parse `Accept-Language` → daftar terurut kualitas (RFC 9110): `en-US;q=0.8, id;q=1`
 * → `[{ id, 1 }, { en-US, 0.8 }]`. `q=0` dibuang (secara eksplisit tidak diterima).
 */
export function parseAcceptLanguage(header: string | null | undefined): LanguageRange[] {
  if (header === null || header === undefined || header.trim().length === 0) {
    return [];
  }
  const hasil: LanguageRange[] = [];
  for (const bagian of header.split(",")) {
    const [tagRaw, ...parameter] = bagian.trim().split(";");
    const tag = tagRaw?.trim() ?? "";
    if (tag.length === 0 || tag === "*") {
      continue;
    }
    let quality = 1;
    for (const param of parameter) {
      const [kunci, nilai] = param.trim().split("=");
      if (kunci === "q" && nilai !== undefined) {
        const parsed = Number.parseFloat(nilai);
        quality = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), 1) : 0;
      }
    }
    if (quality <= 0) {
      continue;
    }
    hasil.push({ tag, quality });
  }
  return hasil.sort((a, b) => b.quality - a.quality);
}

function baseLanguage(tag: string): string {
  return tag.split("-")[0]?.toLowerCase() ?? tag.toLowerCase();
}

/**
 * Pilih locale terbaik dari `Accept-Language` terhadap `locales`:
 * exact (case-insensitive) → cocok bahasa dasar (`en-US` ↔ `en`) → `defaultLocale`.
 */
export function negotiateLocale(
  header: string | null | undefined,
  options: Pick<I18nRoutingOptions, "locales" | "defaultLocale">,
): string {
  const tersedia = options.locales;
  for (const range of parseAcceptLanguage(header)) {
    const exact = tersedia.find((locale) => locale.toLowerCase() === range.tag.toLowerCase());
    if (exact !== undefined) {
      return exact;
    }
    const dasar = baseLanguage(range.tag);
    const prefix = tersedia.find((locale) => baseLanguage(locale) === dasar);
    if (prefix !== undefined) {
      return prefix;
    }
  }
  return options.defaultLocale;
}

/**
 * Bangun path untuk `locale` dari path **logis** (tanpa prefix locale):
 * `localePath("/tentang", "en", { locales: ["id","en"], defaultLocale: "id" })` → `/en/tentang`;
 * `localePath("/en/tentang", "id", …)` → `/tentang` (prefix lama dilepas — untuk language switcher).
 */
export function localePath(pathname: string, locale: string, options: I18nRoutingOptions): string {
  const bersih = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const segmen = bersih.split("/").filter((bagian) => bagian.length > 0);
  if (segmen.length > 0 && options.locales.includes(segmen[0] ?? "")) {
    segmen.shift();
  }
  const sisa = segmen.length > 0 ? `/${segmen.join("/")}` : "/";
  if (locale === options.defaultLocale && options.prefixDefaultLocale !== true) {
    return sisa;
  }
  return sisa === "/" ? `/${locale}` : `/${locale}${sisa}`;
}

/** Katalog pesan: objek bersarang (JSON-friendly); daun = string atau bentuk plural. */
export type Messages = Readonly<Record<string, unknown>>;

export interface Translator {
  readonly locale: string;
  /**
   * Terjemahkan `key` (dot-path, mis. `beranda.judul`). Nilai boleh string (interpolasi
   * `{nama}`) atau bentuk plural (`{ one, other, … }` — dipilih via `Intl.PluralRules`
   * memakai `params.count`). Key tak ditemukan → katalog fallback → `onMissing` → key itu sendiri.
   */
  t(key: string, params?: Readonly<Record<string, unknown>>): string;
  formatNumber(value: number, options?: Intl.NumberFormatOptions): string;
  formatDate(value: Date | number, options?: Intl.DateTimeFormatOptions): string;
}

export interface CreateTranslatorOptions {
  readonly locale: string;
  readonly messages: Messages;
  /** Katalog cadangan (mis. locale default) bila key tidak ada di `messages`. */
  readonly fallbackMessages?: Messages;
  /** Dipanggil sekali per key yang tidak ditemukan (dev: `console.warn`; produksi: abaikan). */
  readonly onMissing?: (key: string) => void;
}

function lookup(messages: Messages | undefined, key: string): unknown {
  if (messages === undefined) {
    return undefined;
  }
  let current: unknown = messages;
  for (const bagian of key.split(".")) {
    if (typeof current !== "object" || current === null) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[bagian];
  }
  return current;
}

function interpolate(
  template: string,
  params: Readonly<Record<string, unknown>> | undefined,
): string {
  if (params === undefined) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (match, nama: string) =>
    params[nama] !== undefined ? String(params[nama]) : match,
  );
}

function pilihBentukPlural(
  locale: string,
  nilai: Readonly<Record<string, unknown>>,
  count: number,
): string | undefined {
  let kategori: string;
  try {
    kategori = new Intl.PluralRules(locale).select(count);
  } catch {
    kategori = count === 1 ? "one" : "other";
  }
  const kandidat = [kategori, "other", "one"].map((kunci) => nilai[kunci]);
  return kandidat.find((kandidat): kandidat is string => typeof kandidat === "string");
}

/** Penerjemah katalog (murni; aman dipakai di loader, middleware, dan komponen klien). */
export function createTranslator(options: CreateTranslatorOptions): Translator {
  const { locale, messages, fallbackMessages, onMissing } = options;
  const formatAngka = new Map<string, Intl.NumberFormat>();
  const formatTanggal = new Map<string, Intl.DateTimeFormat>();

  const ambil = (key: string): unknown => {
    const lokal = lookup(messages, key);
    if (lokal !== undefined) {
      return lokal;
    }
    const cadangan = lookup(fallbackMessages, key);
    if (cadangan !== undefined) {
      return cadangan;
    }
    onMissing?.(key);
    return undefined;
  };

  return {
    locale,
    t(key, params) {
      const nilai = ambil(key);
      if (typeof nilai === "string") {
        return interpolate(nilai, params);
      }
      if (typeof nilai === "object" && nilai !== null) {
        const count = typeof params?.count === "number" ? params.count : undefined;
        if (count === undefined) {
          const bentuk =
            (nilai as Record<string, unknown>).other ?? (nilai as Record<string, unknown>).one;
          return typeof bentuk === "string" ? interpolate(bentuk, params) : key;
        }
        const bentuk = pilihBentukPlural(locale, nilai as Record<string, unknown>, count);
        return bentuk === undefined ? key : interpolate(bentuk, params);
      }
      return key;
    },
    formatNumber(value, formatOptions) {
      const kunci = JSON.stringify(formatOptions ?? null);
      let formatter = formatAngka.get(kunci);
      if (formatter === undefined) {
        formatter = new Intl.NumberFormat(locale, formatOptions);
        formatAngka.set(kunci, formatter);
      }
      return formatter.format(value);
    },
    formatDate(value, formatOptions) {
      const kunci = JSON.stringify(formatOptions ?? null);
      let formatter = formatTanggal.get(kunci);
      if (formatter === undefined) {
        formatter = new Intl.DateTimeFormat(locale, formatOptions);
        formatTanggal.set(kunci, formatter);
      }
      return formatter.format(value);
    },
  };
}
