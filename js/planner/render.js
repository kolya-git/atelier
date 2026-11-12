// Bilder für Planer & Stories mit Look rendern (gemeinsamer WebGL-Kontext, Textur-Cache).
import { getEngine, IDENTITY_ORIENT } from '../gl/engine.js';
import { lookUniforms, harmonizeFor, NEUTRAL_HARM } from '../gl/looks.js';
import { loadImage, makeCanvas, blobAndRelease } from '../core/imageio.js';
import { store } from '../core/store.js';
import { clamp } from '../core/util.js';

const texCache = new Map(); // key → {tex, w, h, last}
const MAX_FULL = 4, MAX_THUMB = 24;

async function getTexture(imageId, variant = 'full') {
  hookRestore();
  const key = imageId + ':' + variant;
  const hit = texCache.get(key);
  if (hit) { hit.last = performance.now(); return hit; }
  const rec = store.images.get(imageId);
  if (!rec) return null;
  const img = await loadImage(variant === 'full' ? rec.blob : rec.thumb);
  const eng = getEngine();
  const entry = { tex: eng.texture(img, { mipmap: true }), w: img.naturalWidth, h: img.naturalHeight, last: performance.now(), variant };
  texCache.set(key, entry);
  // aufräumen
  const same = [...texCache.entries()].filter(([, v]) => v.variant === variant).sort((a, b) => a[1].last - b[1].last);
  const max = variant === 'full' ? MAX_FULL : MAX_THUMB;
  while (same.length > max) { const [k, v] = same.shift(); eng.deleteTexture(v.tex); texCache.delete(k); }
  return entry;
}

// Verliert iPadOS den Grafik-Kontext (z. B. lange im Hintergrund), sind alle Texturen weg.
let restoreHooked = false;
function hookRestore() {
  if (restoreHooked) return;
  restoreHooked = true;
  getEngine().restoreHandlers.add(() => texCache.clear());
}

export function dropTextures(imageId) {
  const eng = getEngine();
  for (const [k, v] of texCache) if (k.startsWith(imageId + ':')) { eng.deleteTexture(v.tex); texCache.delete(k); }
}

/** Ausschnitt-Rechteck (UV) für Bild-Seitenverhältnis a und Rahmen-Seitenverhältnis A. */
export function cropRect(a, A, crop = {}) {
  const zoom = Math.max(1, crop.zoom || 1);
  let cw, ch;
  if (a > A) { ch = 1 / zoom; cw = (A / a) / zoom; } else { cw = 1 / zoom; ch = (a / A) / zoom; }
  const cx = clamp(crop.cx ?? 0.5, cw / 2, 1 - cw / 2);
  const cy = clamp(crop.cy ?? 0.5, ch / 2, 1 - ch / 2);
  return [cx - cw / 2, cy - ch / 2, cx + cw / 2, cy + ch / 2];
}

export const ASPECTS = { '3:4': 3 / 4, '4:5': 4 / 5, '1:1': 1, '9:16': 9 / 16, '16:9': 16 / 9 };

/** Look-Einstellungen eines Beitrags (inkl. Feed-Look und Angleichen) auflösen. */
export function resolveLook(post, imageId) {
  const s = store.settings;
  const feed = s.feedLook;
  const lookId = !post || post.lookId === 'feed' || !post.lookId ? feed.id : post.lookId;
  const strength = post && post.lookStrength != null ? post.lookStrength : feed.strength;
  let harm = NEUTRAL_HARM;
  const doHarm = post ? post.harmonize !== false : true;
  if (doHarm && feed.harmonize > 0) {
    const im = store.images.get(imageId);
    const target = store.feedTarget();
    if (im && im.stats && target) harm = harmonizeFor(im.stats, target, feed.harmonize);
  }
  return { lookId, strength, adjust: (post && post.adjust) || {}, harm };
}

export function lookKey(look) {
  const h = look.harm;
  return [look.lookId, look.strength.toFixed(2), JSON.stringify(look.adjust || {}),
    h.exposure.toFixed(3), h.contrast.toFixed(3), h.sat.toFixed(3), h.gain.map((v) => v.toFixed(3)).join(',')].join('|');
}

