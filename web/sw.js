// sw.js -- offline cache for the single-player site.
//
// build.mjs fills in MANIFEST below with { "<path relative to site root>": "<content hash>" }
// for every file it ships, so this script changes whenever any file changes and the
// browser installs the new version on the next visit.
//
// Strategy: cache-first, keyed by path + content hash.
//   - shared files (driver, runtime, picker page, icons) are fetched at install time;
//   - each game's files are cached the first time that game is opened, so a phone only
//     stores the games it actually plays (the largest is ~11 MB);
//   - on activate, entries whose hash is no longer in the manifest are deleted, so a
//     redeploy only re-downloads the files that really changed.
// Player saves live in IndexedDB (mudwasm.js), not here; clearing this cache never
// touches them.
'use strict';
const MANIFEST = __MANIFEST__;
const CACHE = 'mud-site';
const SCOPE = new URL(self.registration.scope).pathname; // e.g. "/mud/"
const SHARED = Object.keys(MANIFEST).filter((p) => !p.includes('/') || p.startsWith('driver/') || p.startsWith('icons/'));

function keyFor(rel) { return SCOPE + rel + '?v=' + MANIFEST[rel]; }
function relOf(url) {
  const u = new URL(url);
  if (u.origin !== self.location.origin || !u.pathname.startsWith(SCOPE)) return null;
  let rel = decodeURIComponent(u.pathname.slice(SCOPE.length));
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  return Object.prototype.hasOwnProperty.call(MANIFEST, rel) ? rel : null;
}

async function fetchAndStore(cache, rel) {
  const resp = await fetch(SCOPE + rel, { cache: 'no-cache' });
  if (resp.ok) await cache.put(keyFor(rel), resp.clone());
  return resp;
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(SHARED.map(async (rel) => {
      if (!(await cache.match(keyFor(rel)))) await fetchAndStore(cache, rel);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const live = new Set(Object.keys(MANIFEST).map(keyFor));
    for (const name of await caches.keys()) if (name !== CACHE) await caches.delete(name);
    const cache = await caches.open(CACHE);
    for (const req of await cache.keys()) {
      const u = new URL(req.url);
      if (!live.has(u.pathname + u.search)) await cache.delete(req);
    }
    await self.clients.claim();
  })());
});

// A page loaded before the worker took control fetched its files straight from the
// network, so they never reached the cache. The page tells us which game it is
// running ("cache-game"), and we fetch that game's files in the background so
// the very first visit is already playable offline.
self.addEventListener('message', (event) => {
  const d = event.data || {};
  if (d.type !== 'cache-game' || typeof d.game !== 'string' || !/^[a-z0-9_-]+$/i.test(d.game)) return;
  const files = Object.keys(MANIFEST).filter((p) => p.startsWith(d.game + '/'));
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    for (const rel of files) {
      if (!(await cache.match(keyFor(rel)))) { try { await fetchAndStore(cache, rel); } catch (e) { /* offline: retry next visit */ } }
    }
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const rel = relOf(req.url);
  if (!rel) return; // not one of our files: let the network handle it
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(keyFor(rel));
    if (hit) return hit;
    try {
      return await fetchAndStore(cache, rel);
    } catch (e) {
      return new Response('离线状态，而且这个游戏还没有下载过。请联网后打开一次。', {
        status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
  })());
});
