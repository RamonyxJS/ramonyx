export const metadata = {
  title: "__APP_NAME__ — Cloudflare storage",
  description: "Ramonyx on Cloudflare Workers with R2 object storage and KV metadata.",
};

export default function Home() {
  return (
    <main className="rw-main">
      <section className="rw-hero">
        <div className="rw-hero-copy">
          <p className="rw-kicker">Cloudflare-native</p>
          <h1>
            Files in R2.
            <br />
            <span>Metadata in KV.</span>
          </h1>
          <p className="rw-lede">
            This template ships a Worker artifact and real binding routes. The API reads and writes
            both stores; the browser page is only a map of the surface.
          </p>
          <div className="rw-actions">
            <a className="rw-button" href="/api/storage?key=demo">
              Try the storage API
            </a>
            <a
              className="rw-quiet"
              href="https://ramonyx.devmoon.net/docs/recipes/cloudflare-r2-kv"
            >
              Read the R2 + KV recipe ↗
            </a>
          </div>
          <pre className="rw-tree">{`GET  /api/storage?key=demo
POST /api/storage
  { "key": "demo", "value": "hello" }

pnpm build:edge
pnpm deploy`}</pre>
        </div>
        <aside className="rw-status">
          <p className="rw-label">BINDINGS</p>
          <p className="rw-url">KV_STORE</p>
          <p className="rw-status-sub">R2_BUCKET</p>
          <p className="rw-status-sub">Configure in wrangler.toml</p>
        </aside>
      </section>
    </main>
  );
}
