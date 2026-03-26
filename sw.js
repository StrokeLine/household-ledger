/**
 * Service Worker - 오프라인 캐싱
 */
var CACHE_NAME = 'household-ledger-v1';
var ASSETS = [
  './',
  './index.html',
  './css/app.css',
  './js/app.js',
  './manifest.json'
];

// 설치: 정적 자산 캐시
self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// 활성화: 이전 캐시 정리
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (key) {
          return key !== CACHE_NAME;
        }).map(function (key) {
          return caches.delete(key);
        })
      );
    })
  );
  self.clients.claim();
});

// 요청 가로채기: 네트워크 우선, 실패 시 캐시
self.addEventListener('fetch', function (e) {
  // API 요청은 캐시하지 않음
  if (e.request.url.includes('script.google.com') || e.request.method !== 'GET') {
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then(function (response) {
        // 성공 시 캐시 업데이트
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(e.request, clone);
        });
        return response;
      })
      .catch(function () {
        // 오프라인 시 캐시에서 반환
        return caches.match(e.request);
      })
  );
});
