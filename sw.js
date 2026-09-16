const CACHE_NAME = 'tkb-cache-v1'; // Đổi tên/version (ví dụ v2, v3) ở đây để ép dọn sạch cache cũ!

// Cài đặt và kích hoạt SW ngay lập tức
self.addEventListener('install', (e) => {
  self.skipWaiting();
});

// Chỉ xóa cache khi CACHE_NAME thay đổi
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME) // Giữ lại cache có tên khớp, xóa toàn bộ cache tên cũ
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);
  const isJson = url.pathname.endsWith('.json') || e.request.headers.get('accept')?.includes('application/json');

  if (isJson) {
    // ----------------------------------------------------
    // STRATEGY 1: NETWORK FIRST (Áp dụng riêng cho JSON)
    // ----------------------------------------------------
    e.respondWith(
      (async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // Giới hạn 8s

        try {
          const networkResponse = await fetch(e.request, { signal: controller.signal });
          clearTimeout(timeoutId);

          if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(e.request, networkResponse.clone()); // Cập nhật JSON mới nhất vào cache
          }
          return networkResponse;
        } catch (err) {
          // Mất mạng hoặc ngâm quá 8s -> Trả về bản JSON đã cache từ trước
          const cachedResponse = await caches.match(e.request);
          if (cachedResponse) return cachedResponse;
          return new Response(JSON.stringify({ error: 'Offline and no cache' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      })()
    );
  } else {
    // ----------------------------------------------------
    // STRATEGY 2: CACHE FIRST (Áp dụng cho HTML, CSS, JS, ảnh...)
    // ----------------------------------------------------
    e.respondWith(
      (async () => {
        const cachedResponse = await caches.match(e.request);
        if (cachedResponse) return cachedResponse; // Có trong cache thì xài luôn

        try {
          const networkResponse = await fetch(e.request);
          if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(e.request, networkResponse.clone());
          }
          return networkResponse;
        } catch (err) {
          return new Response('Offline', { status: 503 });
        }
      })()
    );
  }
});
