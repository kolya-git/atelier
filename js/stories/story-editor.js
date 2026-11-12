// Story bearbeiten: Seiten, Vorlagen, Bilder, Texte – alles im einheitlichen Story-Stil.
import { h, icon, btn, iconBtn, openSheet, segmented, toggle, field, toast, confirmDialog, popMenu, progressOverlay } from '../core/ui.js';
import { store } from '../core/store.js';
import { debounce, fmtDateLong, shareOrDownload, fileSafe, todayISO, uid } from '../core/util.js';
import { sortable } from '../core/sortable.js';
import { createCropper } from '../core/cropper.js';
import { TEMPLATES, templateById, newFrame, changeTemplate, FIELD_LABELS, FIELD_HINTS } from './templates.js';
import { renderFrame, frameBlob } from './story-render.js';
import { pickImages } from '../planner/picker.js';
import { renderImage, resolveLook } from '../planner/render.js';
import { STATUS_OPTIONS } from '../planner/status.js';
import { openBrandEditor } from './brand-editor.js';

export async function openStoryEditor(storyId) {
  const story = store.stories.get(storyId);
  if (!story) return;
  if (!story.frames.length) story.frames.push(newFrame('text'));
  let cur = 0;
  let showSafe = true;
  const save = debounce(() => store.saveStory(story), 350);

  const canvasHost = h('div.story-stage');
  const safe = h('div.safe-overlay', h('div.top'), h('div.bottom'));
  const stageInner = h('div.editor-canvas', canvasHost);
  const strip = h('div.frame-strip');
  const stage = h('div.editor-stage', stageInner, strip);
  const panel = h('div.editor-panel');
  const sheet = openSheet({
    title: story.date ? 'Story · ' + fmtDateLong(story.date) : 'Story',
    pad: false,
    body: h('div.editor', stage, panel),
    left: [iconBtn('more', (e) => moreMenu(e.currentTarget), 'Mehr')],
    right: [btn('Teilen …', () => exportStory(story), { cls: 'small', iconName: 'share' }), btn('Fertig', () => sheet.close('done'), { cls: 'primary small' })],
    onClose: () => save.flush(),
  });

  const fitStage = () => {
    const r = stageInner.getBoundingClientRect();
    const hgt = Math.max(200, r.height - 36), w = Math.max(120, r.width - 36);
    const sw = Math.min(w, hgt * 9 / 16);
    canvasHost.style.width = sw + 'px';
    canvasHost.style.height = sw * 16 / 9 + 'px';
  };
  const ro = new ResizeObserver(fitStage);
  ro.observe(stageInner);

  let token = 0;
  async function renderStage() {
    const f = story.frames[cur];
    if (!f) return;
    const t = ++token;
    const c = await renderFrame(f, store.settings.brand, { W: 1080, H: 1920, index: [cur + 1, story.frames.length] });
    if (t !== token) return;
    canvasHost.replaceChildren(c, showSafe ? safe : '');
    c.addEventListener('click', (e) => onStageTap(e, c));
  }
  const rerender = debounce(() => { renderStage(); renderStrip(); }, 120);

  // Tippen auf ein Foto in der Vorschau → Ausschnitt wählen
  function onStageTap(e, c) {
    const f = story.frames[cur];
    const t = templateById(f.template);
    if (!t.slots) return;
    const filled = (f.images || []).map((s, i) => ({ s, i })).filter((x) => x.s && x.s.imageId);
    if (filled.length === 1) editCrop(filled[0].i);
    else if (filled.length > 1) {
      const rect = c.getBoundingClientRect();
      const y = (e.clientY - rect.top) / rect.height;
      editCrop(y < 0.55 ? 0 : Math.min(f.images.length - 1, y < 0.8 ? 1 : 2));
    }
  }

  const thumbCache = new Map();
  async function renderStrip() {
    strip.replaceChildren();
    story.frames.forEach((f, i) => {
      const el = h('div.frame-thumb' + (i === cur ? '.active' : ''), { dataset: { i: String(i) } });
      strip.append(el);
      const key = JSON.stringify(f) + store.settings.brand.bg + store.settings.brand.display + i;
      const cached = thumbCache.get(f.id);
      if (cached && cached.key === key) el.append(cached.canvas);
      else renderFrame(f, store.settings.brand, { W: 96, H: 171, index: [i + 1, story.frames.length] }).then((c) => { thumbCache.set(f.id, { key, canvas: c }); el.append(c); });
    });
    strip.append(h('button.frame-thumb.add', { type: 'button', title: 'Seite hinzufügen', onclick: () => addFrame() }, icon('plus')));
  }
  sortable(strip, {
    items: '.frame-thumb[data-i]',
    onTap: (el) => { const i = Number(el.dataset.i); if (i === cur) frameMenu(el, i); else select(i); },
    onDrop: (from, to) => {
      if (!to || to.dataset.i == null) return;
      const a = Number(from.dataset.i), b = Number(to.dataset.i);
      const [m] = story.frames.splice(a, 1);
      story.frames.splice(b, 0, m);
      cur = b; save(); select(b);
    },
  });
  function frameMenu(anchor, i) {
    popMenu(anchor, [
      { label: 'Seite duplizieren', icon: 'dup', onClick: () => { const copy = structuredClone(story.frames[i]); copy.id = uid(); story.frames.splice(i + 1, 0, copy); save(); select(i + 1); } },
      i > 0 ? { label: 'Nach vorne', icon: 'left', onClick: () => { const [m] = story.frames.splice(i, 1); story.frames.splice(i - 1, 0, m); save(); select(i - 1); } } : null,
      i < story.frames.length - 1 ? { label: 'Nach hinten', icon: 'right', onClick: () => { const [m] = story.frames.splice(i, 1); story.frames.splice(i + 1, 0, m); save(); select(i + 1); } } : null,
      'sep',
      story.frames.length > 1 ? { label: 'Seite löschen', icon: 'trash', danger: true, onClick: () => { story.frames.splice(i, 1); save(); select(Math.min(i, story.frames.length - 1)); } } : null,
    ]);
  }
  function addFrame() {
    const prev = story.frames[cur];
    const f = newFrame(prev && prev.template !== 'bild' ? prev.template : 'bild');
    if (prev) f.bg = prev.bg;
    story.frames.splice(cur + 1, 0, f);
    save(); select(cur + 1);
  }

  // ---------- Seitenleiste ----------
  const frameBox = h('div');
  function renderPanelFrame() {
    const f = story.frames[cur];
    const t = templateById(f.template);
    frameBox.replaceChildren();
    // Vorlagen
    const tg = h('div.template-grid');
    for (const tpl of TEMPLATES) {
      const card = h('button.template-card', { type: 'button', 'aria-pressed': String(tpl.id === f.template), title: tpl.note, onclick: () => {
        story.frames[cur] = changeTemplate(story.frames[cur], tpl.id);
        save(); renderPanelFrame(); rerender();
      } });
      const demo = demoFrame(tpl.id, f);
      renderFrame(demo, store.settings.brand, { W: 90, H: 160, index: [2, 5] }).then((c) => card.prepend(c));
      card.append(tpl.name);
      tg.append(card);
    }
    frameBox.append(h('div.panel-group', h('h3', 'Vorlage'), tg, h('p.small.muted', { style: { marginTop: '8px' } }, t.note)));
    // Bilder
    if (t.slots) {
      const slots = h('div.img-slots');
      (f.images || []).forEach((sl, i) => {
        const im = sl && sl.imageId && store.images.get(sl.imageId);
        const el = h('div.img-slot' + (im ? '.filled' : ''), { title: im ? 'Antippen: Bild ändern / Ausschnitt' : 'Bild wählen', onclick: (e) => {
          if (!im) { chooseImage(i); return; }
          popMenu(e.currentTarget, [
            { label: 'Ausschnitt wählen', icon: 'crop', onClick: () => editCrop(i) },
            { label: 'Anderes Bild', icon: 'swap', onClick: () => chooseImage(i) },
            { label: 'Bild entfernen', icon: 'close', onClick: () => { f.images[i] = { imageId: null, crop: {} }; save(); renderPanelFrame(); rerender(); } },
          ]);
        } }, im ? h('img', { src: store.thumbUrl(sl.imageId), alt: '' }) : 'Bild ' + (i + 1));
        slots.append(el);
      });
      frameBox.append(h('div.panel-group', h('h3', 'Bilder'), slots,
        h('p.small.muted', { style: { marginTop: '8px' } }, 'Fotos bekommen automatisch den Feed-Look – so passen Stories und Beiträge zusammen. Tippen auf das Foto in der Vorschau wählt den Ausschnitt.')));
    }
    // Texte
    if (t.fields.length) {
      const g = h('div.panel-group', h('h3', 'Text'));
      for (const key of t.fields) {
        const hint = (FIELD_HINTS[t.id] || {})[key];
        const isLong = key === 'body' || (t.id === 'zitat' && key === 'title');
        const input = isLong
          ? h('textarea.textarea', { rows: key === 'body' ? 4 : 3, value: f.fields[key] || '', placeholder: hint || '', style: { minHeight: '84px' } })
          : h('input.input', { value: f.fields[key] || '', placeholder: hint || '' });
        input.addEventListener('input', () => { f.fields[key] = input.value; save(); rerender(); });
        g.append(field(hint && !isLong ? `${FIELD_LABELS[key]} – ${hint}` : (key === 'title' && t.id === 'zitat' ? 'Zitat' : FIELD_LABELS[key]), input));
      }
      frameBox.append(g);
    }
    // Hintergrund
    if (t.bg) {
      frameBox.append(h('div.panel-group', h('h3', 'Fläche'),
        segmented([{ value: 'paper', label: 'Hell' }, { value: 'ink', label: 'Dunkel' }, { value: 'accent', label: 'Akzent' }], f.bg || 'paper', (v) => { f.bg = v; save(); rerender(); }, { block: true })));
    }
  }

  function demoFrame(tplId, f) {
    const d = changeTemplate(f, tplId);
    const first = (f.images || []).find((s) => s && s.imageId);
    const fallback = first ? first.imageId : [...store.images.keys()][0] || null;
    d.images = d.images.map((s) => (s.imageId ? s : { imageId: fallback, crop: {} }));
    d.fields = { label: 'Etikett', title: 'Ein ruhiger Titel', body: 'Ein paar Worte\nzweite Zeile\ndritte Zeile', ...Object.fromEntries(Object.entries(f.fields || {}).filter(([, v]) => v)) };
    return d;
  }

  async function chooseImage(i) {
    const ids = await pickImages({ multiple: false, title: 'Bild für die Story' });
    if (!ids || !ids[0]) return;
    const f = story.frames[cur];
    f.images[i] = { imageId: ids[0], crop: {} };
    save(); renderPanelFrame(); rerender();
  }

  function editCrop(i) {
    const f = story.frames[cur];
    const sl = f.images[i];
    if (!sl || !sl.imageId) return;
    // Seitenverhältnis des Bildfelds ermitteln: Rahmen kurz rendern lassen ist aufwendig – gängige Felder je Vorlage
    const aspect = { bild: 9 / 16, rahmen: 0.8, bildtext: 0.95, duo: 1.55, trio: i === 0 ? 1.1 : 0.62, serie: 0.77, neu: 0.75 }[f.template] || 0.8;
    const cropper = createCropper({ aspect, crop: sl.crop || {}, onChange: (c, final) => { if (final) { sl.crop = c; save(); } } });
    const host = h('div', { style: { height: '62vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--stage)', borderRadius: '10px' } }, cropper.el);
    openSheet({ title: 'Ausschnitt', body: h('div', host, h('p.small.muted.center', { style: { marginTop: '10px' } }, 'Ziehen = verschieben · Zwei Finger = zoomen · Doppeltippen = zurücksetzen')), narrow: true,
      onClose: () => { sl.crop = cropper.getCrop(); save(); rerender(); } });
    requestAnimationFrame(async () => {
      const r = host.getBoundingClientRect();
      cropper.fit(r.width - 30, r.height - 30);
      const im = store.images.get(sl.imageId);
      const long = 1400;
      const w = im.w >= im.h ? long : Math.round((long * im.w) / im.h), hh = im.w >= im.h ? Math.round((long * im.h) / im.w) : long;
      const c = await renderImage(sl.imageId, { outW: w, outH: hh, look: resolveLook(null, sl.imageId) });
      cropper.setImage(c, w, hh);
      cropper.setCrop(sl.crop || {});
    });
  }

  const statusSeg = segmented(STATUS_OPTIONS, story.status, (v) => { story.status = v; save(); }, { block: true });
  const titleIn = h('input.input', { value: story.title || '', placeholder: 'z. B. „Atelierbesuch“ (nur für dich)' });
  titleIn.addEventListener('input', () => { story.title = titleIn.value; save(); });
  const dateIn = h('input.input', { type: 'date', value: story.date || '' });
  const timeIn = h('input.input', { type: 'time', value: story.time || '18:00' });
  const onDate = () => { story.date = dateIn.value || null; story.time = timeIn.value || '18:00'; sheet.setTitle(story.date ? 'Story · ' + fmtDateLong(story.date) : 'Story'); save(); };
  dateIn.addEventListener('change', onDate);
  timeIn.addEventListener('change', onDate);

  panel.append(
    h('div.panel-group', h('h3', 'Story'), field('Titel', titleIn), h('div.two-col', dateIn, timeIn), h('div', { style: { marginTop: '10px' } }, statusSeg)),
    frameBox,
    h('div.panel-group', h('h3', 'Stil'),
      h('p.small.muted', 'Schriften, Farben und Abstände gelten für alle Stories gleich – das macht den einheitlichen Auftritt.'),
      h('div.row.wrap', btn('Story-Stil bearbeiten', () => openBrandEditor(() => { thumbCache.clear(); renderPanelFrame(); rerender(); }), { iconName: 'palette', cls: 'small' }),
        toggle('Sicherheitszonen zeigen', showSafe, (v) => { showSafe = v; renderStage(); }))),
  );

  function select(i) {
    cur = Math.max(0, Math.min(i, story.frames.length - 1));
    renderPanelFrame();
    renderStage();
    renderStrip();
  }

  function moreMenu(anchor) {
    popMenu(anchor, [
      { label: 'Alle Seiten teilen', icon: 'share', onClick: () => exportStory(story) },
      { label: 'Story duplizieren', icon: 'dup', onClick: async () => {
        const copy = store.newStory({ ...structuredClone(story), id: uid(), date: null, status: 'entwurf', title: (story.title || 'Story') + ' (Kopie)' });
        await store.saveStory(copy); toast('Kopie angelegt');
      } },
      'sep',
      { label: 'Story löschen', icon: 'trash', danger: true, onClick: async () => {
        if (await confirmDialog('Die Story wird gelöscht. Die Bilder bleiben in der Bibliothek.', { title: 'Story löschen?', ok: 'Löschen', danger: true })) {
          save.cancel(); await store.deleteStory(story.id); sheet.close('deleted');
        }
      } },
    ]);
  }

  requestAnimationFrame(() => { fitStage(); select(0); });
}

