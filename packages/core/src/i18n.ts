import type { Middleware } from "./types.ts";

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
        return formatMessage(nilai, locale, params ?? {});
      }
      if (typeof nilai === "object" && nilai !== null) {
        const count = typeof params?.count === "number" ? params.count : undefined;
        if (count === undefined) {
          const bentuk =
            (nilai as Record<string, unknown>).other ?? (nilai as Record<string, unknown>).one;
          return typeof bentuk === "string" ? formatMessage(bentuk, locale, params ?? {}) : key;
        }
        const bentuk = pilihBentukPlural(locale, nilai as Record<string, unknown>, count);
        return bentuk === undefined ? key : formatIcu(bentuk, locale, params ?? {}, count);
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

// ---------------------------------------------------------------------------
// ICU MessageFormat subset: interpolation, plural/selectordinal, select, date/time/number.
// Cukup untuk katalog aplikasi tanpa dependency; bukan implementasi ICU penuh (offset,
// tag/style kustom tidak didukung).

type IcuParams = Readonly<Record<string, unknown>>;

function safeNumberFormat(locale: string, options?: Intl.NumberFormatOptions): Intl.NumberFormat {
  return new Intl.NumberFormat(locale, options);
}

function findClosing(text: string, start: number): number {
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (char === "'") {
      const end = text.indexOf("'", index + 1);
      index = end === -1 ? text.length : end;
      continue;
    }
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
}

function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "'") {
      const end = text.indexOf("'", index + 1);
      index = end === -1 ? text.length : end;
      continue;
    }
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth = Math.max(0, depth - 1);
    } else if (char === separator && depth === 0) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

function parseChoices(style: string): Map<string, string> {
  const choices = new Map<string, string>();
  let index = 0;
  while (index < style.length) {
    while (index < style.length && /[\s,]/.test(style[index] ?? "")) {
      index += 1;
    }
    if (index >= style.length) {
      break;
    }
    const keyStart = index;
    while (index < style.length && !/[\s{]/.test(style[index] ?? "")) {
      index += 1;
    }
    const key = style.slice(keyStart, index);
    while (index < style.length && /\s/.test(style[index] ?? "")) {
      index += 1;
    }
    if (style[index] !== "{") {
      index += 1;
      continue;
    }
    const end = findClosing(style, index);
    if (end === -1) {
      break;
    }
    choices.set(key, style.slice(index + 1, end));
    index = end + 1;
  }
  return choices;
}

function formatIcuValue(
  content: string,
  locale: string,
  params: IcuParams,
  hash: number | undefined,
): string {
  const parts = splitTopLevel(content, ",");
  const name = (parts[0] ?? "").trim();
  const type = (parts[1] ?? "").trim();
  const style = parts.slice(2).join(",").trim();
  const value = params[name];

  if (type.length === 0) {
    return value === undefined ? `{${content}}` : String(value);
  }

  if (type === "plural" || type === "selectordinal" || type === "select") {
    const choices = parseChoices(style);
    let key: string;
    if (type === "select") {
      key = String(value);
    } else {
      const count = Number(value);
      const exact = choices.get(`=${count}`);
      if (exact !== undefined) {
        key = `=${count}`;
      } else {
        try {
          key = new Intl.PluralRules(locale, {
            type: type === "selectordinal" ? "ordinal" : "cardinal",
          }).select(count);
        } catch {
          key = count === 1 ? "one" : "other";
        }
      }
    }
    const chosen = choices.get(key) ?? choices.get("other") ?? choices.get("one");
    const nextHash = type === "select" ? hash : Number(value);
    return chosen === undefined ? "" : formatIcu(chosen, locale, params, nextHash);
  }

  if (type === "date" || type === "time") {
    const date = value instanceof Date ? value : new Date(Number(value));
    if (Number.isNaN(date.getTime())) {
      return String(value);
    }
    const dateStyle =
      style === "short" || style === "medium" || style === "long" || style === "full"
        ? style
        : "medium";
    try {
      return type === "date"
        ? new Intl.DateTimeFormat(locale, { dateStyle }).format(date)
        : new Intl.DateTimeFormat(locale, { timeStyle: dateStyle }).format(date);
    } catch {
      return String(value);
    }
  }

  if (type === "number") {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return String(value);
    }
    try {
      if (style === "percent") {
        return safeNumberFormat(locale, { style: "percent" }).format(number);
      }
      if (style === "integer") {
        return safeNumberFormat(locale, { maximumFractionDigits: 0 }).format(number);
      }
      if (style === "currency") {
        return safeNumberFormat(locale, {
          style: "currency",
          currency: typeof params.currency === "string" ? params.currency : "USD",
        }).format(number);
      }
      return safeNumberFormat(locale).format(number);
    } catch {
      return String(value);
    }
  }

  return value === undefined ? `{${content}}` : String(value);
}

