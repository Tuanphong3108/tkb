const CACHE_NAME = 'tkb-cache-dynamic';

// Cài đặt và ép SW mới kích hoạt ngay lập tức
self.addEventListener('install', (e) => {
  self.skipWaiting();
});

// Khi SW kích hoạt -> Dọn dẹp toàn bộ cache cũ trong bộ nhớ
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.map((key) => caches.delete(key)));
    }).then(() => self.clients.claim())
  );
});

// Xử lý Request: Kiểm tra mạng -> Xóa cache & Lấy bản mới -> Fallback nếu Offline
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  e.respondWith(
    fetch(e.request)
      .then(async (networkResponse) => {
        // Có kết nối mạng (Network ngon)
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          
          // Xóa toàn bộ cache cũ trước rồi mới ghi cache mới
          const cacheKeys = await caches.keys();
          await Promise.all(cacheKeys.map((key) => caches.delete(key)));

          const cache = await caches.open(CACHE_NAME);
          cache.put(e.request, responseToCache);
        }
        return networkResponse;
      })
      .catch(async () => {
        // Khi mất mạng / Wifi chập chờn -> Lấy dữ liệu đã lưu trong cache
        const cachedResponse = await caches.match(e.request);
        if (cachedResponse) {
          return cachedResponse;
        }
        // Trường hợp file không có trong cache lẫn mất mạng
        return new Response('Offline and resource not cached', { status: 503 });
      })
  );
});
