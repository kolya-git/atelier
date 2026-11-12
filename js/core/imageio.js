// Bilder laden, verkleinern, Kennzahlen berechnen.
import { srgbToLinear, rgbToOklab } from './util.js';

/** Lädt eine Datei/Blob als <img>. Der Browser berücksichtigt dabei die EXIF-Ausrichtung. */
export function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.decoding = 'async';
    img.onload = async () => {
      try { if (img.decode) await img.decode(); } catch { /* manche Browser werfen bei großen Bildern */ }
      resolve(img);
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Bild konnte nicht gelesen werden (Format?)')); };
    img.src = url;
  });
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

const MAX_CANVAS_AREA = 16_000_000; // sicher für iPadOS-Safari

/**
 * Zeichnet eine Bildquelle verkleinert in ein Canvas (stufenweise halbieren → sauberes Verkleinern).
 * src: img | canvas | ImageBitmap; Rückgabe: Canvas.
 */
export function drawScaled(src, maxSide, { w: sw, h: sh } = {}) {
  const w0 = sw || src.naturalWidth || src.videoWidth || src.width;
  const h0 = sh || src.naturalHeight || src.videoHeight || src.height;
  let scale = Math.min(1, maxSide / Math.max(w0, h0));
  scale = Math.min(scale, Math.sqrt(MAX_CANVAS_AREA / (w0 * h0)));
  const tw = Math.max(1, Math.round(w0 * scale)), th = Math.max(1, Math.round(h0 * scale));
  let cur = src, cw = w0, ch = h0;
  // Zwischenstufen nur, solange sie in ein sicheres Canvas passen
  while (cw / 2 > tw * 1.05 && ch / 2 > th * 1.05) {
    const nw = Math.round(cw / 2), nh = Math.round(ch / 2);
    if (nw * nh > MAX_CANVAS_AREA) { cw = nw; ch = nh; continue; }
    const c = makeCanvas(nw, nh);
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(cur, 0, 0, nw, nh);
    if (cur !== src) releaseCanvas(cur);
    cur = c; cw = nw; ch = nh;
  }
  const out = makeCanvas(tw, th);
  const g = out.getContext('2d');
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(cur, 0, 0, tw, th);
  if (cur !== src) releaseCanvas(cur);
  return out;
}

/** Kodiert ein Canvas und gibt seinen Speicher sofort frei (Safari begrenzt den Canvas-Speicher). */
export async function blobAndRelease(canvas, type = 'image/jpeg', quality = 0.9) {
  const b = await canvasToBlob(canvas, type, quality);
  releaseCanvas(canvas);
  return b;
}
export function releaseCanvas(c) {
  if (c && c.tagName === 'CANVAS') { c.width = 0; c.height = 0; }
}

export function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.9) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Bild konnte nicht kodiert werden'))), type, quality);
  });
}

/**
 * Kennzahlen für das Angleichen von Bildserien.
 * Grauwelt-Weißabgleich, Helligkeit (log), Kontrastumfang, Farbigkeit.
 */
export function computeStats(canvas) {
  const s = drawScaled(canvas, 160);
  const { data } = s.getContext('2d').getImageData(0, 0, s.width, s.height);
  releaseCanvas(s);
  const n = data.length / 4;
  let sumLog = 0, wr = 0, wg = 0, wb = 0, wsum = 0, chroma = 0;
  const lums = new Float32Array(n);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const lr = srgbToLinear(r / 255), lg = srgbToLinear(g / 255), lb = srgbToLinear(b / 255);
    const L = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
    sumLog += Math.log(L + 1e-4);
    lums[j] = Math.cbrt(L); // wahrnehmungsnah
    const mx = Math.max(lr, lg, lb), mn = Math.min(lr, lg, lb);
    const sat = mx > 0 ? (mx - mn) / mx : 0;
    if (L > 0.02 && L < 0.92 && sat < 0.65) {
      const w = 1 - sat * 0.8;
      wr += lr * w; wg += lg * w; wb += lb * w; wsum += w;
    }
    const [, a, bb] = rgbToOklab(r, g, b);
    chroma += Math.hypot(a, bb);
  }
  const sorted = Array.from(lums).sort((a, b) => a - b);
  const q = (p) => sorted[Math.min(n - 1, Math.max(0, Math.round(p * (n - 1))))];
  if (wsum < 1) { wr = wg = wb = 1; }
  return {
    logLum: sumLog / n,
    p05: q(0.05), p50: q(0.5), p95: q(0.95),
    wbR: Math.log((wr + 1e-6) / (wg + 1e-6)),
    wbB: Math.log((wb + 1e-6) / (wg + 1e-6)),
    chroma: chroma / n,
  };
}

/**
 * Bereitet eine importierte Datei für den Planer vor:
 * Arbeitskopie (max. 2560 px) + Vorschaubild (720 px) + Kennzahlen.
 */
export async function prepareImport(file) {
  const img = await loadImage(file);
  const w = img.naturalWidth, h = img.naturalHeight;
  const work = drawScaled(img, 2560);
  const thumb = drawScaled(work, 720);
  const stats = computeStats(thumb);
  const ww = work.width, wh = work.height;
  const [blob, thumbBlob] = await Promise.all([blobAndRelease(work, 'image/jpeg', 0.9), blobAndRelease(thumb, 'image/jpeg', 0.85)]);
  return { blob, thumb: thumbBlob, w: ww, h: wh, origW: w, origH: h, stats };
}

/** Pixel eines verkleinerten Bildes (für Farbpaletten). */
export function samplePixels(src, side = 64) {
  const c = drawScaled(src, side);
  return c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
}
