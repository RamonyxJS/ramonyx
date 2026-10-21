import type { ElementDescriptor, Renderer } from "@ramonyx/ssr";
import { createElement, type ElementType, type ReactElement } from "react";
// Build **edge** untuk keduanya (renderToString + renderToReadableStream): Web Streams,
// berjalan di Node maupun runtime edge/serverless (ADR-0047/0058). Build `server` (Node)
// tidak dipakai agar bundel edge tidak menarik `node:stream`; build `browser` tidak dipakai
// karena MessageChannel level-modul menahan event loop Node (proses test/CLI menggantung).
import { renderToReadableStream, renderToString } from "react-dom/server.edge";
import { setIslandRenderer } from "./islands.ts";

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
  // Island dirender sebagai root terisolasi dengan prefix stabil; hydrateRoot per island
  // memakai prefix yang sama agar `useId` tidak mismatch.
  setIslandRenderer((element, identifierPrefix) => renderToString(element, { identifierPrefix }));
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
