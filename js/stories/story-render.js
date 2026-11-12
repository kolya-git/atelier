// Story-Seiten zeichnen (Canvas 1080 × 1920). Typografie nach festen Regeln des Story-Stils.
import { fontStack, ensureFonts, FONTS } from '../core/fonts.js';
import { LAYOUTS, templateById, SAFE_TOP, SAFE_BOTTOM } from './templates.js';
import { renderImage, cropRect, resolveLook } from '../planner/render.js';
import { store } from '../core/store.js';
import { makeCanvas, blobAndRelease, releaseCanvas } from '../core/imageio.js';
import { hexToRgb, rgbToHex, hexToOklch, rng } from '../core/util.js';

let paper = null;
function paperPattern() {
  if (paper) return paper;
  const N = 384;
  const c = makeCanvas(N, N), g = c.getContext('2d');
  const img = g.createImageData(N, N);
  const r = rng(77);
  // glatte Wolken (Wertrauschen, kachelbar) + feines Korn
  const G = 12;
  const grid = Array.from({ length: G * G }, () => r());
  const at = (x, y) => grid[((y % G) + G) % G * G + (((x % G) + G) % G)];
  const sm = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const fx = (x / N) * G, fy = (y / N) * G;
      const ix = Math.floor(fx), iy = Math.floor(fy), tx = sm(fx - ix), ty = sm(fy - iy);
      const v = (at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx) * (1 - ty) + (at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx) * ty;
      const n = 128 + (v - 0.5) * 30 + (r() - 0.5) * 34;
      const i = (y * N + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = n; img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  paper = c;
  return c;
}

const mix = (a, b, t) => { const A = hexToRgb(a), B = hexToRgb(b); return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); };

export function frameColors(frame, brand) {
  const v = frame.bg || 'paper';
  if (v === 'ink') return { bg: brand.alt, ink: brand.altInk, muted: mix(brand.altInk, brand.alt, 0.38) };
  if (v === 'accent') {
    const light = hexToOklch(brand.accent)[0] > 0.62;
    const ink = light ? brand.ink : brand.bg;
    return { bg: brand.accent, ink, muted: mix(ink, brand.accent, 0.32) };
  }
  return { bg: brand.bg, ink: brand.ink, muted: brand.muted };
}

function roleStyle(role, brand, s) {
  const italicOk = (fam) => !!(FONTS[fam] && FONTS[fam].italic);
  switch (role) {
    case 'label': return { family: brand.label, weight: brand.labelWeight, size: brand.labelSize * s, lh: 1.35, upper: brand.labelCase === 'upper', track: brand.labelTracking || 0, color: 'muted' };
    case 'title': return { family: brand.display, weight: brand.displayWeight, size: brand.titleSize * s, lh: 1.1, color: 'ink', balance: true };
    case 'titleLarge': return { family: brand.display, weight: brand.displayWeight, size: brand.titleSize * 1.2 * s, lh: 1.06, color: 'ink', balance: true };
    case 'titleSmall': return { family: brand.display, weight: brand.displayWeight, size: brand.titleSize * 0.6 * s, lh: 1.18, color: 'ink', balance: true };
    case 'quote': return { family: brand.display, weight: brand.displayWeight, size: brand.titleSize * 0.92 * s, lh: 1.16, color: 'ink', italic: italicOk(brand.display), balance: true };
    case 'small': return { family: brand.text, weight: brand.textWeight, size: brand.bodySize * 0.8 * s, lh: 1.4, color: 'muted' };
    default: return { family: brand.text, weight: brand.textWeight, size: brand.bodySize * s, lh: 1.42, color: 'ink' };
  }
}

function setFont(g, st) {
  g.font = `${st.italic ? 'italic ' : ''}${st.weight} ${st.size}px ${fontStack(st.family)}`;
}
function textWidth(g, str, st) {
  if (!st.track) return g.measureText(str).width;
  let w = 0;
  for (const ch of str) w += g.measureText(ch).width;
  return w + st.track * st.size * Math.max(0, [...str].length - 1);
}
function wrapLines(g, text, maxW, st) {
  const out = [];
  for (const para of String(text).split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(''); continue; }
    let line = words[0];
    for (let i = 1; i < words.length; i++) {
      const test = line + ' ' + words[i];
      if (textWidth(g, test, st) <= maxW) line = test;
      else { out.push(line); line = words[i]; }
    }
    out.push(line);
  }
  return out;
}
/** Ausgeglichene Zeilen für Überschriften (kein einsames Wort am Ende). */
function layoutLines(g, text, maxW, st) {
  let lines = wrapLines(g, text, maxW, st);
  if (st.balance && lines.length > 1 && !String(text).includes('\n')) {
    const n = lines.length;
    let best = lines;
    for (let f = 0.97; f >= 0.66; f -= 0.03) {
      const l = wrapLines(g, text, maxW * f, st);
      if (l.length !== n) break;
      best = l;
    }
    lines = best;
  }
  return lines;
}

function drawTracked(g, str, x, y, st) {
  if (!st.track) { g.fillText(str, x, y); return; }
  let cx = x;
  for (const ch of str) { g.fillText(ch, cx, y); cx += g.measureText(ch).width + st.track * st.size; }
}