/** Alle Seiten als JPEG (1080 × 1920) vorbereiten und teilen. */
export async function exportStory(story) {
  const prog = progressOverlay('Story-Seiten werden vorbereitet');
  const files = [];
  const base = (story.date || todayISO()) + '_story_' + fileSafe(story.title || '', 'seite');
  for (let i = 0; i < story.frames.length; i++) {
    prog.set(i / story.frames.length, `Seite ${i + 1} von ${story.frames.length}`);
    const b = await frameBlob(story.frames[i], store.settings.brand, [i + 1, story.frames.length]);
    files.push(new File([b], `${base}_${String(i + 1).padStart(2, '0')}.jpg`, { type: 'image/jpeg' }));
  }
  prog.close();
  openSheet({
    title: 'Story teilen', narrow: true,
    body: h('div',
      h('p.muted', `${files.length} Seite(n), 1080 × 1920 px. Im Teilen-Menü „Bilder sichern“ wählen oder direkt an Instagram senden.`),
      h('div.row.wrap', { style: { marginTop: '12px' } },
        btn('Teilen …', () => shareOrDownload(files, { title: 'Instagram-Story' }), { iconName: 'share', cls: 'primary' }),
        btn('Als veröffentlicht markieren', async (e) => { story.status = 'veroeffentlicht'; if (!story.date) story.date = todayISO(); await store.saveStory(story); e.currentTarget.textContent = 'Ist veröffentlicht'; }, { iconName: 'check' }))),
  });
}
