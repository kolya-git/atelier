// Story-Vorlagen. Grundsatz: Text steht nie auf dem Foto – immer im eigenen Bereich, im einheitlichen Stil.
import { uid } from '../core/util.js';

// Instagram-Oberfläche verdeckt oben ~14 % und unten ~18 % (Profilzeile, Antwortfeld).
export const SAFE_TOP = 0.135, SAFE_BOTTOM = 0.17;

export const TEMPLATES = [
  { id: 'bild', name: 'Vollbild', slots: 1, fields: [], bg: false, note: 'Nur das Foto, randlos.' },
  { id: 'rahmen', name: 'Passepartout', slots: 1, fields: ['label', 'title'], bg: true, note: 'Foto mit Rand und kleiner Bildunterschrift.' },
  { id: 'bildtext', name: 'Bild & Text', slots: 1, fields: ['label', 'title', 'body'], bg: true, note: 'Foto oben, Text darunter.' },
  { id: 'text', name: 'Textseite', slots: 0, fields: ['label', 'title', 'body'], bg: true, note: 'Nur Typografie.' },
  { id: 'zitat', name: 'Zitat', slots: 0, fields: ['title', 'label'], bg: true, note: 'Ein Satz, groß gesetzt.' },
  { id: 'duo', name: 'Zwei Bilder', slots: 2, fields: ['label'], bg: true, note: 'Zwei Fotos übereinander.' },
  { id: 'trio', name: 'Drei Bilder', slots: 3, fields: ['label'], bg: true, note: 'Ein großes, zwei kleine Fotos.' },
  { id: 'liste', name: 'Liste', slots: 0, fields: ['label', 'title', 'body'], bg: true, note: 'Nummerierte Punkte – eine Zeile pro Punkt.' },
  { id: 'serie', name: 'Serie', slots: 1, fields: ['label'], bg: true, note: 'Foto mit Nummer „02 / 05“.' },
  { id: 'neu', name: 'Neuer Beitrag', slots: 1, fields: ['label', 'title', 'body'], bg: true, note: 'Hinweis auf einen neuen Beitrag.' },
];
export const templateById = (id) => TEMPLATES.find((t) => t.id === id) || TEMPLATES[0];

export const FIELD_LABELS = {
  label: 'Kleine Zeile (Etikett)',
  title: 'Titel',
  body: 'Text',
};
export const FIELD_HINTS = {
  liste: { body: 'Eine Zeile pro Punkt' },
  zitat: { title: 'Zitat', label: 'Quelle / Name' },
  neu: { label: 'z. B. „Neuer Beitrag“', body: 'z. B. „Jetzt im Profil“' },
  serie: { label: 'Bildunterschrift (optional)' },
};

export function newFrame(template = 'bild', imageIds = []) {
  const t = templateById(template);
  const images = [];
  for (let i = 0; i < t.slots; i++) images.push({ imageId: imageIds[i] || null, crop: {} });
  const defaults = {
    neu: { label: 'Neuer Beitrag', title: '', body: 'Jetzt im Profil' },
    text: { label: '', title: '', body: '' },
  }[template] || {};
  return { id: uid(), template, images, fields: { label: '', title: '', body: '', ...defaults }, bg: 'paper' };
}

/** Sinnvolle Startfolge aus ausgewählten Bildern. */
export function framesFromImages(ids) {
  if (!ids.length) return [newFrame('text')];
  return ids.map((id, i) => newFrame(i === 0 ? 'rahmen' : 'bild', [id]));
}

/** Rahmen auf neue Vorlage umstellen, Bilder und Texte möglichst behalten. */
export function changeTemplate(frame, templateId) {
  const t = templateById(templateId);
  const old = (frame.images || []).filter((s) => s && s.imageId);
  const images = [];
  for (let i = 0; i < t.slots; i++) images.push(old[i] ? { ...old[i] } : { imageId: null, crop: {} });
  return { ...frame, template: templateId, images };
}

/**
 * Layout-Funktionen. k: Werkzeugkasten aus dem Renderer
 *   k.W, k.H, k.s (Maßstab), k.M (Rand), k.safeTop, k.safeBottom
 *   k.image(slotIndex, x, y, w, h) – Foto im Rechteck (cover)
 *   k.text(str, x, y, w, role, opts) → Höhe;  role: 'label' | 'title' | 'body' | 'quote' | 'small'
 *   k.measure(str, w, role, opts) → Höhe
 *   k.rule(x, y, w)
 */
