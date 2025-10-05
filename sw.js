const CACHE_NAME = 'sudoku-pwa-cache-v1';
const localUrlsToCache = [
    './',
    './index.html',
    './css/styles.css',
    './js/scripts.js',
    './js/game_manager.js',
    './js/games/sudoku.js',
    './js/games/connect4.js',
    './js/games/wordsearch.js',
    './js/games/spellingbee.js',
    './js/generator.js',
    './js/timer.js',
    './js/misc.js',
    './js/peer.js',
    './js/ui.js',
    './js/webrtc.js',
    './sw.js',
    './manifest.json',
    './assets/ActiveSudoku.png',
    './assets/StageConnection.png',
    './icons/icon-192x192.png',
    './icons/icon-512x512.png'
];

const externalUrlsToCache = [
    'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
    'https://unpkg.com/peerjs@1.5.5/dist/peerjs.min.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        (async () => {
            const cache = await caches.open(CACHE_NAME);
            console.log('Opened cache');

            // Cache local files, which should succeed without issue
            await cache.addAll(localUrlsToCache);

            // Fetch and cache external resources one by one with a more robust method
            await Promise.all(
                externalUrlsToCache.map(async url => {
                    try {
                        const response = await fetch(url, { mode: 'no-cors' });
                        await cache.put(url, response);
                        console.log(`Successfully cached opaque response for: ${url}`);
                    } catch (error) {
                        console.error(`Failed to cache external resource: ${url}`, error);
                    }
                })
            );
        })()
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                if (response) {
                    return response;
                }
                return fetch(event.request);
            })
    );
});