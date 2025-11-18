const CACHE_NAME = 'sudoku-pwa-cache-v2'; // Increment cache version to force update
const localUrlsToCache = [
    './',
    './index.html',
    './css/styles.css',
    './css/games/sudoku.css',
    './css/games/connect4.css',
    './css/games/wordsearch.css',
    './css/games/spellingbee.css',
    './css/games/memorymatch.css',
    './css/games/wordle.css',
    './css/games/crossword.css',
    './css/games/blackjack.css',
    './css/games/cosmicbalance.css',
    './js/scripts.js',
    './js/game_manager.js',
    './js/games/sudoku.js',
    './js/games/connect4.js',
    './js/games/wordsearch.js',
    './js/games/connect4-worker.js',
    './js/games/wordle.js',
    './js/games/crossword.js',
    './js/games/spellingbee.js',
    './js/games/memorymatch.js',
    './js/games/blackjack.js',
    './js/games/cosmicbalance.js',
    './js/games/cb_constants.js',
    './js/games/cb_ship_designer.js',
    './js/games/cb_tactical_combat.js',
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
    './assets/SudokuIcon.png',
    './icons/icon-192x192.png',
    './icons/icon-512x512.png'
];

const externalUrlsToCache = [
    'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
    'https://unpkg.com/peerjs@1.5.5/dist/peerjs.min.js',
    'https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&display=swap'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        (async () => {
            const cache = await caches.open(CACHE_NAME);
            console.log('[Service Worker] Caching all: app shell and content');
            // Use cache.addAll for all resources. It handles requests and responses correctly.
            await cache.addAll([...localUrlsToCache, ...externalUrlsToCache]);
        })()
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                if (response) {
                    // If the response is in the cache, return it.
                    return response;
                }
                // If it's not in the cache, fetch it from the network.
                return fetch(event.request).then((networkResponse) => {
                    // And cache the new response for future use.
                    return caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, networkResponse.clone());
                        return networkResponse;
                    });
                });
            })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) {
                    return caches.delete(key);
                }
            }));
        })
    );
});