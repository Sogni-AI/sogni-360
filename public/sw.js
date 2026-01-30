// Service Worker for Sogni 360
// Simple service worker for PWA installation support

const CACHE_VERSION = 'sogni-360-v1';

// Install event - just activate immediately
self.addEventListener('install', (event) => {
  console.log('Sogni 360 Service Worker: Installing...');
  self.skipWaiting();
});

// Activate event - claim clients immediately
self.addEventListener('activate', (event) => {
  console.log('Sogni 360 Service Worker: Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => cacheName.startsWith('sogni-360-') && cacheName !== CACHE_VERSION)
          .map((cacheName) => caches.delete(cacheName))
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Fetch event - network first, no caching for now
// This keeps the PWA simple while still enabling the install prompt
self.addEventListener('fetch', (event) => {
  // Just let requests pass through to the network
  // We're not doing offline caching in this version
  event.respondWith(fetch(event.request));
});
