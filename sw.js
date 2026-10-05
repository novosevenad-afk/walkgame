// オフラインでも起動できるようにアプリ本体をキャッシュする
const CACHE = 'walkquest-v3';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/main.js',
  './js/battle.js',
  './js/data.js',
  './js/player.js',
  './js/sound.js',
  './js/util.js',
  './js/world.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './lib/leaflet/leaflet.js',
  './lib/leaflet/leaflet.css',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// 自分のファイルはネットワーク優先（更新をすぐ反映）、失敗したらキャッシュ
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request)),
  );
});
