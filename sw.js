const CACHE_NAME = 'tkb-cache-v1';

// Cài đặt SW và ép kích hoạt ngay bản mới
self.addEventListener('install', (e) => {
  self.skipWaiting();
});

// Khi SW mới kích hoạt -> Xóa sạch tất cả cache cũ
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Xử lý request: Ưu tiên lấy từ Mạng (Network First) -> Cập nhật Cache -> Fallback sang Cache nếu mất mạng
self.addEventListener('fetch', (e) => {
  // Bỏ qua các request không phải GET
  if (e.request.method !== 'GET') return;

  e.respondWith(
    fetch(e.request)
      .then((networkResponse) => {
        // Có mạng mạnh -> Lấy bản mới từ Server
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          
          // Xóa cache cũ và lưu bản mới nhất vào
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Mất mạng / Wifi yếu không tải được -> Lấy bản mới nhất đã lưu trong Cache
        return caches.match(e.request);
      })
  );
});
