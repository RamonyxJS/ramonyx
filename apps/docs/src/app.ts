import { createReactRenderer } from "@ramonyx/react";
import { cspNonce, securityHeaders } from "@ramonyx/security";
import { createHandler } from "@ramonyx/server";
import { createPageRoutes } from "@ramonyx/ssr";
import { HttpError, route } from "ramonyx";

import { listDocs, readDoc } from "./docs.ts";
import { renderMarkdown } from "./markdown.ts";
import { DokumenPage, document as documentRenderer, ErrorPage, IndexPage } from "./pages.tsx";

/** Aplikasi docs: halaman SSR dari `docs/**` + API katalog. */
export function createApp() {
  const pages = [
    {
      path: "/",
      page: {
        default: IndexPage,
        loader: () => ({
          entries: listDocs().map(({ slug, title }) => ({ slug, title })),
        }),
        metadata: { title: "Dokumentasi" },
      },
      layouts: [],
      directory: "apps/docs/src/routes",
    },
    {
      path: "/dokumen/[...slug]",
      page: {
        default: DokumenPage,
        loader: ({ params }: { params: Record<string, string> }) => {
          const slug = params.slug ?? "";
          const doc = readDoc(slug);
          if (doc === null) {
            throw new HttpError(404, `Dokumen tidak ditemukan: ${slug}`);
          }
          return { slug, title: doc.entry.title, html: renderMarkdown(doc.markdown) };
        },
        metadata: { title: "Dokumen" },
      },
      layouts: [],
      directory: "apps/docs/src/routes/dokumen",
      error: { default: ErrorPage },
    },
  ];

  return createHandler({
    strictValidation: true,
    routes: [
      ...createPageRoutes({ pages, renderer: createReactRenderer(), document: documentRenderer }),
      {
        method: "GET",
        path: "/api/dokumen",
        definition: route({
          handler: ({ json }) => json({ dokumen: listDocs() }),
        }),
      },
    ],
    middleware: [securityHeaders(), cspNonce()],
  });
}
