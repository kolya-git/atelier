// Beitrag bearbeiten: Bilder (Karussell), Ausschnitt, Look, Termin, Bildunterschrift, Teilen.
import { h, icon, btn, iconBtn, openSheet, segmented, slider, toggle, field, toast, confirmDialog, popMenu, progressOverlay } from '../core/ui.js';
import { store } from '../core/store.js';
import { debounce, fmtDateLong, copyText, shareOrDownload, downloadBlob, fileSafe, todayISO, uid } from '../core/util.js';
import { createCropper } from '../core/cropper.js';
import { sortable } from '../core/sortable.js';
import { renderImage, resolveLook, ASPECTS, renderSlideBlob } from './render.js';
import { lookStrip } from './feedlook.js';
import { pickImages } from './picker.js';
import { STATUS_OPTIONS } from './status.js';
import { makeICS } from './ics.js';
import { IN_CLAUDE } from '../core/platform.js';

const MAX_SLIDES = 20;
const CAPTION_MAX = 2200;

export function countHashtags(text) {
  return (String(text || '').match(/(^|\s)#[\p{L}\p{N}_]+/gu) || []).length;
}

export async function openPostEditor(postId) {
  const post = store.posts.get(postId);
  if (!post) return;
  post.adjust = post.adjust || {};
  let cur = 0;
  const save = debounce(() => store.savePost(post), 350);

  const stageCanvas = h('div.editor-canvas');
  const hint = h('div.stage-hint', 'Ziehen = verschieben · Zwei Finger = zoomen · Doppeltippen = zurücksetzen');
  const slidesBar = h('div.slides');
  const stage = h('div.editor-stage', stageCanvas, slidesBar);
  const panel = h('div.editor-panel');

  const sheet = openSheet({
    title: post.date ? fmtDateLong(post.date) : 'Beitrag (Idee)',
    pad: false,
    body: h('div.editor', stage, panel),
    left: [iconBtn('more', (e) => moreMenu(e.currentTarget), 'Mehr')],
    right: [btn('Posten …', () => openPublishSheet(post), { cls: 'small', iconName: 'share' }), btn('Fertig', () => sheet.close('done'), { cls: 'primary small' })],
    onClose: () => { save.flush(); },
  });

  // ---------- Bühne mit Ausschnitt ----------
  const cropper = createCropper({
    aspect: ASPECTS[post.format] || 0.75,
    onChange: (c, final) => {
      if (!post.slides[cur]) return;
      post.slides[cur].crop = c;
      if (final) save();
    },
  });
  const empty = h('div.empty', h('h3', 'Noch keine Bilder'), h('p', 'Wähle ein oder mehrere Bilder für diesen Beitrag. Mehrere Bilder ergeben ein Karussell (bis 20).'),
    btn('Bilder wählen', () => addSlides(), { iconName: 'plus', cls: 'primary' }));
  stageCanvas.append(cropper.el, empty, hint);
  const ro = new ResizeObserver(() => {
    const r = stageCanvas.getBoundingClientRect();
    cropper.fit(Math.max(80, r.width - 40), Math.max(80, r.height - 50));
  });
  ro.observe(stageCanvas);
  const mo = new MutationObserver(() => { if (!document.body.contains(sheet.el)) { ro.disconnect(); mo.disconnect(); } });
  mo.observe(document.body, { childList: true });

  let renderToken = 0;
  async function showSlide(i) {
    cur = Math.max(0, Math.min(i, post.slides.length - 1));
    const slide = post.slides[cur];
    const has = !!slide && store.images.has(slide.imageId);
    cropper.el.classList.toggle('hidden', !has);
    hint.classList.toggle('hidden', !has);
    empty.classList.toggle('hidden', has);
    renderSlides();
    if (!has) return;
    const im = store.images.get(slide.imageId);
    const long = Math.min(1600, Math.max(im.w, im.h));
    const w = im.w >= im.h ? long : Math.round((long * im.w) / im.h);
    const hh = im.w >= im.h ? Math.round((long * im.h) / im.w) : long;
    const token = ++renderToken;
    const c = await renderImage(slide.imageId, { outW: w, outH: hh, look: resolveLook(post, slide.imageId) });
    if (token !== renderToken || !c) return;
    cropper.setImage(c, w, hh);
    cropper.setCrop(slide.crop || {});
  }
  const refreshLook = debounce(() => showSlide(cur), 90);

  function renderSlides() {
    slidesBar.replaceChildren();
    post.slides.forEach((s, i) => {
      const t = h('div.slide-thumb' + (i === cur ? '.active' : ''), { dataset: { i: String(i) } },
        h('img', { src: store.thumbUrl(s.imageId), alt: '' }), post.slides.length > 1 ? h('span.n', String(i + 1)) : null);
      slidesBar.append(t);
    });
    if (post.slides.length < MAX_SLIDES) slidesBar.append(h('button.slide-thumb.add', { type: 'button', title: 'Bilder hinzufügen', onclick: () => addSlides() }, icon('plus')));
  }
  sortable(slidesBar, {
    items: '.slide-thumb[data-i]',
    onTap: (el) => {
      const i = Number(el.dataset.i);
      if (i === cur) slideMenu(el, i); else showSlide(i);
    },
    onDrop: (from, to) => {
      if (!to || to.dataset.i == null) return;
      const a = Number(from.dataset.i), b = Number(to.dataset.i);
      const [m] = post.slides.splice(a, 1);
      post.slides.splice(b, 0, m);
      cur = b;
      save(); showSlide(cur);
    },
  });
  function slideMenu(anchor, i) {
    popMenu(anchor, [
      i > 0 ? { label: 'Nach vorne', icon: 'left', onClick: () => { const [m] = post.slides.splice(i, 1); post.slides.splice(i - 1, 0, m); save(); showSlide(i - 1); } } : null,
      i < post.slides.length - 1 ? { label: 'Nach hinten', icon: 'right', onClick: () => { const [m] = post.slides.splice(i, 1); post.slides.splice(i + 1, 0, m); save(); showSlide(i + 1); } } : null,
      { label: 'Bild austauschen', icon: 'swap', onClick: async () => { const ids = await pickImages({ multiple: false, title: 'Bild austauschen' }); if (ids && ids[0]) { post.slides[i] = { imageId: ids[0], crop: {} }; save(); showSlide(i); } } },
      'sep',
      { label: 'Aus dem Beitrag entfernen', icon: 'trash', danger: true, onClick: () => { post.slides.splice(i, 1); save(); showSlide(Math.min(i, post.slides.length - 1)); } },
    ]);
  }
  async function addSlides() {
    const ids = await pickImages({ title: 'Bilder für den Beitrag' });
    if (!ids || !ids.length) return;
    const room = MAX_SLIDES - post.slides.length;
    if (ids.length > room) toast(`Instagram erlaubt höchstens ${MAX_SLIDES} Bilder pro Beitrag.`);
    for (const id of ids.slice(0, room)) post.slides.push({ imageId: id, crop: {} });
    if (post.status === 'idee' && post.slides.length) post.status = 'entwurf';
    statusSeg.setValue(post.status);
    save();
    showSlide(post.slides.length - ids.slice(0, room).length);
  }

  // ---------- Seitenleiste ----------
  const statusSeg = segmented(STATUS_OPTIONS, post.status, (v) => { post.status = v; save(); }, { block: true });
  const dateIn = h('input.input', { type: 'date', value: post.date || '' });
  const timeIn = h('input.input', { type: 'time', value: post.time || '18:00' });
  const onDate = () => {
    post.date = dateIn.value || null; post.time = timeIn.value || '18:00';
    sheet.setTitle(post.date ? fmtDateLong(post.date) : 'Beitrag (Idee)');
    save();
  };
  dateIn.addEventListener('change', onDate);
  timeIn.addEventListener('change', onDate);

  const caption = h('textarea.textarea', { rows: 7, placeholder: 'Bildunterschrift …', value: post.caption || '' });
  const counter = h('div.row.wrap', { style: { justifyContent: 'space-between' } });
  const updateCounter = () => {
    const n = caption.value.length, tags = countHashtags(caption.value), lim = store.settings.hashtagLimit || 5;
    counter.replaceChildren(
      h('span.counter' + (n > CAPTION_MAX ? '.bad' : n > CAPTION_MAX * 0.9 ? '.warn' : ''), `${n} / ${CAPTION_MAX} Zeichen`),
      h('span.counter' + (tags > lim ? '.bad' : ''), `${tags} / ${lim} Hashtags` + (tags > lim ? ' – zu viele, Instagram erlaubt nur ' + lim : '')));
  };
  caption.addEventListener('input', () => { post.caption = caption.value; updateCounter(); save(); });
  updateCounter();
  const insertTags = (tags) => {
    const sep = caption.value && !/\s$/.test(caption.value) ? '\n\n' : '';
    caption.value = caption.value + sep + tags;
    post.caption = caption.value; updateCounter(); save();
  };
  const tagSets = h('div.hashtag-sets', ...(store.settings.hashtagSets || []).map((s) => h('button.chip', { type: 'button', title: s.tags, onclick: () => insertTags(s.tags) }, '+ ' + s.name)));

  const notes = h('textarea.textarea', { rows: 3, placeholder: 'Private Notizen (werden nicht gepostet)', value: post.notes || '', style: { minHeight: '70px' } });
  notes.addEventListener('input', () => { post.notes = notes.value; save(); });

  const strengthWrap = h('div');
  const renderStrength = () => {
    strengthWrap.replaceChildren();
    if (post.lookId && post.lookId !== 'feed') {
      strengthWrap.append(slider({ label: 'Stärke', min: 0, max: 1, step: 0.01, value: post.lookStrength ?? 0.8, format: (v) => Math.round(v * 100) + ' %',
        onInput: (v) => { post.lookStrength = v; refreshLook(); }, onChange: () => save() }));
    } else {
      strengthWrap.append(h('p.small.muted', 'Nutzt den gemeinsamen Feed-Look – ändert sich mit, wenn du den Feed-Look anpasst.'));
    }
  };
  const adj = (key, label, min, max, fmt) => slider({ label, min, max, step: 0.01, value: post.adjust[key] || 0, format: fmt,
    onInput: (v) => { post.adjust[key] = v; refreshLook(); }, onChange: () => save() });
  const pct = (v) => (v > 0 ? '+' : '') + Math.round(v * 100);

  panel.append(
    h('div.panel-group', h('h3', 'Status'), statusSeg),
    h('div.panel-group', h('h3', 'Termin'),
      h('div.two-col', dateIn, timeIn),
      h('div.row.wrap', { style: { marginTop: '8px' } },
        btn('Nächster freier Termin', () => { dateIn.value = store.nextFreeSlot('post'); onDate(); }, { cls: 'small', iconName: 'calendar' }),
        btn('Ohne Termin', () => { dateIn.value = ''; onDate(); }, { cls: 'small ghost' }))),
    h('div.panel-group', h('h3', 'Format'),
      segmented([{ value: '3:4', label: '3:4 (Raster)' }, { value: '4:5', label: '4:5' }, { value: '1:1', label: '1:1' }], post.format, (v) => {
        post.format = v; cropper.setAspect(ASPECTS[v]); save();
      }, { block: true }),
      h('p.small.muted', { style: { marginTop: '6px' } }, '3:4 entspricht genau der Rasteransicht im Profil. 4:5 wird im Raster oben und unten leicht beschnitten.')),
    h('div.panel-group', h('h3', 'Look'),
      lookStrip(post.lookId || 'feed', (id) => { post.lookId = id; if (id !== 'feed' && post.lookStrength == null) post.lookStrength = 0.8; renderStrength(); refreshLook(); save(); },
        { imageId: post.slides[0] && post.slides[0].imageId, includeFeed: true }),
      strengthWrap,
      toggle('An die Serie angleichen', post.harmonize !== false, (v) => { post.harmonize = v; refreshLook(); save(); })),
    h('details.panel-group', h('summary', 'Feinabstimmung'),
      adj('exposure', 'Belichtung', -1, 1, (v) => (v > 0 ? '+' : '') + v.toFixed(2).replace('.', ',') + ' EV'),
      adj('temp', 'Kühler ↔ wärmer', -0.8, 0.8, pct),
      adj('contrast', 'Kontrast', -0.5, 0.5, pct),
      adj('saturation', 'Farbigkeit', -0.6, 0.6, pct),
      adj('grain', 'Körnung', -0.3, 0.8, pct),
      btn('Zurücksetzen', () => { post.adjust = {}; save(); refreshLook(); sheet.close('reset'); openPostEditor(post.id); }, { cls: 'small ghost' })),
    h('div.panel-group', h('h3', 'Bildunterschrift'), caption, counter, tagSets,
      h('div.row', { style: { marginTop: '8px' } }, btn('Text kopieren', async () => { toast((await copyText(post.caption || '')) ? 'Bildunterschrift kopiert' : 'Kopieren nicht möglich'); }, { cls: 'small', iconName: 'copy' }))),
    h('div.panel-group', h('h3', 'Notizen'), notes),
  );
  renderStrength();

  function moreMenu(anchor) {
    popMenu(anchor, [
      { label: 'Vorschau', icon: 'eye', onClick: () => openPreview(post) },
      { label: 'Bilder sichern / teilen', icon: 'share', onClick: () => openPublishSheet(post) },
      IN_CLAUDE ? null : { label: 'Kalendertermin (.ics)', icon: 'calendar', onClick: () => {
        if (!post.date) { toast('Bitte zuerst einen Termin wählen.'); return; }
        downloadBlob(makeICS([post]), `instagram-${post.date}.ics`);
      } },
      { label: 'Duplizieren', icon: 'dup', onClick: async () => {
        const copy = store.newPost({ ...structuredClone(post), id: uid(), date: null, status: 'idee' });
        await store.savePost(copy);
        toast('Kopie als Idee angelegt');
      } },
      'sep',
      { label: 'Beitrag löschen', icon: 'trash', danger: true, onClick: async () => {
        if (await confirmDialog('Der Beitrag wird gelöscht. Die Bilder bleiben in der Bibliothek.', { title: 'Beitrag löschen?', ok: 'Löschen', danger: true })) {
          save.cancel(); await store.deletePost(post.id); sheet.close('deleted');
        }
      } },
    ]);
  }

  showSlide(0);
}

/** Vorschau im neutralen Telefonrahmen (Karussell zum Durchblättern). */
export async function openPreview(post) {
  const prog = progressOverlay('Vorschau wird erstellt');
  const urls = [];
  for (let i = 0; i < post.slides.length; i++) {
    prog.set(i / Math.max(1, post.slides.length));
    const b = await renderSlideBlob(post, post.slides[i], 720);
    if (b) urls.push(URL.createObjectURL(b));
  }
  prog.close();
  let i = 0;
  const img = h('img', { alt: '' });
  const dots = h('div.pp-dots');
  const show = () => { img.src = urls[i] || ''; dots.replaceChildren(...urls.map((_, k) => h('i' + (k === i ? '.on' : '')))); };
  const acc = store.settings.account;
  const media = h('div.pp-media', img,
    urls.length > 1 ? h('button.pp-nav.prev', { type: 'button', onclick: () => { i = (i - 1 + urls.length) % urls.length; show(); } }, icon('left', 18)) : null,
    urls.length > 1 ? h('button.pp-nav.next', { type: 'button', onclick: () => { i = (i + 1) % urls.length; show(); } }, icon('right', 18)) : null);
  const av = h('div.avatar', acc.avatarImageId && store.images.get(acc.avatarImageId) ? h('img', { src: store.thumbUrl(acc.avatarImageId) }) : (acc.name || 'A').slice(0, 1));
  const card = h('div.phone-preview', h('div.pp-head', av, h('b', acc.handle)), media, urls.length > 1 ? dots : null,
    h('div.pp-caption', h('b', acc.handle), post.caption || h('span.muted', '(keine Bildunterschrift)')));
  show();
  openSheet({ title: 'Vorschau', body: h('div', card, h('p.small.muted.center', { style: { marginTop: '12px' } }, 'Neutrale Vorschau – zeigt Bildfolge, Ausschnitt und Text.')), narrow: true,
    onClose: () => { for (const u of urls) URL.revokeObjectURL(u); } });
}

/** Geführtes Posten: Text kopieren → Bilder teilen → als veröffentlicht markieren. */
export async function openPublishSheet(post) {
  if (!post.slides.length) { toast('Der Beitrag hat noch keine Bilder.'); return; }
  const prog = progressOverlay('Bilder werden vorbereitet');
  const files = [];
  const base = (post.date || todayISO()) + '_' + fileSafe((post.caption || 'beitrag').split('\n')[0].slice(0, 24), 'beitrag');
  for (let i = 0; i < post.slides.length; i++) {
    prog.set(i / post.slides.length, `Bild ${i + 1} von ${post.slides.length}`);
    const b = await renderSlideBlob(post, post.slides[i]);
    if (b) files.push(new File([b], `${base}_${String(i + 1).padStart(2, '0')}.jpg`, { type: 'image/jpeg' }));
  }
  prog.close();
  const W = store.settings.exportWidth || 1080;
  const Hh = Math.round(W / (ASPECTS[post.format] || 0.75));
  const step = (n, title, desc, control) => h('div.card', { style: { marginBottom: '10px' } },
    h('div.row', h('span.badge', String(n)), h('b', title)), h('p.small.muted', { style: { margin: '6px 0 10px' } }, desc), control);
  const body = h('div',
    step(1, 'Bildunterschrift kopieren', post.caption ? 'Kopiert den Text in die Zwischenablage – in Instagram einfach einfügen.' : 'Dieser Beitrag hat keine Bildunterschrift.',
      btn('Text kopieren', async () => { toast((await copyText(post.caption || '')) ? 'Kopiert' : 'Kopieren nicht möglich'); }, { iconName: 'copy', disabled: !post.caption })),
    step(2, `${files.length} Bild${files.length > 1 ? 'er' : ''} sichern oder teilen`, IN_CLAUDE
      ? `${W} × ${Hh} px, mit Look. Claude bietet jedes Bild einzeln an – im Teilen-Menü „Bild sichern“ wählen, danach in Instagram aus den Fotos auswählen.`
      : `${W} × ${Hh} px, mit Look. Im Teilen-Menü „Bilder sichern“ (Fotos) oder direkt Instagram wählen.`,
      btn('Teilen …', async () => { await shareOrDownload(files, { title: 'Instagram-Beitrag' }); }, { iconName: 'share', cls: 'primary' })),
    step(3, 'Als veröffentlicht markieren', 'Damit das Raster weiß, dass dieser Beitrag online ist.',
      btn(post.status === 'veroeffentlicht' ? 'Ist veröffentlicht' : 'Veröffentlicht', async (e) => {
        post.status = 'veroeffentlicht';
        if (!post.date) post.date = todayISO();
        await store.savePost(post);
        e.currentTarget.textContent = 'Ist veröffentlicht';
        toast('Als veröffentlicht markiert');
      }, { iconName: 'check' })));
  openSheet({ title: 'Posten', body, narrow: true });
}

export { field };
