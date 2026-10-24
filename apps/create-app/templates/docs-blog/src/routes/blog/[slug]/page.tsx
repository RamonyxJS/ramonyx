import type { PageProps } from "@ramonyx/react";
import { HttpError, type PageLoaderContext } from "ramonyx";
import { findPost, type Post, posts } from "../../../data/posts.ts";

export const metadata = {
  title: "__APP_NAME__ — post",
  description: "A prerendered Ramonyx blog post.",
};

export function getStaticPaths() {
  return posts.map((post) => ({ slug: post.slug }));
}

export function loader({ params }: PageLoaderContext<{ slug: string }>) {
  const post = findPost(params.slug);
  if (post === null) {
    throw new HttpError(404, "Post not found");
  }
  return { post };
}

export default function PostPage({ data }: PageProps<{ post: Post }>) {
  return (
    <main className="rw-main">
      <article className="rw-section" style={{ maxWidth: "72ch" }}>
        <p className="rw-label">{data.post.published}</p>
        <h1>{data.post.title}</h1>
        {data.post.body.map((paragraph) => (
          <p key={paragraph} className="rw-lede">
            {paragraph}
          </p>
        ))}
        <p>
          <a className="rw-quiet" href="/">
            ← All notes
          </a>
        </p>
      </article>
    </main>
  );
}