function formatIcu(
  template: string,
  locale: string,
  params: IcuParams,
  hash: number | undefined,
): string {
  let result = "";
  let index = 0;
  while (index < template.length) {
    const char = template[index];
    if (char === "'") {
      if (template[index + 1] === "'") {
        result += "'";
        index += 2;
        continue;
      }
      const end = template.indexOf("'", index + 1);
      if (end === -1) {
        result += template.slice(index + 1);
        break;
      }
      result += template.slice(index + 1, end);
      index = end + 1;
      continue;
    }
    if (char === "#" && hash !== undefined) {
      result += safeNumberFormat(locale).format(hash);
      index += 1;
      continue;
    }
    if (char !== "{") {
      result += char;
      index += 1;
      continue;
    }
    const end = findClosing(template, index);
    if (end === -1) {
      result += template.slice(index);
      break;
    }
    result += formatIcuValue(template.slice(index + 1, end), locale, params, hash);
    index = end + 1;
  }
  return result;
}

/** Format pesan ICU subset (interpolation, plural/selectordinal, select, date/time/number). */
export function formatMessage(template: string, locale: string, params: IcuParams = {}): string {
  try {
    return formatIcu(template, locale, params, undefined);
  } catch {
    return template;
  }
}

export interface LocaleDetectionOptions extends I18nRoutingOptions {
  /** Nama cookie pilihan bahasa; default `locale`. */
  readonly cookieName?: string;
  /** Simpan pilihan ke cookie saat redirect; default true. */
  readonly persistCookie?: boolean;
  /** `root` (default) hanya mendeteksi di `/`; `all` juga path lain. */
  readonly strategy?: "root" | "all";
  /** Path yang tidak boleh di-redirect; default `/api`, `/assets`, `/_`, `/__ramonyx`. */
  readonly skip?: (pathname: string) => boolean;
  /** Status redirect; default 302. */
  readonly redirectStatus?: 302 | 307 | 308;
}

function readCookie(header: string | null, name: string): string | undefined {
  if (header === null) {
    return undefined;
  }
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) {
      try {
        return decodeURIComponent(value.join("="));
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

function serializeLocaleCookie(name: string, locale: string): string {
  return `${name}=${encodeURIComponent(locale)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

/**
 * Middleware deteksi bahasa: cookie → Accept-Language → default, lalu redirect ke path ber-locale.
 * Default hanya di `/` agar cache/SEO tidak kaget; `strategy: "all"` memperluas ke path lain.
 * Path API/aset/development dilewati; locale yang sudah berprefix tidak di-redirect.
 */
export function localeDetection(options: LocaleDetectionOptions): Middleware {
  const cookieName = options.cookieName ?? "locale";
  const strategy = options.strategy ?? "root";
  const status = options.redirectStatus ?? 302;
  const skip =
    options.skip ??
    ((pathname: string): boolean =>
      pathname.startsWith("/api/") ||
      pathname.startsWith("/assets/") ||
      pathname.startsWith("/_") ||
      pathname.startsWith("/__ramonyx"));

  return (context, next) => {
    let url: URL;
    try {
      url = new URL(context.request.url);
    } catch {
      return next();
    }
    const pathname = url.pathname;
    if (skip(pathname)) {
      return next();
    }
    const first = pathname.split("/").filter((segment) => segment.length > 0)[0];
    if (first !== undefined && options.locales.includes(first)) {
      return next();
    }
    if (strategy === "root" && pathname !== "/") {
      return next();
    }

    const saved = readCookie(context.request.headers.get("cookie"), cookieName);
    const locale =
      saved !== undefined && options.locales.includes(saved)
        ? saved
        : negotiateLocale(context.request.headers.get("accept-language"), options);
    const target = localePath(pathname, locale, options);
    if (target === pathname) {
      return next();
    }
    const headers: Record<string, string> = { location: `${target}${url.search}` };
    if (options.persistCookie !== false) {
      headers["set-cookie"] = serializeLocaleCookie(cookieName, locale);
    }
    return new Response(null, { status, headers });
  };
}
