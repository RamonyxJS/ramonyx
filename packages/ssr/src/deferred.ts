import { DEFERRED_SCRIPT_ID, type Deferred, type DeferredState, isDeferred } from "@ramonyx/core";
import { escapeHtml } from "./document.ts";

/**
 * Kumpulkan nilai deferred dari data loader dan beri key stabil per dokumen.
 * Traversal hanya menyentuh array/objek plain agar tidak mengubah Date/Map/Promise lain.
 */
export function prepareDeferredData(data: unknown): Deferred<unknown>[] {
  const items: Deferred<unknown>[] = [];
  const seen = new WeakSet<object>();

  const visit = (value: unknown): void => {
    if (value === null || typeof value !== "object" || seen.has(value)) {
      return;
    }
    seen.add(value);
    if (isDeferred(value)) {
      if (value.key === null) {
        value.key = `d${items.length}`;
      }
      items.push(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const child of value) {
        visit(child);
      }
      return;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return;
    }
    for (const child of Object.values(value)) {
      visit(child);
    }
  };

  visit(data);
  return items;
}

/** Tunggu nilai deferred yang benar-benar dirender React, lalu buat state untuk client. */
export async function settleDeferreds(items: readonly Deferred<unknown>[]): Promise<DeferredState> {
  const state: DeferredState = {};
  await Promise.all(
    items.map(async (item) => {
      if (!item.consumed || item.key === null) {
        return;
      }
      const key = item.key;
      try {
        const value = await item.promise;
        // Validasi serialisasi di server; nilai yang tidak JSON-safe menjadi error boundary.
        if (JSON.stringify(value) === undefined) {
          throw new Error("nilai deferred tidak JSON-serializable");
        }
        state[key] = { status: "fulfilled", value };
      } catch {
        state[key] = { status: "rejected", reason: "Deferred data failed" };
      }
    }),
  );
  return state;
}

/**
 * Script state deferred: JSON di script terpisah + applier ber-nonce. Script JSON juga
 * dibaca soft navigation; tanpa JS tidak ada yang dieksekusi.
 */
export function deferredStateScript(
  state: DeferredState,
  nonce: string | undefined,
  path: string,
): string {
  if (Object.keys(state).length === 0) {
    return "";
  }
  const json = JSON.stringify(state).replaceAll("<", "\\u003c");
  const nonceAttribute = nonce === undefined ? "" : ` nonce="${escapeHtml(nonce)}"`;
  return [
    `<script id="${DEFERRED_SCRIPT_ID}" type="application/json" data-path="${escapeHtml(path)}">${json}</script>`,
    `<script${nonceAttribute}>(()=>{const el=document.getElementById("${DEFERRED_SCRIPT_ID}");if(window.__RAMONYX__&&window.__RAMONYX__.path!==el.dataset.path)return;window.__RAMONYX_DEFERRED__=JSON.parse(el.textContent);window.__ramonyxResolveDeferred?.(window.__RAMONYX_DEFERRED__);})()</script>`,
  ].join("\n");
}

/** Sisipkan script setelah container mount (sebelum script penutup dokumen). */
export function insertAfterMount(suffix: string, fragment: string): string {
  if (fragment.length === 0) {
    return suffix;
  }
  const close = suffix.indexOf("</div>");
  return close === -1
    ? `${fragment}${suffix}`
    : `${suffix.slice(0, close + "</div>".length)}${fragment}${suffix.slice(close + "</div>".length)}`;
}
