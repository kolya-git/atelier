// Kleine Helfer.
import { IN_CLAUDE, claudeSaves, saveWithClaude } from './platform.js';
import { toast } from './ui.js';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

export function uid() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export function debounce(fn, ms = 250) {
  let t = 0;
  const d = (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  d.flush = (...args) => { clearTimeout(t); fn(...args); };
  d.cancel = () => clearTimeout(t);
  return d;
}

/** Ruft fn höchstens einmal pro Frame auf (mit den letzten Argumenten). */
export function rafThrottle(fn) {
  let queued = false, lastArgs = null;
  return (...args) => {
    lastArgs = args;
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; fn(...lastArgs); });
  };
}

// ---------- Datum (immer lokale Zeit, ISO-Strings "YYYY-MM-DD") ----------
const pad = (n) => String(n).padStart(2, '0');
export const isoFromDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function dateFromISO(iso, time = '12:00') {
  const [y, m, d] = iso.split('-').map(Number);
  const [hh, mm] = (time || '12:00').split(':').map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0);
}
export const todayISO = () => isoFromDate(new Date());
export function addDays(iso, n) { const d = dateFromISO(iso); d.setDate(d.getDate() + n); return isoFromDate(d); }
/** Wochentag mit Montag = 0 */
export const weekday = (iso) => (dateFromISO(iso).getDay() + 6) % 7;
export const WEEKDAYS_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
export const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

export function fmtDate(iso, { weekday: wd = true, year = false } = {}) {
  if (!iso) return 'ohne Datum';
  const d = dateFromISO(iso);
  const opts = { day: 'numeric', month: 'short' };
  if (wd) opts.weekday = 'short';
  if (year) opts.year = 'numeric';
  return d.toLocaleDateString('de-DE', opts);
}
export function fmtDateLong(iso) {
  if (!iso) return 'ohne Datum';
  return dateFromISO(iso).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
export function relDay(iso) {
  if (!iso) return '';
  const diff = Math.round((dateFromISO(iso, '12:00') - dateFromISO(todayISO(), '12:00')) / 86400000);
  if (diff === 0) return 'heute';
  if (diff === 1) return 'morgen';
  if (diff === -1) return 'gestern';
  if (diff > 1 && diff < 7) return `in ${diff} Tagen`;
  if (diff < 0 && diff > -7) return `vor ${-diff} Tagen`;
  return '';
}
export const sortKey = (item) => (item.date ? `${item.date}T${item.time || '12:00'}` : '');

// ---------- Dateien ----------
export function fileSafe(s, fallback = 'datei') {
  const t = String(s || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-zA-Z0-9-_ ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase();
  return (t || fallback).slice(0, 48);
}

export function bytesFmt(n) {
  if (!Number.isFinite(n)) return '–';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
  if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0).replace('.', ',') + ' MB';
  return (n / 1024 / 1024 / 1024).toFixed(2).replace('.', ',') + ' GB';
}

export const num = (v, digits = 0) => Number(v).toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });

function reportSave(r, name) {
  if (r === 'unsupported') toast(`„${name}“ kann hier nicht gesichert werden (Dateityp).`, { bad: true });
  else if (r === 'too_large') toast('Die Datei ist für diesen Weg zu groß.', { bad: true });
  else if (r === 'unavailable') toast('Sichern ist in dieser Ansicht nicht verfügbar.', { bad: true });
}

/** Lädt eine Datei herunter – in Claude über dessen Sichern-Dialog. */
export async function downloadBlob(blob, name) {
  if (IN_CLAUDE && (await claudeSaves())) {
    const r = await saveWithClaude(blob, name);
    reportSave(r, name);
    return r;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'downloaded';
}

export function canShareFiles(files) {
  if (IN_CLAUDE) return false;
  try { return !!(navigator.canShare && navigator.share && navigator.canShare({ files })); } catch { return false; }
}

/**
 * Teilt Dateien über das iOS-Teilen-Menü (Fotos sichern, Instagram, Dateien …)
 * oder lädt sie herunter, falls Teilen nicht verfügbar ist.
 * Muss direkt aus einer Nutzeraktion (Tippen) aufgerufen werden.
 */
export async function shareOrDownload(files, { title = 'Atelier', text } = {}) {
  // In Claude: jede Datei einzeln über den Sichern-Dialog (in der iPad-App öffnet sich das Teilen-Menü)
  if (IN_CLAUDE && (await claudeSaves())) {
    let saved = 0;
    for (const f of files) {
      const r = await saveWithClaude(f, f.name);
      if (r !== 'saved') { if (r !== 'declined') reportSave(r, f.name); break; }
      saved++;
    }
    return saved ? 'saved' : 'aborted';
  }
  if (canShareFiles(files)) {
    try {
      await navigator.share({ files, title, text });
      return 'shared';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'aborted';
      // NotAllowedError (z. B. Geste abgelaufen) → Download als Rückfall
    }
  }
  for (const f of files) { downloadBlob(f, f.name); await sleep(350); }
  return 'downloaded';
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// ---------- Farben ----------
export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const rgbToHex = (r, g, b) => '#' + [r, g, b].map((x) => clamp(Math.round(x), 0, 255).toString(16).padStart(2, '0')).join('');
export const hexToUnit = (hex) => hexToRgb(hex).map((v) => v / 255);

const s2l = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const l2s = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
export const srgbToLinear = s2l;
export const linearToSrgb = l2s;

export function rgbToOklab(r, g, b) { // r,g,b in 0..255 (sRGB)
  const lr = s2l(r / 255), lg = s2l(g / 255), lb = s2l(b / 255);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}
export function oklabToRgb(L, a, b) { // → sRGB 0..255
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(L - 0.0894841775 * a - 1.2914855480 * b, 3);
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  return [l2s(clamp(r, 0, 1)) * 255, l2s(clamp(g, 0, 1)) * 255, l2s(clamp(bb, 0, 1)) * 255];
}
export function oklch(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  return rgbToHex(...oklabToRgb(L, C * Math.cos(h), C * Math.sin(h)));
}
export function hexToOklch(hex) {
  const [L, a, b] = rgbToOklab(...hexToRgb(hex));
  return [L, Math.hypot(a, b), ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360];
}

/** Deterministischer Zufall (Mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
