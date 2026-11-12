// Offline-Fähigkeit: alle App-Dateien werden lokal zwischengespeichert.
// Automatisch erzeugt mit tools/build-sw.py – nach Änderungen an der App neu ausführen.
const VERSION = 'atelier-66a65405b4';
const FILES = [
  './',
  'css/app.css',
  'fonts/LICENSE-OFL.txt',
  'fonts/cormorant-garamond-400-italic.woff2',
  'fonts/cormorant-garamond-400-normal.woff2',
  'fonts/cormorant-garamond-500-normal.woff2',
  'fonts/cormorant-garamond-600-normal.woff2',
  'fonts/eb-garamond-400-italic.woff2',
  'fonts/eb-garamond-400-normal.woff2',
  'fonts/eb-garamond-500-normal.woff2',
  'fonts/hanken-grotesk-400-normal.woff2',
  'fonts/hanken-grotesk-500-normal.woff2',
  'fonts/hanken-grotesk-600-normal.woff2',
  'fonts/ibm-plex-mono-400-normal.woff2',
  'fonts/ibm-plex-mono-500-normal.woff2',
  'fonts/jost-300-normal.woff2',
  'fonts/jost-400-normal.woff2',
  'fonts/jost-500-normal.woff2',
  'fonts/newsreader-400-italic.woff2',
  'fonts/newsreader-400-normal.woff2',
  'fonts/newsreader-500-normal.woff2',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/icon.svg',
  'index.html',
  'js/core/cropper.js',
  'js/core/db.js',
  'js/core/fonts.js',
  'js/core/imageio.js',
  'js/core/platform.js',
  'js/core/sortable.js',
  'js/core/store.js',
  'js/core/ui.js',
  'js/core/util.js',
  'js/core/zip.js',
  'js/gl/engine.js',
  'js/gl/glsl.js',
  'js/gl/looks.js',
  'js/main.js',
  'js/planner/calendar.js',
  'js/planner/feedlook.js',
  'js/planner/grid.js',
  'js/planner/ics.js',
  'js/planner/library.js',
  'js/planner/picker.js',
  'js/planner/post-editor.js',
  'js/planner/render.js',
  'js/planner/status.js',
  'js/print/analysis.js',
  'js/print/encode-worker.js',
  'js/print/encoders.js',
  'js/print/export.js',
  'js/print/formats.js',
  'js/print/mask-paint.js',
  'js/print/print.js',
  'js/print/styles.js',
  'js/settings.js',
  'js/stories/brand-editor.js',
  'js/stories/brand.js',
  'js/stories/stories.js',
  'js/stories/story-editor.js',
  'js/stories/story-render.js',
  'js/stories/templates.js',
  'manifest.webmanifest',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Erst aus dem Zwischenspeicher (schnell, offline), im Hintergrund aktualisieren.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const hit = await cache.match(req, { ignoreSearch: true });
    const net = fetch(req).then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
    return hit || (await net) || new Response('Offline', { status: 503 });
  }));
});
