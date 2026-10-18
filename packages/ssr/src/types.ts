/** Descriptor UI-agnostic: ssr membangun pohon ini, adapter (mis. React) merendernya. */
export interface ElementDescriptor {
  readonly type: unknown;
  readonly props: Record<string, unknown>;
  readonly children: readonly ElementDescriptor[];
}

export interface Renderer {
  readonly name: string;
  render(element: ElementDescriptor): Promise<string>;
}

export interface DocumentOptions {
  readonly title: string;
  readonly body: string;
  readonly head?: string;
  /** HTML mentah yang ditempatkan sebelum `</body>` (mis. script hydration). */
  readonly scripts?: string;
  readonly status: number;
}

export type DocumentRenderer = (options: DocumentOptions) => string;
