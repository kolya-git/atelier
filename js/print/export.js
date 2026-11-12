// Export in Druckauflösung: kachelweise auf der GPU rechnen, streifenweise im Worker kodieren.
import { printUniforms, computeLayout } from './styles.js';
import { sizeById, ETSY_MAX_BYTES } from './formats.js';
import { fileSafe } from '../core/util.js';

const STRIP = 128; // Zeilen pro Streifen (Vielfaches von 16)

class EncoderWorker {
  constructor() {
    this.w = new Worker(new URL('./encode-worker.js', import.meta.url), { type: 'module' });
    this.waiters = [];
    this.inflight = 0;
    this.error = null;
    this.w.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'error') { this.error = new Error(m.message); }
      if (m.type === 'ack') this.inflight--;
      const ws = this.waiters; this.waiters = [];
      for (const fn of ws) fn(m);
    };
    this.w.onerror = (e) => { this.error = new Error(e.message || 'Fehler im Kodier-Worker'); const ws = this.waiters; this.waiters = []; for (const fn of ws) fn({ type: 'error' }); };
  }
  next(pred) {
    return new Promise((resolve, reject) => {
      const wait = (m) => {
        if (this.error) return reject(this.error);
        if (pred(m)) resolve(m); else this.waiters.push(wait);
      };
      if (this.error) return reject(this.error);
      this.waiters.push(wait);
    });
  }
  post(msg, transfer) { this.w.postMessage(msg, transfer || []); }
  terminate() { this.w.terminate(); }
}

function abortErr() { const e = new Error('Abgebrochen'); e.name = 'AbortError'; return e; }

/** Rendert einen Streifen (alle Kacheln einer Zeile) und liefert RGBA-Daten. */
function makeStripRenderer(eng, project, layout, src, textures, hasPaint) {
  const W = layout.W, H = layout.H;
  const tileW = Math.min(W, 2048, eng.maxRB, eng.maxVP);
  const fbo = eng.framebuffer(tileW, STRIP);
  const tileBuf = new Uint8Array(tileW * STRIP * 4);
  const render = (y0, h) => {
    const strip = new Uint8Array(W * h * 4);
    for (let x0 = 0; x0 < W; x0 += tileW) {
      const tw = Math.min(tileW, W - x0);
      const u = printUniforms(project, layout, src, { outW: W, outH: H, tile: [x0, y0, tw, h], flipY: 0, hasPaint });
      eng.draw('print', u, textures, { target: fbo, w: tw, h });
      const view = tileBuf.subarray(0, tw * h * 4);
      eng.read(fbo, tw, h, view);
      if (tw === W) strip.set(view);
      else for (let r = 0; r < h; r++) strip.set(view.subarray(r * tw * 4, (r + 1) * tw * 4), (r * W + x0) * 4);
    }
    return strip;
  };
  return { render, dispose: () => fbo.dispose(), W, H };
}

/**
 * Exportiert eine Datei.
 * opts: { format: 'jpeg'|'png', quality, subsample, alpha, onProgress(frac), signal }
 */
