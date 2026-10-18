import type { ElementDescriptor, Renderer } from "@ramonyx/ssr";
import { createElement, type ElementType, type ReactElement } from "react";
import { renderToString } from "react-dom/server";

function toReactElement(descriptor: ElementDescriptor): ReactElement {
  return createElement(
    descriptor.type as ElementType,
    descriptor.props,
    ...descriptor.children.map((child) => toReactElement(child)),
  );
}

/**
 * Adapter React untuk `Renderer` (ADR-0003).
 * SSR memakai `renderToString`; hydration + client navigation menyusul bersama bundler.
 */
export function createReactRenderer(): Renderer {
  return {
    name: "react",
    async render(element) {
      return renderToString(toReactElement(element));
    },
  };
}
