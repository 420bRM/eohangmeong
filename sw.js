// 어항멍 서비스워커: 앱 파일을 저장해 두고 오프라인에서도 어항을 엽니다.
// 배포할 때마다 VERSION을 올리면 다음 실행부터 새 파일로 바뀝니다.
const VERSION = 'v1.0.0';
const CACHE = `eohangmeong-${VERSION}`;
const SHELL = [
  './',
  'index.html',
  'privacy.html',
  'css/app.css',
  'js/app.js',
  'fonts/gowun-dodum.woff2',
  'manifest.webmanifest',
  'icons/favicon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('eohangmeong-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 저장본을 먼저 보여주고, 뒤에서 새 파일을 받아 저장본을 갱신합니다.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const hit = await cache.match(req, {ignoreSearch: req.mode === 'navigate'});
    const net = fetch(req).then(res => {
      if (res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    if (hit){ e.waitUntil(net); return hit; }
    const res = await net;
    if (res) return res;
    if (req.mode === 'navigate') return cache.match('index.html');
    return Response.error();
  }));
});
