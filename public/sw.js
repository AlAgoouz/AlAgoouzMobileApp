const CACHE_NAME = 'agouz-offline-v1';
const OFFLINE_PAGE = '/offline.html';

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache =>
    cache.add(new Request(OFFLINE_PAGE, {cache: 'reload'}))
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
  if (request.method !== 'GET' || request.mode !== 'navigate' ||
      url.origin !== self.location.origin ||
      !['/', '/menu', '/menu/'].includes(url.pathname)) return;

  event.respondWith(fetch(request).catch(async () => {
    const cache = await caches.open(CACHE_NAME);
    return await cache.match(OFFLINE_PAGE) ?? Response.error();
  }));
});
