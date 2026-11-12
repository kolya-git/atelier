// Feed-Look: ein gemeinsamer Look für alle Beiträge + automatisches Angleichen der Serie.
import { h, openSheet, slider, toggle, segmented } from '../core/ui.js';
import { store } from '../core/store.js';
import { LOOKS } from '../gl/looks.js';
import { lookPreviewUrl } from './render.js';
import { harmonizeFor } from '../gl/looks.js';

export function sampleImageId() {
  for (const p of store.sortedPosts()) if (p.slides[0] && store.images.has(p.slides[0].imageId)) return p.slides[0].imageId;
  const first = store.images.keys().next();
  return first.done ? null : first.value;
}

/** Leiste mit Look-Vorschaubildern. */
export function lookStrip(current, onPick, { imageId, includeFeed = false, strength = 0.8 } = {}) {
  const strip = h('div.look-strip');
  const items = includeFeed ? [{ id: 'feed', name: 'Feed-Look', note: 'wie alle anderen' }, ...LOOKS] : LOOKS;
  const target = store.feedTarget();
  const im = imageId && store.images.get(imageId);
  const harm = im && im.stats && target ? harmonizeFor(im.stats, target, store.settings.feedLook.harmonize) : null;
  for (const l of items) {
    const box = h('div.lk');
    const card = h('button.look-card', { type: 'button', 'aria-pressed': String(l.id === current), title: l.note || '', onclick: () => {
      for (const c of strip.children) c.setAttribute('aria-pressed', 'false');
      card.setAttribute('aria-pressed', 'true');
      onPick(l.id);
    } }, box, l.name);
    if (imageId) {
      const lookId = l.id === 'feed' ? store.settings.feedLook.id : l.id;
      const img = h('img', { alt: '' });
      box.append(img);
      lookPreviewUrl(imageId, lookId, l.id === 'feed' ? store.settings.feedLook.strength : strength, harm).then((u) => { img.src = u; });
    }
    strip.append(card);
  }
  return strip;
}

export function openFeedLookSheet() {
  const s = store.settings;
  const body = h('div');
  const imageId = sampleImageId();
  const save = (patch) => store.saveSettings(patch);
  body.append(
    h('p.muted', 'Der Feed-Look gilt für alle Beiträge, die nicht ausdrücklich einen eigenen Look haben. So bleibt das Profil einheitlich – ohne Text oder Effekte auf den Bildern.'),
    h('div.section-title', 'Look'),
    lookStrip(s.feedLook.id, (id) => save({ feedLook: { id } }), { imageId, strength: s.feedLook.strength }),
    slider({ label: 'Stärke', min: 0, max: 1, step: 0.01, value: s.feedLook.strength, format: (v) => Math.round(v * 100) + ' %', onChange: (v) => save({ feedLook: { strength: v } }) }),
    h('div.section-title', 'Serie angleichen'),
    h('p.small.muted', 'Gleicht Helligkeit, Weißabgleich, Kontrast und Farbigkeit aller Bilder behutsam aneinander an – bevor der Look wirkt. Bewusst begrenzt, damit nichts künstlich aussieht.'),
    slider({ label: 'Angleichen', min: 0, max: 1, step: 0.01, value: s.feedLook.harmonize, format: (v) => (v === 0 ? 'aus' : Math.round(v * 100) + ' %'), onChange: (v) => save({ feedLook: { harmonize: v } }) }),
    h('div.section-title', 'Raster-Ansicht'),
    h('div.field', h('div.label', 'Kachelform'), segmented([{ value: false, label: '3:4 (aktuell)' }, { value: true, label: '1:1 (alt)' }], s.gridSquare, (v) => save({ gridSquare: v }))),
    toggle('Datum und Status auf den Kacheln zeigen', s.gridInfo, (v) => save({ gridInfo: v })),
    toggle('Veröffentlichte Beiträge im Raster zeigen', s.gridShowPublished, (v) => save({ gridShowPublished: v })),
  );
  openSheet({ title: 'Feed-Look', body, narrow: true });
}
