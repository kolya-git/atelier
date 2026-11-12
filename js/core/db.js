// Schlanker Promise-Wrapper um IndexedDB. Alle Daten bleiben auf dem Gerät.

const DB_NAME = 'atelier';
const DB_VERSION = 1;
export const STORES = ['images', 'posts', 'stories', 'kv', 'prints'];

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: name === 'kv' ? 'key' : 'id' });
        }
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Datenbank ist in einem anderen Tab geöffnet.'));
  });
  return dbPromise;
}

function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    Promise.resolve(fn(s)).then((r) => { result = r; }, reject);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Transaktion abgebrochen'));
  });
}

export const db = {
  open,
  get: (store, key) => tx(store, 'readonly', (s) => wrap(s.get(key))),
  all: (store) => tx(store, 'readonly', (s) => wrap(s.getAll())),
  keys: (store) => tx(store, 'readonly', (s) => wrap(s.getAllKeys())),
  put: (store, value) => tx(store, 'readwrite', (s) => wrap(s.put(value))),
  putMany: (store, values) => tx(store, 'readwrite', (s) => Promise.all(values.map((v) => wrap(s.put(v))))),
  del: (store, key) => tx(store, 'readwrite', (s) => wrap(s.delete(key))),
  clear: (store) => tx(store, 'readwrite', (s) => wrap(s.clear())),
  count: (store) => tx(store, 'readonly', (s) => wrap(s.count())),
};

// ---------- Einstellungen (Schlüssel/Wert) ----------
const kvCache = new Map();
export async function getSetting(key, fallback) {
  if (kvCache.has(key)) return kvCache.get(key);
  const rec = await db.get('kv', key);
  const v = rec ? rec.value : fallback;
  kvCache.set(key, v);
  return v;
}
export async function setSetting(key, value) {
  kvCache.set(key, value);
  await db.put('kv', { key, value });
}
export function clearSettingsCache() { kvCache.clear(); }

/** Bittet den Browser, die Daten nicht automatisch zu löschen. */
export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persisted) {
      if (await navigator.storage.persisted()) return true;
      if (navigator.storage.persist) return await navigator.storage.persist();
    }
  } catch { /* egal */ }
  return false;
}

export async function storageEstimate() {
  try {
    if (navigator.storage && navigator.storage.estimate) return await navigator.storage.estimate();
  } catch { /* egal */ }
  return null;
}
