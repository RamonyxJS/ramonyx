import type { ReactNode } from "react";

export interface PageProps<
  Data = unknown,
  Params extends Record<string, string> = Record<string, string>,
> {
  readonly data: Data;
  readonly params: Params;
}

export interface LayoutProps {
  readonly children?: ReactNode;
}

export interface ErrorPageProps {
  readonly error: { readonly status: number; readonly message: string };
}
