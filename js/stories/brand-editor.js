// Story-Stil bearbeiten: Vorlagen, Farben (auch aus eigenen Bildern), Schriften, Größen.
import { h, openSheet, segmented, slider, selectEl, field, btn, toast } from '../core/ui.js';
import { store } from '../core/store.js';
import { BRAND_PRESETS, paletteFromPixels } from './brand.js';
import { FONTS } from '../core/fonts.js';
import { renderFrame } from './story-render.js';
import { newFrame } from './templates.js';
import { pickImages } from '../planner/picker.js';
import { loadImage, samplePixels } from '../core/imageio.js';
import { debounce } from '../core/util.js';

function sampleFrame(kind = 'bildtext') {
  const f = newFrame(kind);
  const any = [...store.images.keys()][0];
  if (f.images[0]) f.images[0].imageId = any || null;
  f.fields = { label: 'Atelier · Notiz', title: 'Licht am Morgen, ruhig und warm', body: 'Ein kurzer Gedanke zum Bild – in einer Schrift, die überall gleich wirkt.' };
  return f;
}

export function openBrandEditor(onChange) {
  let brand = structuredClone(store.settings.brand);
  const previewA = h('div', { style: { width: '150px' } });
  const previewB = h('div', { style: { width: '150px' } });
  const commit = debounce(async () => {
    await store.saveSettings({ brand });
    onChange && onChange();
  }, 250);
  const renderPreview = debounce(async () => {
    const [a, b] = await Promise.all([
      renderFrame(sampleFrame('bildtext'), brand, { W: 300, H: 533 }),
      renderFrame({ ...sampleFrame('zitat'), fields: { title: 'Weniger, aber besser gesehen.', label: 'Notizbuch' } }, brand, { W: 300, H: 533 }),
    ]);
    for (const c of [a, b]) Object.assign(c.style, { width: '100%', borderRadius: '8px', boxShadow: 'var(--shadow)' });
    previewA.replaceChildren(a); previewB.replaceChildren(b);
  }, 120);
  const set = (patch) => {
    const wasPreset = brand.id !== 'eigen';
    Object.assign(brand, patch);
    if (patch.id === 'eigen' && wasPreset) for (const b of presets.children) b.setAttribute('aria-pressed', 'false');
    renderPreview(); commit();
  };

  const presets = h('div.style-presets');
  const renderPresets = () => {
    presets.replaceChildren();
    for (const p of BRAND_PRESETS) {
      const b = h('button.style-preset', { type: 'button', 'aria-pressed': String(brand.id === p.id), onclick: () => { brand = { ...structuredClone(p) }; renderPresets(); rebuildControls(); renderPreview(); commit(); } });
      renderFrame(sampleFrame('text'), p, { W: 108, H: 192 }).then((c) => b.prepend(c));
      b.append(h('div.small', { style: { padding: '4px 6px' } }, p.name));
      presets.append(b);
    }
  };

  const controls = h('div');
  function swatch(key, label) {
    const input = h('input', { type: 'color', value: brand[key], oninput: () => { sw.style.background = input.value; set({ [key]: input.value, id: 'eigen' }); } });
    const sw = h('label.swatch', { style: { background: brand[key] }, title: label }, input);
    return h('div', { style: { textAlign: 'center', fontSize: '11px', color: 'var(--ink-3)', width: '70px' } }, sw, h('div', { style: { marginTop: '4px' } }, label));
  }
  function fontSelect(key, kinds) {
    const opts = Object.entries(FONTS).filter(([, f]) => kinds.includes(f.kind)).map(([name, f]) => ({ value: name, label: `${f.label} – ${f.note}` }));
    return selectEl(opts, brand[key], (v) => {
      const w = FONTS[v].weights;
      const wk = key === 'display' ? 'displayWeight' : key === 'text' ? 'textWeight' : 'labelWeight';
      const pref = key === 'display' ? (w.includes(500) ? 500 : w[0]) : key === 'label' && FONTS[v].kind === 'sans' ? (w.includes(500) ? 500 : w[0]) : (w.includes(400) ? 400 : w[0]);
      set({ [key]: v, [wk]: pref, id: 'eigen' });
    });
  }
  function rebuildControls() {
    controls.replaceChildren(
      h('div.section-title', 'Farben'),
      h('div.swatches', swatch('bg', 'Fläche'), swatch('ink', 'Schrift'), swatch('muted', 'Gedämpft'), swatch('accent', 'Akzent'), swatch('alt', 'Dunkel'), swatch('altInk', 'Schrift dunkel')),
      h('div.row', { style: { marginTop: '10px' } }, btn('Farben aus meinen Bildern ableiten', async () => {
        const ids = await pickImages({ title: 'Bilder für die Farbpalette' });
        if (!ids || !ids.length) return;
        const px = [];
        for (const id of ids.slice(0, 12)) {
          const im = store.images.get(id);
          px.push(samplePixels(await loadImage(im.thumb), 72));
        }
        const pal = paletteFromPixels(px);
        if (!pal) { toast('Zu wenig Bildinformation.'); return; }
        set({ ...pal, id: 'eigen' });
        rebuildControls();
        toast('Gedämpfte Palette aus den Bildern übernommen');
      }, { iconName: 'palette', cls: 'small' })),
      h('div.section-title', 'Schriften'),
      field('Titel', fontSelect('display', ['serif', 'sans'])),
      field('Text', fontSelect('text', ['serif', 'sans'])),
      field('Etikett (kleine Zeilen)', fontSelect('label', ['mono', 'sans', 'serif'])),
      field('Etiketten', segmented([{ value: 'upper', label: 'GROSS gesperrt' }, { value: 'normal', label: 'normal' }], brand.labelCase, (v) => set({ labelCase: v, id: 'eigen' }))),
      field('Ausrichtung', segmented([{ value: 'left', label: 'linksbündig' }, { value: 'center', label: 'zentriert' }], brand.align, (v) => set({ align: v, id: 'eigen' }))),
      h('div.section-title', 'Größen & Abstände'),
      slider({ label: 'Titelgröße', min: 48, max: 110, step: 1, value: brand.titleSize, format: (v) => v + ' px', onInput: (v) => set({ titleSize: v, id: 'eigen' }) }),
      slider({ label: 'Textgröße', min: 26, max: 46, step: 1, value: brand.bodySize, format: (v) => v + ' px', onInput: (v) => set({ bodySize: v, id: 'eigen' }) }),
      slider({ label: 'Etikettgröße', min: 16, max: 30, step: 1, value: brand.labelSize, format: (v) => v + ' px', onInput: (v) => set({ labelSize: v, id: 'eigen' }) }),
      slider({ label: 'Sperrung der Etiketten', min: 0, max: 0.3, step: 0.01, value: brand.labelTracking, format: (v) => Math.round(v * 100) + ' %', onInput: (v) => set({ labelTracking: v, id: 'eigen' }) }),
      slider({ label: 'Rand', min: 56, max: 150, step: 1, value: brand.margin, format: (v) => v + ' px', onInput: (v) => set({ margin: v, id: 'eigen' }) }),
      slider({ label: 'Papierstruktur', min: 0, max: 1, step: 0.01, value: brand.texture, format: (v) => Math.round(v * 100) + ' %', onInput: (v) => set({ texture: v, id: 'eigen' }) }),
    );
  }

  renderPresets();
  rebuildControls();
  renderPreview();
  openSheet({
    title: 'Story-Stil',
    body: h('div',
      h('p.muted', 'Ein Stil für alle Stories: wenige, gut lesbare Schriften, ruhige Farben, feste Abstände. Text steht nie auf Fotos.'),
      h('div.row', { style: { gap: '14px', margin: '12px 0 4px', justifyContent: 'center' } }, previewA, previewB),
      h('div.section-title', 'Vorlagen'), presets,
      controls),
    narrow: true,
  });
}
