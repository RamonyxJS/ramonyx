# __APP_NAME__ — Cloudflare R2 + KV starter

Deploy the same Ramonyx route tree as a Cloudflare Worker with real R2/KV bindings.

- `GET /api/storage?key=demo` — read KV + R2
- `POST /api/storage` — `{ "key": "demo", "value": "hello" }`
- `GET /` — HTML overview

## Configure

Edit `wrangler.toml` and replace the placeholder KV namespace ID. Create the resources first:

```bash
npx wrangler kv namespace create KV_STORE
npx wrangler r2 bucket create __APP_NAME__-files
npx wrangler secret put STORAGE_TOKEN   # random token, 16+ chars
```

Then:

```bash
npm install
npm run dev              # Node: binding routes return 503
npm run build:edge       # dist/edge/index.js
npm run deploy           # build + wrangler deploy

curl -H "Authorization: Bearer $STORAGE_TOKEN" \
  https://your-worker.example/api/storage?key=demo
```

`npm` is shown for brevity. `pnpm install && pnpm dev`, `yarn && yarn dev`, and
`bun install && bun run dev` work too; use the same manager for scripts.

R2/KV are Cloudflare bindings, not Node packages. Use `wrangler dev`/Miniflare or the deployed
Worker to exercise them; plain `ramonyx dev` has no bindings. The storage API requires
`Authorization: Bearer <STORAGE_TOKEN>`; without the secret it returns 503. For local integration
tests, the repo uses the edge smoke with Miniflare.

## Notes

- Keep the R2 bucket private unless you add a public custom domain.
- Use random object keys; do not trust a client-provided filename.
- The recipe `docs/recipes/cloudflare-r2-kv` covers upload/download streaming and limits.
