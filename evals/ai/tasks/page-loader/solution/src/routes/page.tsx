import type { PageLoaderContext } from "ramonyx";

export async function loader({ request }: PageLoaderContext) {
  return { title: "Hello", path: new URL(request.url).pathname };
}

export default function Page() {
  return null;
}
