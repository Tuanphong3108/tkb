const CACHE_NAME = 'tkb-offline-cache-v1';
const OFFLINE_URL = 'offline.html';

// 1. Cài đặt SW: CHỈ cache duy nhất file offline.html
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Tải và lưu trữ offline.html với cache: 'reload' để luôn lấy bản mới nhất từ server
      return cache.addAll([
        new Request(OFFLINE_URL, { cache: 'reload' }),
        new Request('./' + OFFLINE_URL, { cache: 'reload' })
      ]);
    })
  );
  self.skipWaiting();
});

// Hàm dọn dẹp triệt để: Quét sạch mọi cache lạ, và trong cache chính chỉ giữ duy nhất offline.html
async function purgeAllExceptOffline() {
  try {
    const cacheNames = await caches.keys();
    for (const name of cacheNames) {
      if (name !== CACHE_NAME) {
        // Xóa sạch toàn bộ các cache khác
        await caches.delete(name);
      } else {
        // Trong chính cache CACHE_NAME, quét và xóa bất cứ file nào không phải offline.html
        const cache = await caches.open(name);
        const requests = await cache.keys();
        for (const req of requests) {
          const url = new URL(req.url);
          if (!url.pathname.endsWith(OFFLINE_URL)) {
            await cache.delete(req);
          }
        }
      }
    }
  } catch (err) {
    console.error('Lỗi khi tự động dọn dẹp cache:', err);
  }
}

// 2. Kích hoạt SW: Dọn dẹp toàn bộ cache cũ và các dữ liệu tự động cache (chỉ giữ offline.html)
self.addEventListener('activate', (e) => {
  e.waitUntil(
    purgeAllExceptOffline().then(() => self.clients.claim())
  );
});

// 3. Xử lý Request: KHÔNG CACHE BẤT CỨ THỨ GÌ HẾT
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  // Luôn tự động quét sạch mọi cache lạ trong nền (nếu có bất cứ thứ gì bị tự động cache)
  e.waitUntil(purgeAllExceptOffline());

  const requestUrl = new URL(e.request.url);

  // Yêu cầu tải chính file offline.html
  if (requestUrl.pathname.endsWith(OFFLINE_URL)) {
    e.respondWith(
      (async () => {
        try {
          // Thử tải mới nếu đang online
          const networkResponse = await fetch(e.request);
          return networkResponse;
        } catch (err) {
          // Khi offline, lấy từ cache
          const cached = (await caches.match(OFFLINE_URL)) || (await caches.match('./' + OFFLINE_URL));
          if (cached) return cached;
          return new Response('Offline page unavailable', { status: 503 });
        }
      })()
    );
    return;
  }

  // Yêu cầu điều hướng trang web (Navigation: truy cập URL, F5, chuyển trang HTML)
  if (e.request.mode === 'navigate' || e.request.headers.get('accept')?.includes('text/html')) {
    e.respondWith(
      (async () => {
        try {
          // Luôn lấy từ mạng, tuyệt đối KHÔNG lưu cache
          const networkResponse = await fetch(e.request);
          return networkResponse;
        } catch (err) {
          // Khi mất mạng: Chuyển hướng thẳng tới file offline.html
          const offlineTarget = new URL(OFFLINE_URL, self.registration.scope).href;
          try {
            return Response.redirect(offlineTarget, 302);
          } catch (redirectErr) {
            // Fallback nếu trình duyệt không cho phép Response.redirect trong ngữ cảnh này
            const cached = (await caches.match(OFFLINE_URL)) || (await caches.match('./' + OFFLINE_URL));
            if (cached) return cached;
            return new Response('Mất kết nối mạng và không có bản offline', {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' }
            });
          }
        }
      })()
    );
    return;
  }

  // Mọi tài nguyên khác (CSS, JS, JSON, ảnh, font...):
  // Đi thẳng ra mạng (Network Only), TUYỆT ĐỐI KHÔNG LƯU VÀO CACHE STORAGE
  e.respondWith(fetch(e.request));
});