/**
 * Zeichnet eine Story-Seite.
 * opts: { W, H, index:[n, total], placeholder: true|false }
 */
export async function renderFrame(frame, brand, { W = 1080, H = 1920, index, placeholder = true } = {}) {
  await ensureFonts();
  const s = W / 1080;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const col = frameColors(frame, brand);
  const t = templateById(frame.template);
  g.fillStyle = col.bg;
  g.fillRect(0, 0, W, H);
  if (brand.texture > 0 && t.id !== 'bild') {
    g.save();
    g.globalCompositeOperation = 'soft-light';
    g.globalAlpha = Math.min(1, brand.texture * 0.9);
    const pat = g.createPattern(paperPattern(), 'repeat');
    g.scale(s * 1.4, s * 1.4);
    g.fillStyle = pat;
    g.fillRect(0, 0, W / (s * 1.4) + 1, H / (s * 1.4) + 1);
    g.restore();
  }
  const ops = [];
  const measure = (str, w, role, opts = {}) => {
    if (!str) return 0;
    const st = { ...roleStyle(role, brand, s), ...opts };
    setFont(g, st);
    const txt = st.upper ? str.toUpperCase() : str;
    return layoutLines(g, txt, w, st).length * st.size * st.lh;
  };
  const k = {
    W, H, s, M: (brand.margin || 96) * s, safeTop: SAFE_TOP * H, safeBottom: SAFE_BOTTOM * H, index,
    image: (i, x, y, w, h) => ops.push({ type: 'image', i, x, y, w, h }),
    text: (str, x, y, w, role, opts = {}) => { if (!str) return 0; ops.push({ type: 'text', str, x, y, w, role, opts }); return measure(str, w, role, opts); },
    measure,
    rule: (x, y, w) => ops.push({ type: 'rule', x, y, w }),
  };
  (LAYOUTS[t.id] || LAYOUTS.bild)(k, frame);

  for (const op of ops) {
    if (op.type !== 'image') continue;
    const slot = (frame.images || [])[op.i];
    const x = Math.round(op.x), y = Math.round(op.y), w = Math.round(op.w), h = Math.round(op.h);
    const im = slot && slot.imageId && store.images.get(slot.imageId);
    if (im) {
      const crop = cropRect(im.w / im.h, w / h, slot.crop);
      const variant = w * h > 300 * 400 ? 'full' : 'thumb';
      const ic = await renderImage(slot.imageId, { crop, outW: w, outH: h, look: resolveLook(null, slot.imageId), variant });
      if (ic) { g.drawImage(ic, x, y, w, h); releaseCanvas(ic); }
    } else if (placeholder) {
      g.fillStyle = mix(col.bg, col.ink, 0.08);
      g.fillRect(x, y, w, h);
      g.fillStyle = col.muted;
      g.font = `400 ${26 * s}px ${fontStack('IBM Plex Mono')}`;
      g.textAlign = 'center';
      g.fillText('Bild wählen', x + w / 2, y + h / 2);
      g.textAlign = 'left';
    }
  }
  g.textBaseline = 'alphabetic';
  for (const op of ops) {
    if (op.type === 'rule') {
      g.fillStyle = col.muted;
      g.globalAlpha = 0.7;
      g.fillRect(Math.round(op.x), Math.round(op.y), Math.round(op.w), Math.max(1, Math.round(2 * s)));
      g.globalAlpha = 1;
    } else if (op.type === 'text') {
      const st = { ...roleStyle(op.role, brand, s), ...op.opts };
      setFont(g, st);
      g.fillStyle = st.color === 'muted' ? col.muted : col.ink;
      const txt = st.upper ? op.str.toUpperCase() : op.str;
      const lines = layoutLines(g, txt, op.w, st);
      const align = op.opts.align || brand.align || 'left';
      let y = op.y + st.size * 0.86;
      for (const line of lines) {
        const lw = textWidth(g, line, st);
        const x = align === 'center' ? op.x + (op.w - lw) / 2 : op.x;
        drawTracked(g, line, x, y, st);
        y += st.size * st.lh;
      }
    }
  }
  return c;
}

export async function frameBlob(frame, brand, index) {
  const c = await renderFrame(frame, brand, { index, placeholder: false });
  return blobAndRelease(c, 'image/jpeg', 0.94);
}

const coverCache = new Map();
export async function storyCoverUrl(story, w = 120) {
  if (!story.frames.length) return '';
  const brand = store.settings.brand;
  const key = [story.id, story.updated, JSON.stringify(brand).length, brand.bg, brand.display, w, store.settings.feedLook.id].join('|');
  if (coverCache.has(key)) return coverCache.get(key);
  const p = (async () => {
    const H = Math.round((w * 16) / 9);
    const c = await renderFrame(story.frames[0], brand, { W: w, H, index: [1, story.frames.length] });
    return URL.createObjectURL(await blobAndRelease(c, 'image/jpeg', 0.85));
  })();
  coverCache.set(key, p);
  return p;
}
