// Zentraler Zustand: Bilder, Beiträge, Stories, Einstellungen (gespiegelt aus IndexedDB).
import { db, getSetting, setSetting } from './db.js';
import { uid, sortKey, todayISO, addDays, weekday, isoFromDate } from './util.js';
import { harmonizeTarget } from '../gl/looks.js';
import { BRAND_PRESETS } from '../stories/brand.js';

export const DEFAULT_SETTINGS = {
  account: { name: 'Mein Atelier', handle: 'mein.atelier', avatarImageId: null },
  rhythm: { days: [0, 2, 4], time: '18:00' },
  feedLook: { id: 'leinen', strength: 0.8, harmonize: 0.6 },
  exportWidth: 1080,
  jpegQuality: 0.92,
  hashtagLimit: 5,
  hashtagSets: [{ id: 'hs1', name: 'Beispiel', tags: '#fotografie #handgemacht #naturtöne' }],
  brand: { ...BRAND_PRESETS[0] },
  gridSquare: false,
  gridInfo: true,
  gridShowPublished: true,
  defaultFormat: '3:4',
  theme: 'auto',
};

const listeners = new Set();
const thumbUrls = new Map();

export const store = {
  images: new Map(),
  posts: new Map(),
  stories: new Map(),
  settings: structuredClone(DEFAULT_SETTINGS),
  _target: null,

  async load() {
    const [images, posts, stories] = await Promise.all([db.all('images'), db.all('posts'), db.all('stories')]);
    for (const i of images) this.images.set(i.id, i);
    for (const p of posts) this.posts.set(p.id, p);
    for (const s of stories) this.stories.set(s.id, s);
    const saved = await getSetting('settings', null);
    if (saved) this.settings = deepMerge(structuredClone(DEFAULT_SETTINGS), saved);
    this._target = null;
  },

  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  emit(type, detail) { this._target = null; for (const fn of listeners) { try { fn(type, detail); } catch (e) { console.error(e); } } },

  // ---------- Bilder ----------
  async addImage(prep, name) {
    const rec = { id: uid(), name: name || 'Bild', created: Date.now(), ...prep };
    await db.put('images', rec);
    this.images.set(rec.id, rec);
    this.emit('images');
    return rec;
  },
  async updateImage(rec) { await db.put('images', rec); this.images.set(rec.id, rec); this.emit('images'); },
  async deleteImage(id) {
    await db.del('images', id);
    this.images.delete(id);
    const u = thumbUrls.get(id);
    if (u) { URL.revokeObjectURL(u); thumbUrls.delete(id); }
    // aus Beiträgen/Stories entfernen
    for (const p of this.posts.values()) {
      const before = p.slides.length;
      p.slides = p.slides.filter((s) => s.imageId !== id);
      if (p.slides.length !== before) await db.put('posts', p);
    }
    for (const s of this.stories.values()) {
      let changed = false;
      for (const f of s.frames) {
        for (const slot of f.images || []) if (slot && slot.imageId === id) { slot.imageId = null; changed = true; }
      }
      if (changed) await db.put('stories', s);
    }
    this.emit('images');
  },
  thumbUrl(id) {
    if (thumbUrls.has(id)) return thumbUrls.get(id);
    const rec = this.images.get(id);
    if (!rec) return '';
    const u = URL.createObjectURL(rec.thumb);
    thumbUrls.set(id, u);
    return u;
  },
  usage(id) {
    let n = 0;
    for (const p of this.posts.values()) if (p.slides.some((s) => s.imageId === id)) n++;
    for (const s of this.stories.values()) if (s.frames.some((f) => (f.images || []).some((sl) => sl && sl.imageId === id))) n++;
    return n;
  },

  // ---------- Beiträge ----------
  newPost(patch = {}) {
    const now = Date.now();
    return {
      id: uid(), kind: 'post', date: null, time: this.settings.rhythm.time, status: 'idee',
      format: this.settings.defaultFormat, slides: [], lookId: 'feed', lookStrength: null, harmonize: true,
      adjust: {}, caption: '', notes: '', created: now, updated: now, ...patch,
    };
  },
  async savePost(p, { silent = false } = {}) {
    p.updated = Date.now();
    await db.put('posts', p);
    this.posts.set(p.id, p);
    if (!silent) this.emit('posts', p.id);
  },
  async deletePost(id) { await db.del('posts', id); this.posts.delete(id); this.emit('posts'); },
  sortedPosts() {
    return [...this.posts.values()].sort((a, b) => (sortKey(b) || '').localeCompare(sortKey(a) || '') || b.created - a.created);
  },

  // ---------- Stories ----------
  newStory(patch = {}) {
    const now = Date.now();
    return { id: uid(), kind: 'story', date: null, time: this.settings.rhythm.time, status: 'entwurf', title: '', frames: [], created: now, updated: now, ...patch };
  },
  async saveStory(s, { silent = false } = {}) {
    s.updated = Date.now();
    await db.put('stories', s);
    this.stories.set(s.id, s);
    if (!silent) this.emit('stories', s.id);
  },
  async deleteStory(id) { await db.del('stories', id); this.stories.delete(id); this.emit('stories'); },

  // ---------- Einstellungen ----------
  async saveSettings(patch) {
    this.settings = deepMerge(this.settings, patch);
    await setSetting('settings', this.settings);
    this.emit('settings');
  },

  /** Zielwerte für das Angleichen: Median aller Bilder in geplanten/veröffentlichten Beiträgen. */
  feedTarget() {
    if (this._target) return this._target;
    const stats = [];
    for (const p of this.posts.values()) {
      const s0 = p.slides[0] && this.images.get(p.slides[0].imageId);
      for (const sl of p.slides) { const im = this.images.get(sl.imageId); if (im && im.stats) stats.push(im.stats); }
      if (!p.slides.length && s0) stats.push(s0.stats);
    }
    if (stats.length < 2) for (const im of this.images.values()) if (im.stats) stats.push(im.stats);
    this._target = harmonizeTarget(stats);
    return this._target;
  },

  /** Nächster freier Termin laut Rhythmus (ab morgen). */
  nextFreeSlot(kind = 'post') {
    const days = this.settings.rhythm.days.length ? this.settings.rhythm.days : [0, 1, 2, 3, 4, 5, 6];
    const taken = new Set([...(kind === 'post' ? this.posts : this.stories).values()].filter((p) => p.date).map((p) => p.date));
    let d = addDays(todayISO(), 1);
    for (let i = 0; i < 400; i++) {
      if (days.includes(weekday(d)) && !taken.has(d)) return d;
      d = addDays(d, 1);
    }
    return isoFromDate(new Date());
  },
};

function deepMerge(a, b) {
  if (Array.isArray(b)) return b.slice();
  if (b && typeof b === 'object') {
    const out = a && typeof a === 'object' && !Array.isArray(a) ? { ...a } : {};
    for (const [k, v] of Object.entries(b)) out[k] = deepMerge(out[k], v);
    return out;
  }
  return b === undefined ? a : b;
}
