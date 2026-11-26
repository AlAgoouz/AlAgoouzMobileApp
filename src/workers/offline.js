const CACHE_NAME = 'agouz-offline-__RELEASE__';
const OFFLINE_PAGE = '/offline.html';
const assets = new Set(/* @offline-assets */ []);
const preparedScreens = /* @offline-screens */ [];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache =>
    cache.addAll([OFFLINE_PAGE, ...preparedScreens].map(url => new Request(url, {cache:'force-cache'})))
  ));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(async names => {
    await Promise.all(names
      .filter(name => name.startsWith('agouz-offline-') && name !== CACHE_NAME)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  }));
});

self.addEventListener('fetch', event => {
  const {request} = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (!url.search && assets.has(url.pathname)) {
    event.respondWith(caches.open(CACHE_NAME).then(async cache => {
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) {
        try { await cache.put(request,response.clone()); } catch { /* Serve the online asset if storage fails. */ }
      }
      return response;
    }));
    return;
  }
  if (request.mode !== 'navigate' || !['/', '/menu', '/menu/'].includes(url.pathname)) return;

  event.respondWith(fetch(request).catch(async () => {
    const cache = await caches.open(CACHE_NAME);
    return await cache.match(OFFLINE_PAGE) ?? Response.error();
  }));
});
