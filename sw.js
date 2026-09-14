const CACHE_NAME = 'tkb-10a2-v2026.09.14';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon.png'
];

// Cài đặt và lưu cache các file tĩnh ban đầu
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Kích hoạt và dọn dẹp các cache phiên bản cũ
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    })
  );
  self.clients.claim();
});

// Xử lý request tài nguyên
self.addEventListener('fetch', (e) => {
  // Với các file dữ liệu JSON (thời khóa biểu/môn học), ưu tiên Network First
  if (e.request.url.includes('/asset/')) {
    e.respondWith(
      fetch(e.request)
        .then((response) => {
          const resClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, resClone));
          return response;
        })
        .catch(() => caches.match(e.request)) // Mất mạng thì dùng bản cache gần nhất
    );
  } else {
    // Với các file giao diện tĩnh, dùng Cache First
    e.respondWith(
      caches.match(e.request).then((res) => {
        return res || fetch(e.request);
      })
    );
  }
});