export async function exportFile(eng, project, layout, src, textures, hasPaint, opts = {}) {
  const { format = 'jpeg', quality = 92, subsample = quality < 95, alpha = false, onProgress, signal } = opts;
  const sr = makeStripRenderer(eng, project, layout, src, textures, hasPaint);
  const wk = new EncoderWorker();
  try {
    wk.post({ type: 'init', format, w: sr.W, h: sr.H, quality, subsample, alpha, dpi: layout.dpi });
    await wk.next((m) => m.type === 'ready');
    let id = 0;
    for (let y0 = 0; y0 < sr.H; y0 += STRIP) {
      if (signal && signal.aborted) throw abortErr();
      const h = Math.min(STRIP, sr.H - y0);
      const strip = sr.render(y0, h);
      while (wk.inflight >= 3) await wk.next((m) => m.type === 'ack' || m.type === 'error');
      wk.inflight++;
      wk.post({ type: 'rows', id: id++, buf: strip.buffer, rows: h }, [strip.buffer]);
      onProgress && onProgress(Math.min(0.98, (y0 + h) / sr.H));
      // dem Browser Luft lassen (Fortschrittsbalken, Abbrechen)
      if (id % 4 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    wk.post({ type: 'finish' });
    const done = await wk.next((m) => m.type === 'done');
    onProgress && onProgress(1);
    return done.blob;
  } finally {
    wk.terminate();
    sr.dispose();
  }
}

/** Schätzt die beste JPEG-Qualität für eine Zielgröße anhand von Probestreifen. */
export async function pickQuality(eng, project, layout, src, textures, hasPaint, targetBytes, maxQ = 95) {
  const sr = makeStripRenderer(eng, project, layout, src, textures, hasPaint);
  const wk = new EncoderWorker();
  try {
    const samples = [];
    const n = 6, rows = 64;
    for (let i = 0; i < n; i++) {
      let y0 = Math.floor(((i + 0.5) / n) * sr.H - rows / 2);
      y0 = Math.max(0, Math.min(sr.H - rows, y0)) & ~15;
      const buf = sr.render(y0, Math.min(rows, sr.H - y0));
      samples.push({ rows: Math.min(rows, sr.H - y0), buf: buf.buffer });
    }
    const qualities = [95, 92, 89, 86, 83, 80, 77, 74].filter((q) => q <= maxQ);
    wk.post({ type: 'estimate', w: sr.W, samples, qualities, subsample: true }, samples.map((s) => s.buf));
    const { res } = await wk.next((m) => m.type === 'estimate');
    const predict = (r) => r.bytesPerRow * sr.H * 1.03 + 4000;
    for (const r of res) if (predict(r) <= targetBytes) return { quality: r.q, predicted: predict(r), fits: true };
    const last = res[res.length - 1];
    return { quality: last.q, predicted: predict(last), fits: false };
  } finally {
    wk.terminate();
    sr.dispose();
  }
}

export function fileNameFor(baseName, layout, ext) {
  const s = layout.size;
  const land = layout.paperMM[0] > layout.paperMM[1];
  let dims;
  if (/^A\d$/.test(s.id)) dims = s.id + (land ? '-quer' : '');
  else {
    const a = Math.min(s.w, s.h), b = Math.max(s.w, s.h);
    const f = (mm) => (s.unit === 'in' ? Math.round((mm / 25.4) * 10) / 10 : Math.round(mm / 10));
    dims = (land ? `${f(b)}x${f(a)}` : `${f(a)}x${f(b)}`) + (s.unit === 'in' ? 'in' : 'cm');
  }
  return `${fileSafe(baseName, 'druck')}_${dims.replace(/\./g, ',')}_${layout.dpi}dpi.${ext}`;
}

/**
 * Etsy-Set: mehrere Seitenverhältnisse, jede Datei ≤ 20 MB.
 * Qualität wird geschätzt; reicht sie nicht, wird die Auflösung moderat reduziert.
 */
export async function exportEtsySet(eng, project, src, textures, hasPaint, sizeIds, { baseName, onProgress, onStatus, signal, dpi = 300 } = {}) {
  const results = [];
  const total = sizeIds.length;
  for (let i = 0; i < total; i++) {
    if (signal && signal.aborted) throw abortErr();
    const size = sizeById(sizeIds[i]);
    let proj = { ...project, dpi };
    let layout = computeLayout(proj, src.w, src.h, size);
    onStatus && onStatus(`${size.label}: Dateigröße wird geschätzt …`);
    let pick = await pickQuality(eng, proj, layout, src, textures, hasPaint, ETSY_MAX_BYTES * 0.97);
    if (!pick.fits) {
      // Auflösung so weit senken, dass ~Qualität 86 passt (mindestens 200 dpi)
      const scale = Math.sqrt((ETSY_MAX_BYTES * 0.9) / pick.predicted);
      const dpi = Math.min(layout.dpi, Math.max(200, Math.floor((layout.dpi * scale) / 10) * 10));
      proj = { ...proj, dpi };
      layout = computeLayout(proj, src.w, src.h, size);
      pick = await pickQuality(eng, proj, layout, src, textures, hasPaint, ETSY_MAX_BYTES * 0.97);
    }
    let q = pick.quality;
    let blob = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      onStatus && onStatus(`${size.label} · ${layout.W} × ${layout.H} px · Qualität ${q}`);
      blob = await exportFile(eng, proj, layout, src, textures, hasPaint, {
        format: 'jpeg', quality: q, subsample: true, signal,
        onProgress: (f) => onProgress && onProgress((i + f) / total),
      });
      if (blob.size <= ETSY_MAX_BYTES) break;
      q -= 5;
    }
    results.push({ name: fileNameFor(baseName, layout, 'jpg'), blob, layout, quality: q, size });
  }
  return results;
}
