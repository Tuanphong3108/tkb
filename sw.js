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

// Xử lý Request: Kiểm tra mạng (giới hạn 8s) -> Xóa cache & Lấy bản mới -> Fallback nếu Offline / Mạng quá lag
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  e.respondWith(
    (async () => {
      // Tạo controller để hủy fetch nếu quá 8 giây
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // Giới hạn tối đa 8s

      try {
        const networkResponse = await fetch(e.request, { signal: controller.signal });
        clearTimeout(timeoutId); // Tải xong trước 8s -> Hủy đếm ngược timeout

        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          
          // Mạng đáp ứng tốt (dưới 8s) -> Quét sạch cache cũ & lưu bản mới
          const cacheKeys = await caches.keys();
          await Promise.all(cacheKeys.map((key) => caches.delete(key)));

          const cache = await caches.open(CACHE_NAME);
          cache.put(e.request, responseToCache);
        }
        return networkResponse;
      } catch (err) {
        // Mạng sập HOẶC ngâm quá 8 giây -> Nhảy xuống đây lấy ngay bản Cache đã lưu!
        const cachedResponse = await caches.match(e.request);
        if (cachedResponse) {
          return cachedResponse;
        }
        return new Response('Offline and resource not cached', { status: 503 });
      }
    })()
  );
});
