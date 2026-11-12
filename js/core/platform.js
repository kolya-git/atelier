// Erkennt, ob Atelier als Seite in Claude läuft, und bietet dort das Sichern von Dateien an.
// In Claude sind normale Downloads und das iOS-Teilen-Menü der Seite gesperrt; stattdessen
// fragt Claude nach („Datei sichern?“) und reicht die Datei weiter – in der iPad-App ans Teilen-Menü.

export const IN_CLAUDE = typeof window !== 'undefined' && !!(window.claude && typeof window.claude.use === 'function');

let dl = null;
function downloads() {
  if (!IN_CLAUDE) return Promise.resolve(null);
  if (!dl) dl = Promise.resolve(window.claude.use('downloads')).catch(() => null);
  return dl;
}

/** true, wenn Dateien über Claude gesichert werden (statt Browser-Download/Teilen). */
export async function claudeSaves() {
  return !!(await downloads());
}

const MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'application/zip': 'zip', 'text/plain': 'txt' };
function withExtension(name, blob) {
  if (/\.[a-z0-9]{2,5}$/i.test(name)) return name;
  return name + '.' + (MIME_EXT[blob.type] || 'txt');
}

/**
 * Bietet eine Datei über Claude zum Sichern an.
 * Rückgabe: 'saved' | 'declined' | 'unsupported' | 'unavailable'
 */
export async function saveWithClaude(blob, filename) {
  const d = await downloads();
  if (!d) return 'unavailable';
  const name = withExtension(filename, blob);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await d.save({ filename: name, data: blob });
      return 'saved';
    } catch (e) {
      const code = e && e.code;
      if (code === 'declined') return 'declined';
      if (code === 'rate_limited') { await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); continue; }
      if (code === 'rejected_extension' || code === 'extension_not_enabled') return 'unsupported';
      if (code === 'too_large') return 'too_large';
      return 'unavailable';
    }
  }
  return 'unavailable';
}
