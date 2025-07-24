const CACHE_NAME = 'vibrate-monitor-v1.0.0';
const API_CACHE_NAME = 'vibrate-monitor-api-v1.0.0';

// Static assets to cache
const STATIC_ASSETS = [
  '/',
  '/src/css/styles.css',
  '/src/js/app.js',
  '/src/js/api.js',
  '/src/js/auth.js',
  '/src/js/admin.js',
  '/src/js/utils.js',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/chart.js'
];

// API endpoints to cache
const API_ENDPOINTS = [
  '/api/data/config',
  '/api/users'
];

// Install event
self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      // Cache static assets
      caches.open(CACHE_NAME).then((cache) => {
        return cache.addAll(STATIC_ASSETS);
      }),
      // Cache API responses
      caches.open(API_CACHE_NAME).then((cache) => {
        return Promise.all(
          API_ENDPOINTS.map(url => {
            return fetch(url)
              .then(response => {
                if (response.ok) {
                  return cache.put(url, response);
                }
              })
              .catch(() => {
                // Ignore cache failures for API endpoints
              });
          })
        );
      })
    ]).then(() => {
      // Skip waiting and take control immediately
      return self.skipWaiting();
    })
  );
});

// Activate event
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME && cacheName !== API_CACHE_NAME) {
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // Take control of all clients
      self.clients.claim()
    ])
  );
});

// Fetch event
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Handle API requests
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleApiRequest(event.request));
    return;
  }
  
  // Handle static assets
  event.respondWith(handleStaticRequest(event.request));
});

// Handle API requests with cache-first strategy for GET requests
async function handleApiRequest(request) {
  const url = new URL(request.url);
  
  // For authentication requests, always go to network
  if (url.pathname.includes('/auth/')) {
    return handleNetworkFirst(request);
  }
  
  // For GET requests, try cache first
  if (request.method === 'GET') {
    return handleCacheFirst(request, API_CACHE_NAME);
  }
  
  // For POST/PUT/DELETE requests, always go to network
  return handleNetworkFirst(request);
}

// Handle static requests with cache-first strategy
async function handleStaticRequest(request) {
  return handleCacheFirst(request, CACHE_NAME);
}

// Cache-first strategy
async function handleCacheFirst(request, cacheName) {
  try {
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      // Update cache in background for API requests
      if (cacheName === API_CACHE_NAME) {
        fetch(request).then(response => {
          if (response.ok) {
            cache.put(request, response.clone());
          }
        }).catch(() => {
          // Ignore background update failures
        });
      }
      
      return cachedResponse;
    }
    
    // Not in cache, fetch from network
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // Cache successful responses
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    // Network failed, try to return cached response
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // If it's an HTML request and we're offline, return offline page
    if (request.destination === 'document') {
      return caches.match('/');
    }
    
    throw error;
  }
}

// Network-first strategy
async function handleNetworkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    
    // Cache successful GET responses
    if (request.method === 'GET' && networkResponse.ok) {
      const cache = await caches.open(API_CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    // Network failed, try cache for GET requests
    if (request.method === 'GET') {
      const cache = await caches.open(API_CACHE_NAME);
      const cachedResponse = await cache.match(request);
      
      if (cachedResponse) {
        return cachedResponse;
      }
    }
    
    throw error;
  }
}

// Handle background sync for offline data
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    event.waitUntil(syncOfflineData());
  }
});

// Sync offline data when connection is restored
async function syncOfflineData() {
  try {
    const offlineData = await getOfflineData();
    
    for (const item of offlineData) {
      try {
        await fetch(item.url, {
          method: item.method,
          headers: item.headers,
          body: item.body
        });
        
        // Remove synced item from offline storage
        await removeOfflineData(item.id);
      } catch (error) {
        console.log('Failed to sync item:', item.id);
      }
    }
  } catch (error) {
    console.log('Background sync failed:', error);
  }
}

// Offline data management
async function getOfflineData() {
  // Implementation would depend on IndexedDB or other storage
  return [];
}

async function removeOfflineData(id) {
  // Implementation would depend on storage method
}

// Handle push notifications (if needed in future)
self.addEventListener('push', (event) => {
  if (event.data) {
    const options = {
      body: event.data.text(),
      icon: '/icons/icon-96x96.png',
      badge: '/icons/icon-96x96.png',
      vibrate: [100, 50, 100],
      data: {
        dateOfArrival: Date.now(),
        primaryKey: 1
      }
    };
    
    event.waitUntil(
      self.registration.showNotification('سیستم ویبره مانیتور', options)
    );
  }
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  event.waitUntil(
    clients.openWindow('/')
  );
});