export const LAYOUTS = {
  bild(k) { k.image(0, 0, 0, k.W, k.H); },

  rahmen(k, f) {
    const w = k.W - 2 * k.M, hgt = Math.round(w * 1.25);
    const label = f.fields.label, title = f.fields.title;
    const textH = (label ? k.measure(label, w, 'label') + 18 * k.s : 0) + (title ? k.measure(title, w, 'titleSmall') : 0);
    const avail = k.H - k.safeTop - k.safeBottom;
    const y = k.safeTop + Math.max(0, (avail - hgt - (textH ? textH + 48 * k.s : 0)) / 2);
    k.image(0, k.M, y, w, hgt);
    let ty = y + hgt + 44 * k.s;
    if (label) ty += k.text(label, k.M, ty, w, 'label') + 18 * k.s;
    if (title) k.text(title, k.M, ty, w, 'titleSmall');
  },

  bildtext(k, f) {
    const w = k.W - 2 * k.M;
    const { label, title, body } = f.fields;
    let textH = 0;
    if (label) textH += k.measure(label, w, 'label') + 26 * k.s;
    if (title) textH += k.measure(title, w, 'title') + 26 * k.s;
    if (body) textH += k.measure(body, w, 'body');
    const top = k.safeTop;
    const maxImg = k.H - k.safeBottom - top - textH - 70 * k.s;
    const hgt = Math.max(300 * k.s, Math.min(Math.round(w * 1.05), maxImg));
    k.image(0, k.M, top, w, hgt);
    let y = top + hgt + 64 * k.s;
    if (label) y += k.text(label, k.M, y, w, 'label') + 26 * k.s;
    if (title) y += k.text(title, k.M, y, w, 'title') + 26 * k.s;
    if (body) k.text(body, k.M, y, w, 'body');
  },

  text(k, f) {
    const w = k.W - 2 * k.M;
    const { label, title, body } = f.fields;
    let y = k.safeTop + 90 * k.s;
    if (label) { y += k.text(label, k.M, y, w, 'label') + 30 * k.s; k.rule(k.M, y, 120 * k.s); y += 70 * k.s; }
    if (title) y += k.text(title, k.M, y, w, 'titleLarge') + 54 * k.s;
    if (body) k.text(body, k.M, y, w * 0.92, 'body');
  },

  zitat(k, f) {
    const w = k.W - 2 * k.M - 30 * k.s;
    const q = f.fields.title || '';
    const qh = k.measure(q, w, 'quote');
    const lh = f.fields.label ? k.measure(f.fields.label, w, 'label') + 50 * k.s : 0;
    const avail = k.H - k.safeTop - k.safeBottom;
    let y = k.safeTop + Math.max(40 * k.s, (avail - qh - lh) / 2);
    y += k.text(q, k.M, y, w, 'quote') + 50 * k.s;
    if (f.fields.label) { k.rule(k.M, y - 14 * k.s, 60 * k.s); k.text(f.fields.label, k.M, y + 8 * k.s, w, 'label'); }
  },

  duo(k, f) {
    const w = k.W - 2 * k.M;
    const gut = 24 * k.s;
    const lab = f.fields.label;
    const labH = lab ? k.measure(lab, w, 'label') + 36 * k.s : 0;
    const top = k.safeTop;
    const avail = k.H - k.safeBottom - top - labH;
    const hgt = Math.floor((avail - gut) / 2);
    k.image(0, k.M, top, w, hgt);
    k.image(1, k.M, top + hgt + gut, w, hgt);
    if (lab) k.text(lab, k.M, top + 2 * hgt + gut + 36 * k.s, w, 'label');
  },

  trio(k, f) {
    const w = k.W - 2 * k.M;
    const gut = 24 * k.s;
    const lab = f.fields.label;
    const labH = lab ? k.measure(lab, w, 'label') + 36 * k.s : 0;
    const top = k.safeTop;
    const avail = k.H - k.safeBottom - top - labH;
    const bigH = Math.floor((avail - gut) * 0.6), smallH = avail - gut - bigH;
    const sw = Math.floor((w - gut) / 2);
    k.image(0, k.M, top, w, bigH);
    k.image(1, k.M, top + bigH + gut, sw, smallH);
    k.image(2, k.M + sw + gut, top + bigH + gut, w - sw - gut, smallH);
    if (lab) k.text(lab, k.M, top + avail + 36 * k.s, w, 'label');
  },

  liste(k, f) {
    const w = k.W - 2 * k.M;
    const { label, title, body } = f.fields;
    let y = k.safeTop + 90 * k.s;
    if (label) { y += k.text(label, k.M, y, w, 'label') + 30 * k.s; k.rule(k.M, y, 120 * k.s); y += 64 * k.s; }
    if (title) y += k.text(title, k.M, y, w, 'title') + 56 * k.s;
    const items = String(body || '').split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 7);
    const numW = 86 * k.s;
    items.forEach((it, i) => {
      k.text(String(i + 1).padStart(2, '0'), k.M, y + 6 * k.s, numW, 'label');
      y += k.text(it, k.M + numW, y, w - numW, 'body') + 34 * k.s;
    });
  },

  serie(k, f) {
    const w = k.W - 2 * k.M;
    const lab = f.fields.label;
    const idx = k.index ? `${String(k.index[0]).padStart(2, '0')} / ${String(k.index[1]).padStart(2, '0')}` : '';
    const top = k.safeTop + 70 * k.s;
    if (idx) k.text(idx, k.M, k.safeTop + 4 * k.s, w, 'label');
    const labH = lab ? k.measure(lab, w, 'small') + 40 * k.s : 0;
    const hgt = Math.min(Math.round(w * 1.3), k.H - k.safeBottom - top - labH);
    k.image(0, k.M, top, w, hgt);
    if (lab) k.text(lab, k.M, top + hgt + 36 * k.s, w, 'small');
  },

  neu(k, f) {
    const { label, title, body } = f.fields;
    const w = Math.round((k.W - 2 * k.M) * 0.78);
    const x = Math.round((k.W - w) / 2);
    const hgt = Math.round(w * 4 / 3);
    let y = k.safeTop + 40 * k.s;
    if (label) y += k.text(label, x, y, w, 'label', { align: 'center' }) + 40 * k.s;
    k.image(0, x, y, w, hgt);
    y += hgt + 54 * k.s;
    if (title) y += k.text(title, x - 40 * k.s, y, w + 80 * k.s, 'titleSmall', { align: 'center' }) + 24 * k.s;
    if (body) k.text(body, x, y, w, 'small', { align: 'center' });
  },
};
