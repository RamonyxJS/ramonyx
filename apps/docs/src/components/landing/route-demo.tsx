// Demo file routing: pilih file nyata dari repo, lihat route match + request trace.
import { useState } from "react";

interface RouteCase {
  readonly file: string;
  readonly path: string;
  readonly match: string;
  readonly method: string;
  readonly code: string;
}

const CASES: readonly RouteCase[] = [
  {
    file: "src/routes/page.tsx",
    path: "/",
    match: "exact · page",
    method: "GET",
    code: `export async function loader() {
  return { message: "Hello from the server" };
}

export default function Home({ data }) {
  return <h1>{data.message}</h1>;
}`,
  },
  {
    file: "src/routes/docs/[...slug]/page.tsx",
    path: "/docs/:slug*",
    match: "rest param · page",
    method: "GET",
    code: `export async function loader({ params }) {
  const doc = getCatalogDoc(params.slug);
  if (!doc) throw new HttpError(404);
  return { html: doc.html };
}

export default function Doc({ data }) {
  return <article dangerouslySetInnerHTML={...} />;
}`,
  },
  {
    file: "src/routes/api/cari.ts",
    path: "/api/cari",
    match: "API · GET",
    method: "GET",
    code: `export const GET = route({
  handler: ({ query, json }) =>
    json(searchCatalog(query.q ?? "", 20)),
});`,
  },
  {
    file: "src/routes/api/indeks.ts",
    path: "/api/indeks",
    match: "API · GET",
    method: "GET",
    code: `export const GET = route({
  handler: ({ json }) => json(searchIndex()),
});`,
  },
];

export function RouteDemo() {
  const [selected, setSelected] = useState(0);
  const active = CASES[selected] ?? CASES[0];
  if (active === undefined) {
    return null;
  }

  return (
    <div className="route-demo">
      <div className="route-tree">
        <div className="route-tree-head">
          <span>src/routes</span>
          <span>filesystem</span>
        </div>
        {CASES.map((item, index) => (
          <button
            key={item.file}
            type="button"
            className={selected === index ? "is-active" : ""}
            aria-pressed={selected === index}
            onClick={() => setSelected(index)}
          >
            <span className="route-file">{item.file}</span>
            <span className="route-pattern">{item.path}</span>
          </button>
        ))}
      </div>
      <div className="route-stage">
        <div className="route-request">
          <span className="route-method">{active.method}</span>
          <code>{active.path.replace(":slug*", "routing")}</code>
          <span className="route-status">200</span>
          <span className="route-match">{active.match}</span>
        </div>
        <div className="route-code">
          <div className="route-code-head">
            <span>{active.file}</span>
            <span>tsx</span>
          </div>
          {/* biome-ignore lint/a11y/noNoninteractiveTabindex: <pre> dapat di-scroll → wajib fokus keyboard */}
          <pre tabIndex={0}>
            <code>{active.code}</code>
          </pre>
        </div>
        <div className="route-flow">
          {["match", "middleware", "loader", "render"].map((step, index) => (
            <span key={step} className={index <= 2 ? "is-on" : ""}>
              <i />
              {step}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
