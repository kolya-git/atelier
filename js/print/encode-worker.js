// Kodiert Bildstreifen im Hintergrund, damit die Oberfläche flüssig bleibt.
import { JpegEncoder, PngEncoder } from './encoders.js';

let enc = null;
let queue = Promise.resolve();

async function handle(m) {
  try {
    if (m.type === 'init') {
      enc = m.format === 'png'
        ? new PngEncoder(m.w, m.h, { alpha: !!m.alpha, dpi: m.dpi })
        : new JpegEncoder(m.w, m.h, { quality: m.quality, subsample: m.subsample, dpi: m.dpi });
      self.postMessage({ type: 'ready' });
    } else if (m.type === 'rows') {
      await enc.addRows(new Uint8Array(m.buf), m.rows);
      self.postMessage({ type: 'ack', id: m.id, bytes: enc.bytesSoFar || 0 });
    } else if (m.type === 'finish') {
      const blob = await enc.finish();
      enc = null;
      self.postMessage({ type: 'done', blob });
    } else if (m.type === 'estimate') {
      // Probestreifen mit mehreren Qualitäten kodieren → Bytes pro Zeile
      const res = [];
      for (const q of m.qualities) {
        let bytes = 0, rows = 0;
        for (const s of m.samples) {
          const e = new JpegEncoder(m.w, s.rows, { quality: q, subsample: m.subsample, dpi: 300 });
          e.addRows(new Uint8Array(s.buf), s.rows);
          const b = e.finish();
          bytes += b.size - 620; // Kopfdaten abziehen
          rows += s.rows;
        }
        res.push({ q, bytesPerRow: bytes / rows });
      }
      self.postMessage({ type: 'estimate', res });
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: err && err.message ? err.message : String(err) });
  }
}

self.onmessage = (e) => { queue = queue.then(() => handle(e.data)); };
