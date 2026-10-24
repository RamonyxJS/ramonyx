import { posts } from "../data/posts.ts";

export const metadata = {
  title: "__APP_NAME__ — notes",
  description: "A static-first blog and docs starter built with Ramonyx.",
};

export default function Home() {
  return (
    <main className="rw-main">
      <section className="rw-hero">
        <div className="rw-hero-copy">
          <p className="rw-kicker">Docs / blog starter</p>
          <h1>
            Write once.
            <br />
            <span>Render as HTML.</span>
          </h1>
          <p className="rw-lede">
            Typed posts, a dynamic route, and a static export. The reading experience needs no
            client JavaScript.
          </p>
          <div className="rw-actions">
            <a className="rw-button" href="/blog/hello-ramonyx">
              Read the first post
            </a>
            <a className="rw-quiet" href="https://ramonyx.devmoon.net/docs/deployment">
              Deployment guide ↗
            </a>
          </div>
          <div className="rw-steps">
            {posts.map((post, index) => (
              <article className="rw-step" key={post.slug}>
                <span className="rw-step-index">{String(index + 1).padStart(2, "0")}</span>
                <h2>
                  <a href={`/blog/${post.slug}`}>{post.title}</a>
                </h2>
                <p>{post.summary}</p>
                <code>{post.published}</code>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
