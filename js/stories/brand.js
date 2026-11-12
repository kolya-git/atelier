// Story-Stil: Schrift, Farben, Abstände. Einheitlich, ruhig, redaktionell – nicht verspielt.
import { rgbToOklab, oklabToRgb, rgbToHex, hexToOklch, oklch, clamp } from '../core/util.js';

export const BRAND_PRESETS = [
  {
    id: 'papier', name: 'Papier',
    bg: '#f2ede4', ink: '#2a2723', muted: '#8b8378', accent: '#9a6a4c', alt: '#2a2723', altInk: '#f2ede4',
    display: 'Cormorant Garamond', displayWeight: 500, text: 'EB Garamond', textWeight: 400,
    label: 'IBM Plex Mono', labelWeight: 400, labelCase: 'upper', labelTracking: 0.12,
    align: 'left', margin: 96, titleSize: 80, bodySize: 37, labelSize: 22, texture: 0.5, rule: true,
  },
  {
    id: 'archiv', name: 'Archiv',
    bg: '#e9e6df', ink: '#23221f', muted: '#7d7a73', accent: '#6b5a48', alt: '#23221f', altInk: '#e9e6df',
    display: 'Newsreader', displayWeight: 400, text: 'Newsreader', textWeight: 400,
    label: 'IBM Plex Mono', labelWeight: 400, labelCase: 'upper', labelTracking: 0.08,
    align: 'left', margin: 88, titleSize: 70, bodySize: 35, labelSize: 21, texture: 0.65, rule: true,
  },
  {
    id: 'stein', name: 'Stein',
    bg: '#ebe9e5', ink: '#2b2d2f', muted: '#85878a', accent: '#5d6670', alt: '#2b2d2f', altInk: '#ebe9e5',
    display: 'Jost', displayWeight: 300, text: 'Hanken Grotesk', textWeight: 400,
    label: 'Hanken Grotesk', labelWeight: 500, labelCase: 'upper', labelTracking: 0.18,
    align: 'left', margin: 92, titleSize: 68, bodySize: 33, labelSize: 21, texture: 0.25, rule: false,
  },
  {
    id: 'nacht', name: 'Nacht',
    bg: '#1f1d1b', ink: '#ece6dc', muted: '#9a9288', accent: '#b48a68', alt: '#ece6dc', altInk: '#1f1d1b',
    display: 'Cormorant Garamond', displayWeight: 400, text: 'EB Garamond', textWeight: 400,
    label: 'IBM Plex Mono', labelWeight: 400, labelCase: 'upper', labelTracking: 0.12,
    align: 'left', margin: 96, titleSize: 82, bodySize: 37, labelSize: 22, texture: 0.35, rule: true,
  },
  {
    id: 'ton', name: 'Ton',
    bg: '#8e5f4a', ink: '#f6eee4', muted: '#e1c9b8', accent: '#f6eee4', alt: '#f3ebe1', altInk: '#5e3c2e',
    display: 'Newsreader', displayWeight: 400, text: 'Hanken Grotesk', textWeight: 400,
    label: 'IBM Plex Mono', labelWeight: 400, labelCase: 'upper', labelTracking: 0.1,
    align: 'left', margin: 96, titleSize: 74, bodySize: 34, labelSize: 21, texture: 0.4, rule: true,
  },
  {
    id: 'moos', name: 'Moos',
    bg: '#3e4839', ink: '#eeeadf', muted: '#b5b5a0', accent: '#c9b98f', alt: '#eeeadf', altInk: '#3e4839',
    display: 'Cormorant Garamond', displayWeight: 500, text: 'Hanken Grotesk', textWeight: 400,
    label: 'IBM Plex Mono', labelWeight: 400, labelCase: 'upper', labelTracking: 0.12,
    align: 'left', margin: 96, titleSize: 80, bodySize: 33, labelSize: 21, texture: 0.4, rule: true,
  },
];

/**
 * Farbpalette aus Bildern: gedämpfte Töne, die zu den Fotos passen.
 * pixelsList: Array von RGBA-Arrays (kleine Vorschauen).
 */
export function paletteFromPixels(pixelsList) {
  const pts = [];
  for (const px of pixelsList) {
    for (let i = 0; i < px.length; i += 4 * 3) {
      if (px[i + 3] < 128) continue;
      pts.push(rgbToOklab(px[i], px[i + 1], px[i + 2]));
    }
  }
  if (pts.length < 20) return null;
  const k = 6;
  // k-means++-artige Startwerte: nach Helligkeit verteilt
  const sorted = pts.slice().sort((a, b) => a[0] - b[0]);
  let cents = Array.from({ length: k }, (_, i) => sorted[Math.floor(((i + 0.5) / k) * sorted.length)].slice());
  const assign = new Int32Array(pts.length);
  for (let it = 0; it < 10; it++) {
    for (let p = 0; p < pts.length; p++) {
      let best = 0, bd = Infinity;
      for (let c = 0; c < k; c++) {
        const d = (pts[p][0] - cents[c][0]) ** 2 + (pts[p][1] - cents[c][1]) ** 2 + (pts[p][2] - cents[c][2]) ** 2;
        if (d < bd) { bd = d; best = c; }
      }
      assign[p] = best;
    }
    const sums = Array.from({ length: k }, () => [0, 0, 0, 0]);
    for (let p = 0; p < pts.length; p++) { const s = sums[assign[p]]; s[0] += pts[p][0]; s[1] += pts[p][1]; s[2] += pts[p][2]; s[3]++; }
    cents = sums.map((s, i) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3], s[3]] : cents[i]));
  }
  const clusters = cents.map((c) => ({ L: c[0], a: c[1], b: c[2], C: Math.hypot(c[1], c[2]), h: Math.atan2(c[2], c[1]), n: c[3] || 0 }));
  const byL = clusters.slice().sort((x, y) => x.L - y.L);
  const dark = byL[0], light = byL[byL.length - 1];
  const chromatic = clusters.filter((c) => c.L > 0.35 && c.L < 0.8).sort((x, y) => y.C * Math.sqrt(y.n) - x.C * Math.sqrt(x.n))[0] || clusters[2];
  const mk = (L, C, h) => rgbToHex(...oklabToRgb(L, C * Math.cos(h), C * Math.sin(h)));
  const bg = mk(0.945, Math.min(light.C, 0.018), light.h);
  const ink = mk(0.25, Math.min(dark.C, 0.022), dark.h);
  const accent = mk(0.52, clamp(chromatic.C, 0.035, 0.085), chromatic.h);
  const muted = mk(0.6, Math.min(light.C, 0.02), light.h);
  return { bg, ink, accent, muted, alt: ink, altInk: bg };
}

/** Lesbarkeit: relative Helligkeit (für Kontrast-Hinweise). */
export function contrastRatio(hexA, hexB) {
  const lum = (hex) => {
    const [L] = hexToOklch(hex);
    return L;
  };
  const a = lum(hexA), b = lum(hexB);
  return Math.abs(a - b);
}

export { oklch };
