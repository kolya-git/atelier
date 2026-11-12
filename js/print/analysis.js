// Bildanalyse für die Druckstile: weiche Helligkeitsfelder (natürliche Linien) + Detaildichte (Motiv).
import { drawScaled, releaseCanvas } from '../core/imageio.js';
import { srgbToLinear } from '../core/util.js';

function boxesForGauss(sigma, n = 3) {
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(wIdeal); if (wl % 2 === 0) wl--;
  const wu = wl + 2;
  const mIdeal = (12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4);
  const m = Math.round(mIdeal);
  const sizes = [];
  for (let i = 0; i < n; i++) sizes.push(i < m ? wl : wu);
  return sizes.map((s) => Math.max(0, (s - 1) / 2));
}

function boxH(src, dst, w, h, r) {
  const iarr = 1 / (r + r + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = src[row] * (r + 1);
    for (let j = 0; j < r; j++) acc += src[row + Math.min(w - 1, j)];
    for (let x = 0; x < w; x++) {
      acc += src[row + Math.min(w - 1, x + r)] - src[row + Math.max(0, x - r - 1)];
      dst[row + x] = acc * iarr;
    }
  }
}
function boxV(src, dst, w, h, r) {
  const iarr = 1 / (r + r + 1);
  for (let x = 0; x < w; x++) {
    let acc = src[x] * (r + 1);
    for (let j = 0; j < r; j++) acc += src[Math.min(h - 1, j) * w + x];
    for (let y = 0; y < h; y++) {
      acc += src[Math.min(h - 1, y + r) * w + x] - src[Math.max(0, y - r - 1) * w + x];
      dst[y * w + x] = acc * iarr;
    }
  }
}
export function gaussBlur(src, w, h, sigma) {
  if (sigma < 0.3) return Float32Array.from(src);
  const a = Float32Array.from(src), b = new Float32Array(src.length);
  for (const r of boxesForGauss(sigma)) {
    const ri = Math.round(r);
    if (ri < 1) continue;
    boxH(a, b, w, h, ri);
    boxV(b, a, w, h, ri);
  }
  return a;
}

function percentile(arr, p) {
  const step = Math.max(1, Math.floor(arr.length / 20000));
  const s = [];
  for (let i = 0; i < arr.length; i += step) s.push(arr[i]);
  s.sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))];
}

/**
 * Berechnet das Feld in ausgerichteten Bildkoordinaten.
 * Rückgabe: { data: Float32Array RGBA, w, h }
 *   R: Helligkeit fein, G: mittel, B: grob (normiert auf den Tonwertumfang), A: Detaildichte 0..1
 */
export function computeField(img, maxSide = 1024) {
  const c = drawScaled(img, maxSide);
  const w = c.width, h = c.height;
  const px = c.getContext('2d').getImageData(0, 0, w, h).data;
  releaseCanvas(c);
  const n = w * h;
  const L = new Float32Array(n);
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i++) lut[i] = srgbToLinear(i / 255);
  for (let i = 0, j = 0; j < n; i += 4, j++) {
    const Y = 0.2126 * lut[px[i]] + 0.7152 * lut[px[i + 1]] + 0.0722 * lut[px[i + 2]];
    L[j] = Math.pow(Y, 1 / 2.2);
  }
  const side = Math.max(w, h);
  const f1 = gaussBlur(L, w, h, side * 0.0016);
  const f2 = gaussBlur(L, w, h, side * 0.0065);
  const f3 = gaussBlur(L, w, h, side * 0.02);
  // Detaildichte: Gradientenbetrag, weich gezeichnet
  const g = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const xm = Math.max(0, x - 1), xp = Math.min(w - 1, x + 1), ym = Math.max(0, y - 1), yp = Math.min(h - 1, y + 1);
      const gx = f1[y * w + xp] - f1[y * w + xm];
      const gy = f1[yp * w + x] - f1[ym * w + x];
      g[y * w + x] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  const gb = gaussBlur(g, w, h, side * 0.014);
  const lo = percentile(f1, 0.01), hi = percentile(f1, 0.99);
  const span = Math.max(0.05, hi - lo);
  const gHi = Math.max(1e-4, percentile(gb, 0.98));
  const data = new Float32Array(n * 4);
  for (let j = 0; j < n; j++) {
    data[j * 4] = Math.min(1, Math.max(0, (f1[j] - lo) / span));
    data[j * 4 + 1] = Math.min(1, Math.max(0, (f2[j] - lo) / span));
    data[j * 4 + 2] = Math.min(1, Math.max(0, (f3[j] - lo) / span));
    data[j * 4 + 3] = Math.min(1, gb[j] / gHi);
  }
  return { data, w, h };
}
