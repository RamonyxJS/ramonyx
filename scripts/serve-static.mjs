#!/usr/bin/env node
// Server statis kecil untuk e2e situs publik: `/path` → `path/index.html`, 404 → `404.html`.
// Jalankan: node scripts/serve-static.mjs <dir> [port]
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { gzipSync } from "node:zlib";

const dir = resolve(process.argv[2] ?? ".");
const port = Number(process.argv[3] ?? 4173);

const TIPE = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".xml": "application/xml; charset=utf-8",
};

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  let pathname = url.pathname;
  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    res.writeHead(400).end("bad request");
    return;
  }

  let file = join(dir, normalize(pathname));
  if (!file.startsWith(dir)) {
    res.writeHead(403).end("forbidden");
    return;
  }

  try {
    const info = await stat(file);
    if (info.isDirectory()) {
      file = join(file, "index.html");
    }
  } catch {
    // biarkan; readFile di bawah akan 404
  }

  try {
    const data = await readFile(file);
    const ext = extname(file);
    const compressible = new Set([".html", ".js", ".css", ".json", ".txt", ".md", ".svg", ".xml"]);
    const acceptsGzip = (req.headers["accept-encoding"] ?? "").includes("gzip");
    const body = acceptsGzip && compressible.has(ext) ? gzipSync(data) : data;
    const headers = {
      "content-type": TIPE[ext] ?? "application/octet-stream",
      "cache-control": "no-cache",
      ...(body !== data ? { "content-encoding": "gzip", vary: "Accept-Encoding" } : {}),
    };
    res.writeHead(200, headers);
    res.end(body);
  } catch {
    try {
      const data = await readFile(join(dir, "404.html"));
      res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
      res.end(data);
    } catch {
      res.writeHead(404).end("not found");
    }
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`serve ${dir} → http://127.0.0.1:${port}`);
});
