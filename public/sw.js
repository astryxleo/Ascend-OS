/* Ascend OS offline-first app shell.
   The interface and already-downloaded assets work offline; Supabase-backed
   sign-in, sync, marketplace purchases and other server actions need internet. */
const CACHE_PREFIX = 'ascend-os-';
const CACHE_VERSION = 'v4';
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;
const APP_SHELL = '/';
const MANIFEST = '/manifest.webmanifest';

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Cache the main page first so a first successful visit can reopen offline.
    const response = await fetch(APP_SHELL, { cache: 'reload' });
    if (!response.ok) throw new Error('Could not cache Ascend OS app shell');
    await cache.put(APP_SHELL, response.clone());

    // Pre-cache every same-origin asset referenced by the built Vite HTML.
    const html = await response.text();
    const assets = new Set([MANIFEST]);
    const attributePattern = /(?:src|href)\s*=\s*["']([^"']+)["']/gi;
    for (const match of html.matchAll(attributePattern)) {
      try {
        const url = new URL(match[1], self.location.origin);
        if (url.origin !== self.location.origin) continue;
        if (
          url.pathname.startsWith('/assets/') ||
          url.pathname === MANIFEST ||
          /\.(?:js|mjs|css|woff2?|svg|png|webp|jpe?g|ico|avif)$/i.test(url.pathname)
        ) assets.add(url.pathname + url.search);
      } catch {}
    }

    await Promise.all([...assets].map(async path => {
      try {
        const asset = await fetch(path, { cache: 'reload' });
        if (asset.ok) await cache.put(path, asset);
      } catch {
        // Optional asset failure must not prevent the app shell from installing.
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Always serve the cached app shell when navigation cannot reach the network,
  // including deep links such as /inventory or /squads.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(APP_SHELL, response.clone());
        }
        return response;
      } catch {
        return (await caches.match(request)) ||
          (await caches.match(APP_SHELL)) ||
          new Response('Ascend OS is not cached yet. Connect to the internet once, then reopen the app.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
      }
    })());
    return;
  }

  // Hashed build assets are cache-first for instant offline reloads.
  if (url.pathname.startsWith('/assets/') ||
      /\.(?:js|mjs|css|woff2?|svg|png|webp|jpe?g|ico|avif)$/i.test(url.pathname) ||
      url.pathname === MANIFEST) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) {
        fetch(request).then(async response => {
          if (response.ok) (await caches.open(CACHE_NAME)).put(request, response);
        }).catch(() => {});
        return cached;
      }
      try {
        const response = await fetch(request);
        if (response.ok) (await caches.open(CACHE_NAME)).put(request, response.clone()).catch(() => {});
        return response;
      } catch {
        return Response.error();
      }
    })());
    return;
  }

  // Other same-origin GET requests use network-first and update the offline cache.
  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok) (await caches.open(CACHE_NAME)).put(request, response.clone()).catch(() => {});
      return response;
    } catch {
      return (await caches.match(request)) || Response.error();
    }
  })());
});