/**
 * Rendert einen Ausschnitt in ein 2D-Canvas.
 * opts: {crop:[x0,y0,x1,y1] | null, outW, outH, look, variant, lookOn}
 */
export async function renderImage(imageId, { crop, outW, outH, look, variant = 'full', lookOn = true, grainPx } = {}) {
  const t = await getTexture(imageId, variant);
  if (!t) return null;
  const eng = getEngine();
  const w = Math.max(1, Math.round(outW)), h = Math.max(1, Math.round(outH));
  const lk = look || { lookId: 'original', strength: 1, adjust: {}, harm: NEUTRAL_HARM };
  // Korngröße relativ zur Ausgabebreite (wirkt auf 1080 px wie feines Filmkorn)
  const gs = grainPx || Math.max(0.6, w / 1000);
  const u = {
    u_outSize: [w, h], u_tile: [0, 0, w, h], u_flipY: 1, u_seed: 4242,
    u_orient: IDENTITY_ORIENT, u_srcSize: [t.w, t.h], u_cubicB: 1 / 3, u_cubicC: 1 / 3,
    u_crop: crop || [0, 0, 1, 1], u_lookOn: lookOn ? 1 : 0,
    ...lookUniforms(lk.lookId, lk.strength, lk.adjust, lk.harm, { grainSize: gs, grainScale: Math.min(1, w / 700) }),
  };
  eng.draw('look', u, { u_src: t.tex }, { w, h });
  const out = makeCanvas(w, h);
  eng.blitTo(out);
  return out;
}

/** Ein Slide eines Beitrags in Instagram-Größe als JPEG. */
export async function renderSlideBlob(post, slide, width) {
  const im = store.images.get(slide.imageId);
  if (!im) return null;
  const A = ASPECTS[post.format] || 0.75;
  const W = width || store.settings.exportWidth || 1080;
  const H = Math.round(W / A);
  const crop = cropRect(im.w / im.h, A, slide.crop);
  const c = await renderImage(slide.imageId, { crop, outW: W, outH: H, look: resolveLook(post, slide.imageId) });
  return blobAndRelease(c, 'image/jpeg', store.settings.jpegQuality || 0.92);
}

// ---------- Vorschau-Kacheln (Cache als Objekt-URLs) ----------
const tileCache = new Map();
export async function tileUrl(post, { w = 360 } = {}) {
  const slide = post.slides[0];
  if (!slide) return '';
  const im = store.images.get(slide.imageId);
  if (!im) return '';
  const A = ASPECTS[post.format] || 0.75;
  const look = resolveLook(post, slide.imageId);
  const crop = cropRect(im.w / im.h, A, slide.crop);
  const key = [slide.imageId, post.format, crop.map((v) => v.toFixed(4)).join(','), lookKey(look), w].join('#');
  if (tileCache.has(key)) return tileCache.get(key);
  const p = (async () => {
    const c = await renderImage(slide.imageId, { crop, outW: w, outH: Math.round(w / A), look, variant: 'thumb' });
    const b = await blobAndRelease(c, 'image/jpeg', 0.86);
    return URL.createObjectURL(b);
  })();
  tileCache.set(key, p);
  if (tileCache.size > 400) {
    const first = tileCache.keys().next().value;
    Promise.resolve(tileCache.get(first)).then((u) => u && URL.revokeObjectURL(u));
    tileCache.delete(first);
  }
  return p;
}

/** Look-Vorschau eines Bildes (für die Look-Auswahl). */
export async function lookPreviewUrl(imageId, lookId, strength, harm) {
  const key = ['lp', imageId, lookId, strength.toFixed(2), harm ? harm.exposure.toFixed(3) + harm.gain.join(',') : ''].join('#');
  if (tileCache.has(key)) return tileCache.get(key);
  const p = (async () => {
    const im = store.images.get(imageId);
    const crop = cropRect(im.w / im.h, 0.8, {});
    const c = await renderImage(imageId, { crop, outW: 160, outH: 200, variant: 'thumb', look: { lookId, strength, adjust: {}, harm: harm || NEUTRAL_HARM } });
    return URL.createObjectURL(await blobAndRelease(c, 'image/jpeg', 0.85));
  })();
  tileCache.set(key, p);
  return p;
}
