// 어항멍 서비스워커: 앱 파일을 저장해 두고 오프라인에서도 어항을 엽니다.
// 배포할 때마다 VERSION을 올리면 다음 실행부터 새 파일로 바뀝니다.
const VERSION = 'v2.0.0';
const CACHE = `eohangmeong-${VERSION}`;
const Q = `?v=${VERSION.slice(1)}`;
const SHELL = [
  './',
  'index.html',
  'privacy.html',
  'css/app.css' + Q,
  'js/app.js' + Q,
  'js/data.js' + Q,
  'js/critters.js' + Q,
  'js/music.js' + Q,
  'fonts/gowun-dodum.woff2',
  'manifest.webmanifest',
  'icons/favicon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, {cache:'reload'})))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('eohangmeong-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 화면 문서는 네트워크를 먼저(새 버전이 바로 보이도록), 나머지는 저장본을 먼저 쓰고 뒤에서 갱신
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate'){
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3500))]);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch(err){
        return (await cache.match(req, {ignoreSearch:true})) || (await cache.match('index.html')) || Response.error();
      }
    })());
    return;
  }
  e.respondWith(caches.open(CACHE).then(async cache => {
    const hit = await cache.match(req);
    const net = fetch(req).then(res => {
      if (res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    if (hit){ e.waitUntil(net); return hit; }
    return (await net) || Response.error();
  }));
});
