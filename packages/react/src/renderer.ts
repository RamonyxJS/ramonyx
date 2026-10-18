import type { ElementDescriptor, Renderer } from "@ramonyx/ssr";
import { createElement, type ElementType, type ReactElement } from "react";
import { renderToString } from "react-dom/server";
// Build edge: `renderToReadableStream` (Web Streams) berjalan di Node maupun runtime Rust
// dengan jalur yang sama (ADR-0030/0047). Build `browser` **tidak** dipakai karena membuat
// MessageChannel level-modul yang menahan event loop Node (proses test/CLI tidak pernah keluar).
import { renderToReadableStream } from "react-dom/server.edge";

function toReactElement(descriptor: ElementDescriptor): ReactElement {
  return createElement(
    descriptor.type as ElementType,
    descriptor.props,
    ...descriptor.children.map((child) => toReactElement(child)),
  );
}

/**
 * Adapter React untuk `Renderer` (ADR-0003).
 * `render` sinkron (`renderToString`) untuk jalur default/halaman error; `renderStream`
 * (opsional) untuk SSR streaming — diaktifkan lewat opsi `streaming` di `createPageRoutes`.
 */
export function createReactRenderer(): Renderer {
  return {
    name: "react",
    async render(element) {
      return renderToString(toReactElement(element));
    },
    async renderStream(element) {
      return renderToReadableStream(toReactElement(element));
    },
  };
}
