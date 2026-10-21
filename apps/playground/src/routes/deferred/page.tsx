import type { PageProps } from "@ramonyx/react";
import { type Deferred, defer } from "ramonyx";
import { Suspense, use } from "react";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const metadata = { title: "Deferred — Ramonyx Playground" };

export async function loader() {
  return {
    title: "Deferred loader",
    slow: defer(async () => {
      await delay(250);
      return { message: "Data deferred siap", source: "loader" };
    }),
  };
}

function DeferredPanel({ value }: { value: Deferred<{ message: string; source: string }> }) {
  const data = use(value);
  return (
    <p data-deferred-content>
      {data.message} ({data.source})
    </p>
  );
}

export default function DeferredPage({
  data,
}: PageProps<{
  title: string;
  slow: Deferred<{ message: string; source: string }>;
}>) {
  return (
    <>
      <h1>{data.title}</h1>
      <p data-static>Shell langsung dirender server sebelum data tambahan siap.</p>
      <Suspense fallback={<p data-deferred-fallback>Memuat data tambahan…</p>}>
        <DeferredPanel value={data.slow} />
      </Suspense>
    </>
  );
}
