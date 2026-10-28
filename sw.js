/**
 * sw.js - Service Worker for 拔剑 Sketon Anime Web Alarm PWA
 * Provides full offline support, caching strategies, and notification click handling.
 */

const CACHE_NAME = 'sketon-alarm-v1.0.0';

// Essential assets to cache immediately upon install
const PRECACHE_ASSETS = [
    './',
    './index.html',
    './css/style.css',
    './js/app.js',
    './js/db.js',
    './js/scheduler.js',
    './js/player.js',
    './js/ui.js',
    './js/worker.js',
    './js/bundle.js',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/maskable-icon-512.png',
    './icons/icon.svg'
];

// External CDN assets to cache dynamically when requested
const CDN_HOSTS = [
    'cdn.tailwindcss.com',
    'cdnjs.cloudflare.com',
    'fonts.googleapis.com',
    'fonts.gstatic.com',
    'images.unsplash.com'
];

// Install Event - Pre-cache core shell
self.addEventListener('install', (event) => {
    console.log('[Service Worker] Menginstal PWA Service Worker...');
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Service Worker] Melakukan pre-cache aset inti...');
            return cache.addAll(PRECACHE_ASSETS);
        }).then(() => self.skipWaiting())
    );
});

// Activate Event - Clean up stale caches
self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Mengaktifkan Service Worker baru...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((name) => {
                    if (name !== CACHE_NAME) {
                        console.log('[Service Worker] Menghapus cache usang:', name);
                        return caches.delete(name);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch Event - Stale-While-Revalidate with Network Fallback
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // Only handle GET requests
    if (request.method !== 'GET') return;

    // Handle same-origin assets or permitted CDNs
    const isSameOrigin = url.origin === self.location.origin;
    const isCdn = CDN_HOSTS.some(host => url.hostname.includes(host));

    if (isSameOrigin || isCdn) {
        event.respondWith(
            caches.match(request).then((cachedResponse) => {
                // Fetch from network in background to revalidate cache
                const fetchPromise = fetch(request).then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(request, responseToCache);
                        });
                    }
                    return networkResponse;
                }).catch((err) => {
                    // Network failed - if we had a cached response, it was already returned
                    console.log('[Service Worker] Mode offline aktif untuk:', request.url);
                });

                // Return cached version immediately if available, otherwise wait for network
                return cachedResponse || fetchPromise;
            })
        );
    }
});

// Handle Notification Click
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if (client.url.includes('index.html') && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow('./index.html');
            }
        })
    );
});
