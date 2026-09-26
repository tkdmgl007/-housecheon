// 현장 장부: 인터넷 없어도 페이지가 열리게 파일을 폰에 보관
const CACHE = 'housecheon-v6';
const FILES = [
  '/', '/index.html', '/memo.html', '/villas.js', '/stock.js', '/manifest.json', '/icon-192.png', '/icon-512.png',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const mine = url.origin === location.origin && FILES.includes(url.pathname);
  const fb = url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/');
  if (!mine && !fb) return; // 빌라관리 앱·Firestore 통신은 건드리지 않음
  if (url.pathname === '/' || url.pathname.endsWith('.html')) {
    // 최신 우선, 안 되면 보관본
    e.respondWith(fetch(req).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); return r; })
      .catch(() => caches.match(req, {ignoreSearch: true})));
  } else {
    e.respondWith(caches.match(req).then(r => r || fetch(req)));
  }
});
