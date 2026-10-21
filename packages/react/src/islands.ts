import { type ComponentType, createElement, type ReactElement } from "react";

export interface IslandProps<P extends object> {
  /** ID unik global; dipakai server dan client untuk mencocokkan komponen. */
  readonly id: string;
  /** Props JSON-serializable yang dirender server dan dipakai ulang saat hydration. */
  readonly props: P;
}

/** Prefix identifier React agar `useId` island cocok antara render server terisolasi dan root client. */
export function islandPrefix(id: string): string {
  return `ramonyx-island-${id}-`;
}

type IslandRenderer = (element: ReactElement, identifierPrefix: string) => string;

const islands = new Map<string, ComponentType<object>>();
let renderIslandHtml: IslandRenderer | null = null;

/** Dipasang adapter React saat SSR; island dirender terisolasi dengan prefix stabil. */
export function setIslandRenderer(renderer: IslandRenderer | null): void {
  renderIslandHtml = renderer;
}

/** Daftarkan komponen island saat modul halaman dimuat (server dan client). */
export function defineIsland<P extends object>(id: string, component: ComponentType<P>): void {
  islands.set(id, component as ComponentType<object>);
}

export function islandComponent(id: string): ComponentType<object> | undefined {
  return islands.get(id);
}

/**
 * Batas hydration parsial. Server merender komponen di dalam marker; client hanya
 * menghidrasi elemen marker ini, bukan seluruh pohon halaman.
 *
 * Halaman yang memuat marker island otomatis memakai mode islands. Semua komponen
 * yang membutuhkan state/effect/event React di halaman tersebut harus dibungkus Island.
 */
export function Island<P extends object>({ id, props }: IslandProps<P>): ReactElement {
  const component = islandComponent(id);
  if (component === undefined) {
    throw new Error(
      `Island "${id}" belum diregistrasi. Panggil defineIsland("${id}", Component) di modul halaman.`,
    );
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(props);
  } catch {
    throw new Error(`Props Island "${id}" harus JSON-serializable.`);
  }
  if (serialized === undefined) {
    throw new Error(`Props Island "${id}" harus JSON-serializable.`);
  }
  const attributes = {
    "data-ramonyx-island": id,
    "data-props": serialized,
    style: { display: "contents" },
  };
  const content = createElement(component, props);
  if (renderIslandHtml !== null) {
    // Dirender sebagai root terisolasi agar `useId` konsisten dengan hydrateRoot per island.
    return createElement("span", {
      ...attributes,
      dangerouslySetInnerHTML: { __html: renderIslandHtml(content, islandPrefix(id)) },
    });
  }
  return createElement("span", attributes, content);
}
