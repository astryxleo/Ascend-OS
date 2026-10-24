/* Ascend OS offline app shell. Supabase-backed actions still require a connection. */
const CACHE_PREFIX = 'ascend-os-';
const CACHE_VERSION = 'v2';
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;
const SHELL_URLS = ['/', '/manifest.webmanifest'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Cache the app entry point and manifest first; then cache its built JS/CSS assets.
    const shellResponse = await fetch('/', { cache: 'reload' });
    if (!shellResponse.ok) throw new Error('Unable to cache the Ascend OS app shell');
    await cache.put('/', shellResponse.clone());
    const html = await shellResponse.clone().text();
    const assetUrls = new Set(SHELL_URLS.slice(1));
    for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
      try {
        const url = new URL(match[1], self.location.origin);
        if (url.origin === self.location.origin && (url.pathname.startsWith('/assets/') || url.pathname === '/manifest.webmanifest' || /\\.(?:js|css|woff2?|svg|png|webp|ico)$/i.test(url.pathname))) {
          assetUrls.add(url.pathname + url.search);
        }
      } catch {}
    }
    await Promise.all([...assetUrls].map(async url => {
      try {
        const response = await fetch(url, { cache: 'reload' });
        if (response.ok) await cache.put(url, response);
      } catch {}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Navigations use the latest server page when online, with the cached app shell as fallback.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put('/', response.clone());
        }
        return response;
      } catch {
        return (await caches.match(request)) || (await caches.match('/'));
      }
    })());
    return;
  }

  // Prefer fresh content while connected; fall back to the cached app assets offline.
  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    } catch {
      return await caches.match(request) || Response.error();
    }
  })());
});
