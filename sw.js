const CACHE_PREFIX = 'project-tree-next-';
const RUNTIME_CACHE = `${CACHE_PREFIX}runtime-v1`;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith(CACHE_PREFIX) && key !== RUNTIME_CACHE)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if(event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request, { cache:'no-store' })
      .then(response => {
        if(response.ok && new URL(event.request.url).origin === self.location.origin){
          const copy=response.clone();
          event.waitUntil(caches.open(RUNTIME_CACHE).then(cache => cache.put(event.request,copy)));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
