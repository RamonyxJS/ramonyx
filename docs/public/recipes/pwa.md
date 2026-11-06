---
recipe: pwa
title: Add installable PWA support
summary: Ship a web app manifest, a root-scoped service worker, and an offline fallback without adding a framework dependency.
when: The app should be installable and keep a useful shell available when the network drops.
files: public/manifest.webmanifest, public/sw.js, public/pwa.js, src/document.ts
verify: ramonyx build && ramonyx start
---

# Add installable PWA support

PWA support is an application concern: icons, cache policy, and offline UX differ per product.
Ramonyx only needs to serve the files and let the client register the worker. Keep the worker at
the site root so its scope covers the whole app.

## 1. Manifest and icons

Create `public/manifest.webmanifest`:

```json title="public/manifest.webmanifest"
{
  "name": "Acme Workspace",
  "short_name": "Acme",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "background_color": "#0f1115",
  "theme_color": "#0f1115",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

Files in `public/**` are copied to the static root by the build. Do not put the manifest under
`/assets/**`; those filenames are content-hashed.

## 2. Root-scoped service worker

`public/sw.js` is served as `/sw.js`, so its scope is `/`. This example is deliberately small:

```js title="public/sw.js"
const VERSION = "v1";
const SHELL = `/offline.html`;
const ASSET_CACHE = `assets-${VERSION}`;
const PAGE_CACHE = `pages-${VERSION}`;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(PAGE_CACHE).then((cache) => cache.add(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== ASSET_CACHE && key !== PAGE_CACHE)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/admin") || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(PAGE_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => (await caches.match(request)) ?? caches.match(SHELL)),
    );
    return;
  }

  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});
```

Add `public/offline.html` with a plain HTML fallback. The worker never caches non-GET requests,
cross-origin responses, admin pages, or API responses.

## 3. Register from the app

Register only in the browser and only after load. `public/pwa.js`:

```js title="public/pwa.js"
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.warn("Service worker registration failed", error);
    });
  });
}
```

Load it once from the document shell. A custom `src/document.ts` can add the manifest and module
script to every page:

```ts title="src/document.ts"
import { defaultDocument } from "@ramonyx/ssr";

export function document(options) {
  return defaultDocument({
    ...options,
    head: [
      '<link rel="manifest" href="/manifest.webmanifest" />',
      '<script type="module" src="/pwa.js"></script>',
      options.head ?? "",
    ]
      .filter(Boolean)
      .join("\n"),
  });
}
```

Pass it to `createPageRoutes({ document })` (or through `createApp` if your template already wires
one). Keep the registration out of `src/routes/**` so it does not run during SSR.

## Verify

```bash
ramonyx build
ramonyx start
```

In the browser, check **Application → Manifest** and **Application → Service Workers**. Install
the app, reload once online, then switch DevTools to offline and open a cached page. The offline
fallback should appear for an uncached navigation.

## Limits

- Bump `VERSION` when the worker changes; otherwise old caches stay active.
- This is a cache-first shell, not a full offline data layer. Do not cache authenticated HTML or
  JSON responses.
- Hashed `/assets/**` files are safe to cache indefinitely per build, but the worker itself must be
  refreshed and the old cache deleted.
- Safari/iOS install UX and icon requirements differ; test the real device before promising
  installability.
- Service workers require HTTPS (or `localhost`). The Ramonyx edge worker and Node production
  server already provide HTTPS at the hosting layer.
