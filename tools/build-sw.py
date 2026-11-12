#!/usr/bin/env python3
"""Erzeugt atelier/sw.js neu: Liste aller App-Dateien + Version aus den Dateiinhalten.

Aufruf (im Ordner atelier oder von überall):
    python3 atelier/tools/build-sw.py

Nach jeder Änderung an der App ausführen, damit installierte iPads die neue Version laden.
"""
import hashlib
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {'tools'}
SKIP_FILES = {'sw.js', 'README.md', 'icon-maskable.svg', 'artifact.html'}


def collect():
    files = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS and not d.startswith('.'))
        for f in sorted(filenames):
            if f in SKIP_FILES or f.startswith('.'):
                continue
            files.append(os.path.relpath(os.path.join(dirpath, f), ROOT).replace(os.sep, '/'))
    return sorted(files)


def main():
    files = collect()
    h = hashlib.sha256()
    for rel in files:
        h.update(rel.encode())
        with open(os.path.join(ROOT, rel), 'rb') as fh:
            h.update(fh.read())
    version = h.hexdigest()[:10]
    listing = ',\n  '.join(["'./'"] + [f"'{f}'" for f in files])
    sw = f"""// Offline-Fähigkeit: alle App-Dateien werden lokal zwischengespeichert.
// Automatisch erzeugt mit tools/build-sw.py – nach Änderungen an der App neu ausführen.
const VERSION = 'atelier-{version}';
const FILES = [
  {listing},
];

self.addEventListener('install', (e) => {{
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
}});

self.addEventListener('activate', (e) => {{
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
}});

// Erst aus dem Zwischenspeicher (schnell, offline), im Hintergrund aktualisieren.
self.addEventListener('fetch', (e) => {{
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(caches.open(VERSION).then(async (cache) => {{
    const hit = await cache.match(req, {{ ignoreSearch: true }});
    const net = fetch(req).then((res) => {{ if (res && res.ok) cache.put(req, res.clone()); return res; }}).catch(() => null);
    return hit || (await net) || new Response('Offline', {{ status: 503 }});
  }}));
}});
"""
    with open(os.path.join(ROOT, 'sw.js'), 'w', encoding='utf-8') as fh:
        fh.write(sw)
    print(f'sw.js: Version {version}, {len(files)} Dateien')


if __name__ == '__main__':
    main()
