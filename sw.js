// One service worker for both editors: keeps them working offline and sends files
// shared from the gallery to the right one (photos to /fotos/, anything with video or audio to /video/).
const VERSION = 'estudio-v5';
const RUNTIME = 'estudio-runtime';
const SHARED_PHOTOS = 'revelador-shared';
const SHELL = [
  './', './index.html', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png',
  './fotos/', './fotos/index.html', './fotos/vendor/jszip.min.js',
  './video/', './video/index.html', './video/css/app.css',
  './video/js/app.js', './video/js/state.js', './video/js/panels.js', './video/js/render.js', './video/js/fx.js',
  './video/js/catalog.js', './video/js/store.js', './video/js/seg.js', './video/js/captions-worker.js',
  './video/icons/icon-192.png', './video/icons/mark.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const key of await caches.keys()) if (![VERSION, RUNTIME, SHARED_PHOTOS].includes(key)) await caches.delete(key);
    await self.clients.claim();
  })());
});

const IMG_EXT = /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i;
const isPhoto = f => (f.type || '').startsWith('image/') || (!f.type && IMG_EXT.test(f.name || ''));

async function sharePhotos(files) {
  const cache = await caches.open(SHARED_PHOTOS);
  for (const old of await cache.keys()) await cache.delete(old);
  const stamp = Date.now();
  await Promise.all(files.map((f, i) => cache.put(`./shared/${stamp}-${i}`, new Response(f, {
    headers: { 'content-type': f.type || 'image/jpeg', 'x-name': encodeURIComponent(f.name || `foto-${i + 1}.jpg`) },
  }))));
}

// Same database and store the video editor (js/store.js) reads on ?shared=1.
function shareToVideo(files) {
  return new Promise((res, rej) => {
    const r = indexedDB.open('rolo-db', 1);
    r.onupgradeneeded = () => { const db = r.result; for (const s of ['projects', 'media', 'inbox']) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' }); };
    r.onsuccess = () => {
      const t = r.result.transaction('inbox', 'readwrite');
      files.forEach((f, i) => t.objectStore('inbox').put({ id: Date.now() + '-' + i, name: f.name, blob: f }));
      t.oncomplete = res; t.onerror = rej;
    };
    r.onerror = rej;
  });
}

async function receiveShare(request) {
  let files = [];
  try { files = (await request.formData()).getAll('media').filter(f => f && typeof f !== 'string' && f.size); } catch (err) {}
  if (files.length && files.every(isPhoto)) {
    try { await sharePhotos(files); } catch (err) {}
    return Response.redirect('./fotos/?shared=1', 303);
  }
  try { if (files.length) await shareToVideo(files); } catch (err) {}
  return Response.redirect('./video/?shared=1', 303);
}

self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method === 'POST' && url.pathname.endsWith('/share')) { e.respondWith(receiveShare(req)); return; }
  if (req.method !== 'GET') return;
  const sameOrigin = url.origin === location.origin;
  const cacheable = sameOrigin || /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname) || url.hostname === 'storage.googleapis.com';
  if (!cacheable) return;
  // Pages and code: network first so updates arrive, cache when offline.
  if (sameOrigin && (req.mode === 'navigate' || /\.(js|mjs|css|html|webmanifest)$/.test(url.pathname) || url.pathname.endsWith('/'))) {
    e.respondWith(fetch(req).then(r => { if (r.ok) { const cp = r.clone(); caches.open(VERSION).then(c => c.put(req, cp)); } return r; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('./index.html'))));
    return;
  }
  // Big libraries, models, fonts, icons: cache first.
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r.ok || r.type === 'opaque') { const cp = r.clone(); caches.open(RUNTIME).then(c => c.put(req, cp)); }
    return r;
  })));
});
