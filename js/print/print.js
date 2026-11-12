// Druckstudio: Fotos in definierten Stilen für große Drucke aufbereiten (z. B. für Etsy).
import { h, icon, btn, iconBtn, openSheet, segmented, slider, toggle, field, selectEl, toast, confirmDialog, pickFiles, progressOverlay } from '../core/ui.js';
import { db } from '../core/db.js';
import { store } from '../core/store.js';
import { loadImage, drawScaled, blobAndRelease, makeCanvas } from '../core/imageio.js';
import { uid, debounce, clamp, bytesFmt, num, shareOrDownload, downloadBlob, fmtDate, isoFromDate, rafThrottle } from '../core/util.js';
import { getEngine, sourceTexture } from '../gl/engine.js';
import { LOOKS, lookUniforms } from '../gl/looks.js';
import { computeField } from './analysis.js';
import { STYLES, styleById, styleUsesMask, defaultProject, defaultStyleParams, computeLayout, printUniforms, GROUNDS, INKS } from './styles.js';
import { SIZE_GROUPS, DPI_OPTIONS, ETSY_SET, sizeById, mmToIn, ETSY_MAX_BYTES } from './formats.js';
import { exportFile, exportEtsySet, fileNameFor } from './export.js';
import { PaintMask } from './mask-paint.js';

let session = null; // bleibt beim Wechsel zwischen Bereichen erhalten

export function printView(ctx) {
  const eng = getEngine();
  const root = h('div.print');
  const preview = h('canvas.preview');
  const loupe = h('div.loupe.hidden', h('canvas'), h('span.lp-label', '100 %'));
  const wrap = h('div.print-canvas-wrap', preview, loupe);
  const info = h('div.print-info');
  const modeSeg = segmented([
    { value: 'view', label: 'Ansehen' }, { value: 'crop', label: 'Ausschnitt', title: 'Bildausschnitt verschieben und zoomen' },
    { value: 'paint', label: 'Maske', title: 'Bereiche behalten oder entfernen (Apple Pencil)' }, { value: 'loupe', label: 'Lupe', title: '100 % in Druckauflösung' },
  ], 'view', (v) => setMode(v));
  const compareBtn = btn('', null, { iconName: 'compare', cls: 'icon small ghost', title: 'Gedrückt halten: Foto ohne Stil' });
  const toolbar = h('div.print-toolbar', h('span.title', 'Druck'),
    btn('Öffnen', () => openFile(), { iconName: 'photoAdd', cls: 'small', title: 'Foto öffnen' }),
    btn('', () => openProjects(), { iconName: 'folder', cls: 'icon small ghost', title: 'Druckprojekte' }),
    h('div.spacer'), modeSeg, compareBtn);
  const paintBar = h('div.print-toolbar.hidden');
  const stage = h('div.print-stage', toolbar, paintBar, wrap, info);
  const panel = h('div.print-panel');
  root.append(stage, panel);

  let mode = 'view';
  let compare = false;
  const S = session || (session = { project: null, rec: null, src: null, fieldTex: null, paintTex: null, mask: null, results: [], styleThumbs: new Map(), img: null });

  // ---------- Laden ----------
  async function loadSource(blob, { name, rec } = {}) {
    const prog = progressOverlay('Bild wird vorbereitet');
    try {
      prog.set(0.1, 'Bild wird gelesen');
      const img = await loadImage(blob);
      disposeSource();
      prog.set(0.35, 'Textur wird angelegt');
      const src = sourceTexture(eng, img);
      prog.set(0.6, 'Linien und Formen werden analysiert');
      await new Promise((r) => setTimeout(r, 20));
      const f = computeField(img, 1024);
      src.fieldW = f.w; src.fieldH = f.h;
      S.fieldTex = eng.floatTexture(f.data, f.w, f.h);
      S.mask = new PaintMask(src.w, src.h);
      if (rec && rec.mask) await S.mask.fromBlob(rec.mask);
      src.paintW = S.mask.w; src.paintH = S.mask.h;
      S.paintTex = eng.r8Texture(S.mask.data(), S.mask.w, S.mask.h);
      S.src = src; S.img = img;
      S.styleThumbs.clear();
      S.results = [];
      if (rec) { S.rec = rec; S.project = { ...defaultProject(), ...(rec.settings || {}), params: mergeParams((rec.settings || {}).params) }; }
      else {
        const thumb = await blobAndRelease(drawScaled(img, 480), 'image/jpeg', 0.82);
        S.rec = { id: uid(), name: name || 'Druck', file: blob, fileType: blob.type || 'image/jpeg', w: src.w, h: src.h, created: Date.now(), updated: Date.now(), thumb };
        S.project = defaultProject();
        await saveProject(true);
      }
      prog.close();
      buildPanel();
      fitPreview();
      if (Math.max(src.w, src.h) < 3000) toast('Hinweis: Für große Drucke möglichst das Originalfoto in voller Auflösung verwenden.', { timeout: 4500 });
    } catch (e) {
      prog.close();
      console.error(e);
      toast('Bild konnte nicht geladen werden: ' + e.message, { bad: true, timeout: 5000 });
    }
  }
  function mergeParams(saved = {}) {
    const out = {};
    for (const s of STYLES) out[s.id] = { ...defaultStyleParams(s), ...(saved[s.id] || {}) };
    return out;
  }
  function disposeSource() {
    if (S.src) S.src.dispose();
    eng.deleteTexture(S.fieldTex); eng.deleteTexture(S.paintTex);
    S.src = null; S.fieldTex = null; S.paintTex = null;
  }
  async function openFile() {
    const files = await pickFiles({ multiple: false });
    if (!files.length) return;
    await loadSource(files[0], { name: files[0].name.replace(/\.[^.]+$/, '') });
  }

  const saveProject = debounce(async (immediate) => {
    if (!S.rec || !S.project) return;
    S.rec.settings = S.project;
    S.rec.updated = Date.now();
    if (S.mask && S.mask.hasContent()) S.rec.mask = await S.mask.toBlob(); else delete S.rec.mask;
    await db.put('prints', S.rec);
  }, 1200);

  // ---------- Vorschau ----------
  let pw = 0, ph = 0;
  function fitPreview() {
    if (!S.src) { preview.classList.add('hidden'); renderEmpty(); return; }
    preview.classList.remove('hidden');
    const empty = wrap.querySelector('.empty');
    if (empty) empty.remove();
    const lay = computeLayout(S.project, S.src.w, S.src.h);
    const r = wrap.getBoundingClientRect();
    const availW = Math.max(100, r.width - 44), availH = Math.max(100, r.height - 44);
    const A = lay.paperMM[0] / lay.paperMM[1];
    let cw = availW, ch = availW / A;
    if (ch > availH) { ch = availH; cw = availH * A; }
    preview.style.width = Math.round(cw) + 'px';
    preview.style.height = Math.round(ch) + 'px';
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let W = Math.round(cw * dpr), H = Math.round(ch * dpr);
    const maxArea = 4.2e6;
    if (W * H > maxArea) { const s = Math.sqrt(maxArea / (W * H)); W = Math.round(W * s); H = Math.round(H * s); }
    pw = W; ph = H;
    render();
  }
  function project() {
    if (!compare) return S.project;
    const p = structuredClone(S.project);
    p.style = 'galerie';
    p.params.galerie = { ...p.params.galerie, ...S.project.params[S.project.style], plate: 0, keyline: 0, ground: 'paper' };
    p.look = { id: 'original', strength: 0, grain: 0, grainSize: 0.07 };
    return p;
  }
  function render(scale = 1) {
    if (!S.src || !pw || eng.lost) return;
    const p = project();
    const lay = computeLayout(p, S.src.w, S.src.h);
    const w = Math.max(16, Math.round(pw * scale)), hh = Math.max(16, Math.round(ph * scale));
    const hasPaint = S.mask && !S.mask.empty;
    const u = printUniforms(p, lay, S.src, { outW: w, outH: hh, flipY: 1, showPaint: mode === 'paint', hasPaint });
    eng.draw('print', u, textures(), { w, h: hh });
    eng.blitTo(preview);
    updateInfo(lay);
  }
  const textures = () => ({ u_src: S.src.tex, u_field: S.fieldTex, u_paint: S.paintTex });
  const renderFast = rafThrottle(() => render(0.5));
  const renderFull = debounce(() => render(1), 160);
  const changed = () => { renderFast(); renderFull(); saveProject(); };

  function updateInfo(lay) {
    const s = lay.size;
    const inch = `${num(mmToIn(lay.paperMM[0]), 1)} × ${num(mmToIn(lay.paperMM[1]), 1)} in`;
    const cm = `${num(lay.paperMM[0] / 10, 1)} × ${num(lay.paperMM[1] / 10, 1)} cm`;
    const up = lay.upscale;
    const verdict = up <= 1.05 ? 'Originalauflösung reicht' : up <= 2 ? 'leicht hochgerechnet – gut' : up <= 3.5 ? 'hochgerechnet – Körnung hilft' : 'stark hochgerechnet – eher kleiner drucken';
    info.replaceChildren(
      h('span', h('b', s.unit === 'in' ? inch : cm), ' · ', s.unit === 'in' ? cm : inch),
      h('span', h('b', `${num(lay.W)} × ${num(lay.H)} px`), ` bei ${lay.dpi} dpi`),
      h('span', `Foto: ${num(Math.round(lay.srcPpi))} ppi im Druck · ${verdict}`));
  }

  // ---------- Interaktion auf der Vorschau ----------
  function previewToUV(e) {
    const r = preview.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    const lay = computeLayout(S.project, S.src.w, S.src.h);
    const ir = lay.imgRect, cr = lay.crop;
    const iu = (x - ir[0]) / (ir[2] - ir[0]), iv = (y - ir[1]) / (ir[3] - ir[1]);
    return { x, y, u: cr[0] + iu * (cr[2] - cr[0]), v: cr[1] + iv * (cr[3] - cr[1]), lay, r };
  }
  const pts = new Map();
  let gesture = null;
  let lastPen = -1e9;
  // Handballen ignorieren, solange mit dem Apple Pencil gemalt wird
  const palm = (e) => mode === 'paint' && e.pointerType === 'touch' && performance.now() - lastPen < 4000;
  preview.addEventListener('pointerdown', (e) => {
    if (!S.src) return;
    if (e.pointerType === 'pen') lastPen = performance.now();
    if (palm(e)) return;
    preview.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (mode === 'crop') {
      const p = [...pts.values()];
      gesture = { crop: { ...S.project.crop }, p: p.map((q) => ({ ...q })), dist: p.length > 1 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0 };
    } else if (mode === 'paint') {
      if (pts.size > 1) return;
      S.mask.snapshot();
      const q = previewToUV(e);
      gesture = { last: q };
      paintAt(q, q, e);
    } else if (mode === 'loupe') showLoupe(e);
  });
  preview.addEventListener('pointermove', (e) => {
    if (!S.src) return;
    if (e.pointerType === 'pen') lastPen = performance.now();
    if (mode === 'loupe' && (pts.size || e.pointerType === 'mouse')) { showLoupe(e); }
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (mode === 'crop' && gesture) {
      const p = [...pts.values()];
      const lay = computeLayout(S.project, S.src.w, S.src.h);
      const r = preview.getBoundingClientRect();
      const winWpx = (lay.imgRect[2] - lay.imgRect[0]) * r.width, winHpx = (lay.imgRect[3] - lay.imgRect[1]) * r.height;
      if (p.length === 1 && gesture.p.length === 1) {
        S.project.crop.cx = gesture.crop.cx - ((p[0].x - gesture.p[0].x) / winWpx) * lay.cropSize[0];
        S.project.crop.cy = gesture.crop.cy - ((p[0].y - gesture.p[0].y) / winHpx) * lay.cropSize[1];
      } else if (p.length >= 2 && gesture.dist > 0) {
        const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
        S.project.crop.zoom = clamp(gesture.crop.zoom * (d / gesture.dist), 1, 8);
      }
      clampCrop();
      renderFast();
    } else if (mode === 'paint' && gesture && pts.size === 1) {
      const q = previewToUV(e);
      paintAt(gesture.last, q, e);
      gesture.last = q;
    }
  });
  const endPointer = (e) => {
    pts.delete(e.pointerId);
    if (!pts.size) {
      if (mode === 'crop' && gesture) { renderFull(); saveProject(); }
      if (mode === 'paint' && gesture) { renderFull(); saveProject(); }
      if (mode === 'loupe' && e.pointerType !== 'mouse') loupe.classList.add('hidden');
      gesture = null;
    } else if (mode === 'crop') {
      const p = [...pts.values()];
      gesture = { crop: { ...S.project.crop }, p: p.map((q) => ({ ...q })), dist: p.length > 1 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0 };
    }
  };
  preview.addEventListener('pointerup', endPointer);
  preview.addEventListener('pointercancel', endPointer);
  preview.addEventListener('pointerleave', (e) => { if (mode === 'loupe' && e.pointerType === 'mouse') loupe.classList.add('hidden'); });
  preview.addEventListener('wheel', (e) => {
    if (!S.src || mode !== 'crop') return;
    e.preventDefault();
    S.project.crop.zoom = clamp(S.project.crop.zoom * Math.exp(-e.deltaY * 0.0015), 1, 8);
    clampCrop(); renderFast(); renderFull(); saveProject();
  }, { passive: false });
  function clampCrop() {
    const lay = computeLayout(S.project, S.src.w, S.src.h);
    const [cw, ch] = lay.cropSize;
    S.project.crop.cx = clamp(S.project.crop.cx, cw / 2, 1 - cw / 2);
    S.project.crop.cy = clamp(S.project.crop.cy, ch / 2, 1 - ch / 2);
  }

  const brush = { mode: 'remove', size: 0.05, hardness: 0.35 };
  const uploadMask = rafThrottle(() => { eng.r8Texture(S.mask.data(), S.mask.w, S.mask.h, S.paintTex); render(0.5); });
  function paintAt(a, b, e) {
    const pressure = e.pointerType === 'pen' ? clamp(e.pressure || 0.5, 0.1, 1) : 0.8;
    const size = brush.size * (e.pointerType === 'pen' ? 0.5 + pressure : 1);
    S.mask.stroke(a.u, a.v, b.u, b.v, size, brush.mode, pressure);
    if (a === b) S.mask.dab(b.u, b.v, size, brush.mode, pressure, brush.hardness);
    uploadMask();
  }

  function showLoupe(e) {
    const lay = computeLayout(S.project, S.src.w, S.src.h);
    const r = preview.getBoundingClientRect();
    const wr = wrap.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    if (x < 0 || y < 0 || x > 1 || y > 1) { loupe.classList.add('hidden'); return; }
    loupe.classList.remove('hidden');
    const size = 300;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const L = Math.round(size * dpr);
    const gx = Math.round(x * lay.W - L / 2), gy = Math.round(y * lay.H - L / 2);
    const u = printUniforms(project(), lay, S.src, { outW: lay.W, outH: lay.H, tile: [gx, gy, L, L], flipY: 1, hasPaint: S.mask && !S.mask.empty });
    eng.draw('print', u, textures(), { w: L, h: L });
    eng.blitTo(loupe.querySelector('canvas'));
    let lx = e.clientX - wr.left + 24, ly = e.clientY - wr.top - size - 24;
    if (ly < 8) ly = e.clientY - wr.top + 24;
    if (lx + size > wr.width - 8) lx = e.clientX - wr.left - size - 24;
    loupe.style.left = lx + 'px'; loupe.style.top = ly + 'px';
    loupe.querySelector('.lp-label').textContent = `100 % · ${lay.dpi} dpi`;
  }

  compareBtn.addEventListener('pointerdown', () => { compare = true; render(); });
  const endCompare = () => { if (compare) { compare = false; render(); } };
  compareBtn.addEventListener('pointerup', endCompare);
  compareBtn.addEventListener('pointerleave', endCompare);
  compareBtn.addEventListener('pointercancel', endCompare);

  function setMode(v) {
    mode = v;
    modeSeg.setValue(v);
    preview.style.cursor = v === 'crop' ? 'grab' : v === 'paint' ? 'crosshair' : v === 'loupe' ? 'zoom-in' : 'default';
    loupe.classList.add('hidden');
    paintBar.classList.toggle('hidden', v !== 'paint');
    if (v === 'paint') buildPaintBar();
    if (v === 'paint' && S.src) {
      const st = styleById(S.project.style);
      if (!styleUsesMask(st, S.project.params[st.id])) toast('Die Maske wirkt bei „Aussparung“, beim Topografie-Übergang und beim organischen Büttenrand.', { timeout: 4200 });
    }
    render();
  }
  function buildPaintBar() {
    paintBar.replaceChildren(
      h('span.small', 'Pinsel:'),
      segmented([{ value: 'keep', label: 'Behalten' }, { value: 'remove', label: 'Entfernen' }, { value: 'erase', label: 'Radieren' }], brush.mode, (v) => { brush.mode = v; }),
      h('div', { style: { width: '160px' } }, slider({ label: 'Größe', min: 0.01, max: 0.2, step: 0.005, value: brush.size, format: (v) => Math.round(v * 100) + ' %', onInput: (v) => { brush.size = v; } })),
      btn('', () => { if (S.mask.undo()) { eng.r8Texture(S.mask.data(), S.mask.w, S.mask.h, S.paintTex); render(); saveProject(); } }, { cls: 'icon small ghost', iconName: 'undo', title: 'Rückgängig' }),
      btn('Maske leeren', () => { S.mask.snapshot(); S.mask.clear(); eng.r8Texture(S.mask.data(), S.mask.w, S.mask.h, S.paintTex); render(); saveProject(); }, { cls: 'small ghost' }),
      h('span.small.muted', 'Grob malen genügt – die Kante folgt automatisch natürlichen Linien. Apple Pencil: Druck = Pinselgröße.'));
  }

  // ---------- Seitenleiste ----------
  function renderEmpty() {
    if (wrap.querySelector('.empty')) return;
    const recent = h('div.project-list');
    wrap.append(h('div.empty', { style: { maxWidth: '560px' } },
      h('h3', 'Druckstudio'),
      h('p', 'Öffne ein Foto in voller Auflösung. Wähle einen Stil – Galerie, Aussparung, Edeldruck, Topografie, Linienstich oder Büttenrand – und exportiere druckfertige Dateien bis 24 × 36 Zoll bei 300 dpi, auf Wunsch gleich als Etsy-Set.'),
      h('div.row', { style: { justifyContent: 'center', margin: '14px 0 22px' } },
        btn('Foto öffnen', () => openFile(), { iconName: 'photoAdd', cls: 'primary' }),
        btn('Aus der Bibliothek', async () => {
          const { pickImages } = await import('../planner/picker.js');
          const ids = await pickImages({ multiple: false, title: 'Bild für den Druck' });
          if (ids && ids[0]) openImageId(ids[0]);
        }, { iconName: 'image' })),
      recent));
    db.all('prints').then((list) => {
      list.sort((a, b) => b.updated - a.updated).slice(0, 6).forEach((p) => recent.append(projectCard(p)));
    });
  }
  function projectCard(p, onOpen) {
    const img = h('img', { alt: '' });
    if (p.thumb) img.src = URL.createObjectURL(p.thumb);
    return h('button.project-card', { type: 'button', onclick: () => { onOpen && onOpen(); loadSource(p.file, { rec: p }); } },
      h('div.pc-img', img), h('div', p.name), h('div.d', `${fmtDate(isoFromDate(new Date(p.updated)), { year: true })} · ${styleById(p.settings && p.settings.style).name}`));
  }
  async function openProjects() {
    const list = (await db.all('prints')).sort((a, b) => b.updated - a.updated);
    const grid = h('div.project-list');
    let sh;
    for (const p of list) {
      const card = projectCard(p, () => sh.close());
      const del = btn('', async (e) => {
        e.stopPropagation();
        if (!(await confirmDialog(`„${p.name}“ wird gelöscht.`, { title: 'Projekt löschen?', ok: 'Löschen', danger: true }))) return;
        await db.del('prints', p.id);
        card.parentElement.remove();
        if (S.rec && S.rec.id === p.id) { S.rec = null; S.project = null; disposeSource(); buildPanel(); fitPreview(); }
      }, { cls: 'icon small ghost', iconName: 'trash', title: 'Löschen' });
      grid.append(h('div', card, del));
    }
    if (!list.length) grid.append(h('p.muted', 'Noch keine Druckprojekte.'));
    sh = openSheet({ title: 'Druckprojekte', body: h('div', h('p.small.muted', 'Projekte werden automatisch gespeichert – mit Originalfoto, Stil, Ausschnitt und Maske.'), grid), narrow: true });
  }

  function styleThumb(st) {
    const key = st.id;
    if (S.styleThumbs.has(key)) return copyCanvas(S.styleThumbs.get(key));
    const p = structuredClone(S.project);
    p.style = st.id;
    p.sizeId = '16x20';
    const lay = computeLayout(p, S.src.w, S.src.h);
    const W = 150, H = Math.round(150 * lay.paperMM[1] / lay.paperMM[0]);
    eng.draw('print', printUniforms(p, lay, S.src, { outW: W, outH: H, flipY: 1, hasPaint: S.mask && !S.mask.empty }), textures(), { w: W, h: H });
    const c = makeCanvas(W, H);
    eng.blitTo(c);
    S.styleThumbs.set(key, c);
    return copyCanvas(c);
  }
  function copyCanvas(c) {
    const d = makeCanvas(c.width, c.height);
    d.getContext('2d').drawImage(c, 0, 0);
    return d;
  }

  function lookThumb(lookId) {
    const W = 74, H = 92;
    const a = S.src.w / S.src.h, A = W / H;
    let cw, ch; if (a > A) { ch = 1; cw = A / a; } else { cw = 1; ch = a / A; }
    const crop = [0.5 - cw / 2, 0.5 - ch / 2, 0.5 + cw / 2, 0.5 + ch / 2];
    eng.draw('look', { u_outSize: [W, H], u_tile: [0, 0, W, H], u_flipY: 1, u_seed: 1, u_orient: S.src.orient, u_srcSize: [S.src.texW, S.src.texH], u_cubicB: 1 / 3, u_cubicC: 1 / 3, u_crop: crop, u_lookOn: 1, ...lookUniforms(lookId, 1, {}, undefined, { grainSize: 1, grainScale: 0 }) }, { u_src: S.src.tex }, { w: W, h: H });
    const c = makeCanvas(W, H);
    eng.blitTo(c);
    return c;
  }

  function buildPanel() {
    panel.replaceChildren();
    if (!S.project || !S.src) {
      panel.append(h('div.panel-group', h('h3', 'So funktioniert es'),
        h('p.small.muted', '1. Foto öffnen (am besten das Original aus der Kamera).'),
        h('p.small.muted', '2. Format und Auflösung wählen – die Anzeige sagt dir, ob das Foto für die Größe reicht.'),
        h('p.small.muted', '3. Stil wählen und einstellen. Mit „Lupe 100 %“ prüfst du Details in Druckgröße.'),
        h('p.small.muted', '4. Exportieren: einzelne Datei (JPEG/PNG) oder Etsy-Set mit allen gängigen Seitenverhältnissen (je ≤ 20 MB).'),
        h('p.small.muted', 'Alle Stile sind eigene, rein rechnerische Verfahren – keine KI, keine fremden Texturen. Rechte an den Fotos brauchst du natürlich selbst.')));
      return;
    }
    const P = S.project;
    const st = styleById(P.style);
    const sp = P.params[st.id];

    // Name
    const nameIn = h('input.input', { value: S.rec.name, oninput: () => { S.rec.name = nameIn.value; saveProject(); } });
    panel.append(h('div.panel-group', h('h3', 'Projekt'), field('Titel (für Dateinamen)', nameIn)));

    // Format
    const sizeSel = selectEl(SIZE_GROUPS.map((g) => ({ group: g.group, options: g.items.map((s) => ({ value: s.id, label: s.label + (s.note ? ` – ${s.note}` : '') })) })), P.sizeId,
      (v) => { P.sizeId = v; S.styleThumbs.clear(); fitPreview(); saveProject(); });
    panel.append(h('div.panel-group', h('h3', 'Format'),
      field('Größe', sizeSel),
      field('Ausrichtung', segmented([{ value: 'auto', label: 'Auto' }, { value: 'portrait', label: 'Hochformat' }, { value: 'landscape', label: 'Querformat' }], P.orient, (v) => { P.orient = v; fitPreview(); saveProject(); }, { block: true })),
      field('Auflösung (dpi)', segmented(DPI_OPTIONS.map((d) => ({ value: d, label: String(d) })), P.dpi, (v) => { P.dpi = v; render(); saveProject(); }, { block: true })),
      h('p.small.muted', '300 dpi ist Standard für Kunstdrucke. Bei sehr großen Formaten genügen 200–240 dpi, weil man sie aus größerer Entfernung betrachtet.')));

    // Stil
    const cards = h('div.style-cards');
    for (const s of STYLES) {
      const box = h('div.sc-img');
      const card = h('button.style-card', { type: 'button', 'aria-pressed': String(s.id === P.style), onclick: () => { P.style = s.id; buildPanel(); fitPreview(); saveProject(); } }, box, s.name);
      cards.append(card);
      requestAnimationFrame(() => { try { box.append(styleThumb(s)); } catch (e) { console.error(e); } });
    }
    panel.append(h('div.panel-group', h('h3', 'Stil'), cards, h('p.style-desc', st.desc)));

    // Stil-Parameter, gruppiert
    const groups = new Map();
    for (const d of st.params) {
      if (d.showIf && !d.showIf(sp)) continue;
      if (!groups.has(d.group)) groups.set(d.group, []);
      groups.get(d.group).push(d);
    }
    for (const [g, defs] of groups) {
      const box = h('div.panel-group', h('h3', g));
      for (const d of defs) box.append(control(d, sp));
      panel.append(box);
    }

    // Rand & Untergrund
    const gtype = GROUNDS[sp.ground] || GROUNDS.paper;
    const tones = h('div.swatches');
    for (const [hex, label] of gtype.tones) {
      tones.append(h('button.swatch', { type: 'button', title: label, style: { background: hex, outline: sp.tone === hex ? '2px solid var(--ink)' : 'none', outlineOffset: '2px' },
        onclick: () => { sp.tone = hex; buildPanel(); changed(); } }));
    }
    const custom = h('input', { type: 'color', value: sp.tone, oninput: () => { sp.tone = custom.value; changed(); } });
    tones.append(h('label.swatch', { title: 'Eigene Farbe', style: { background: 'conic-gradient(#d8cdbb, #b9c2c9, #c9b7b0, #d8cdbb)' } }, custom));
    const inks = h('div.swatches');
    for (const [hex, label] of INKS) inks.append(h('button.swatch', { type: 'button', title: label, style: { background: hex, outline: sp.ink === hex ? '2px solid var(--ink)' : 'none', outlineOffset: '2px' }, onclick: () => { sp.ink = hex; buildPanel(); changed(); } }));
    const usesInk = ['galerie', 'topografie', 'linienstich', 'aussparung'].includes(st.id);
    panel.append(h('div.panel-group', h('h3', 'Rand & Untergrund'),
      slider({ label: 'Rand (Passepartout)', min: 0, max: 0.3, step: 0.005, value: sp.border, format: (v) => Math.round(v * 100) + ' %', onInput: (v) => { sp.border = v; changed(); } }),
      sp.border > 0 ? slider({ label: 'Unten mehr Rand', min: 0, max: 1, step: 0.01, value: sp.bottomExtra, format: (v) => '+' + Math.round(v * 100) + ' %', onInput: (v) => { sp.bottomExtra = v; changed(); } }) : null,
      field('Untergrund', segmented(Object.entries(GROUNDS).map(([k, v]) => ({ value: k, label: v.label.split(' (')[0] })), sp.ground, (v) => {
        sp.ground = v; sp.tone = GROUNDS[v].tones[0][0]; if (v === 'transparent') P.exportFormat = 'png'; buildPanel(); changed();
      })),
      h('p.small.muted', { style: { margin: '-4px 0 10px' } }, sp.ground === 'plain' ? 'Freiflächen bleiben reinweiß – beim Druck auf echtes Leinen oder Büttenpapier zeigt sich dort das Material selbst.' : sp.ground === 'transparent' ? 'Freiflächen werden durchsichtig (nur PNG) – für Druckereien, die unbedruckte Stellen frei lassen.' : sp.ground === 'linen' ? 'Simuliertes Leinengewebe – für Drucke auf Papier mit Leinenwirkung.' : 'Simuliertes Büttenpapier mit feiner Struktur.'),
      sp.ground === 'paper' || sp.ground === 'linen' ? h('div', field('Ton', tones), slider({ label: 'Struktur', min: 0, max: 1, step: 0.01, value: sp.texture, format: (v) => Math.round(v * 100) + ' %', onInput: (v) => { sp.texture = v; changed(); } })) : null,
      usesInk ? field('Linien- / Tuschefarbe', inks) : null));

    // Farbe & Korn
    const looks = h('div.look-strip');
    for (const l of LOOKS) {
      const lk = h('div.lk');
      const card = h('button.look-card', { type: 'button', 'aria-pressed': String((P.look.id || 'original') === l.id), title: l.note, onclick: () => {
        P.look.id = l.id; for (const c of looks.children) c.setAttribute('aria-pressed', 'false'); card.setAttribute('aria-pressed', 'true'); changed();
      } }, lk, l.name);
      looks.append(card);
      requestAnimationFrame(() => lk.append(lookThumb(l.id)));
    }
    panel.append(h('div.panel-group', h('h3', 'Farbe & Korn'), looks,
      slider({ label: 'Stärke des Looks', min: 0, max: 1, step: 0.01, value: P.look.strength ?? 1, format: (v) => Math.round(v * 100) + ' %', onInput: (v) => { P.look.strength = v; changed(); } }),
      slider({ label: 'Filmkorn', min: 0, max: 1.2, step: 0.01, value: P.look.grain ?? 0.35, format: (v) => Math.round(v * 100) + ' %', onInput: (v) => { P.look.grain = v; changed(); } }),
      slider({ label: 'Korngröße', min: 0.03, max: 0.25, step: 0.005, value: P.look.grainSize ?? 0.07, format: (v) => num(v, 2) + ' mm', onInput: (v) => { P.look.grainSize = v; changed(); } }),
      slider({ label: 'Schärfe beim Hochrechnen', min: 0, max: 1, step: 0.01, value: P.look.sharp ?? 0, format: (v) => Math.round(v * 100) + ' %', onInput: (v) => { P.look.sharp = v; changed(); } }),
      h('p.small.muted', 'Feines Korn lässt hochgerechnete Fotos im Druck natürlich und analog wirken – statt glatt und künstlich.')));

    // Variante
    panel.append(h('div.panel-group', h('h3', 'Variante'),
      h('div.row', btn('Neu würfeln', () => { P.seed = Math.floor(Math.random() * 1e9); S.styleThumbs.clear(); changed(); seedLabel.textContent = '#' + P.seed; }, { iconName: 'dice', cls: 'small' }), (() => { const s = h('span.mono', '#' + P.seed); seedLabel = s; return s; })()),
      h('p.small.muted', 'Rauschen, Fasern und Pinselstriche sind zufällig, aber reproduzierbar: Dieselbe Nummer ergibt immer dasselbe Ergebnis.')));

    // Export
    panel.append(exportGroup());
  }
  let seedLabel = null;

  function control(d, sp) {
    const v = sp[d.key] ?? d.def;
    if (d.type === 'range') {
      const fmt = (x) => (d.unit === 'mm' ? num(x, x < 10 ? 1 : 0) + ' mm' : d.unit === '°' ? Math.round(x) + '°' : d.max > 5 ? String(Math.round(x)) : Math.round(x * 100) + ' %');
      return slider({ label: d.label, min: d.min, max: d.max, step: d.step, value: v, format: fmt, onInput: (x) => { sp[d.key] = x; changed(); } });
    }
    if (d.type === 'toggle') return toggle(d.label, !!+v, (x) => { sp[d.key] = x ? 1 : 0; buildPanel(); changed(); });
    if (d.type === 'select') {
      const opts = d.options.map(([value, label]) => ({ value, label }));
      const onPick = (x) => { sp[d.key] = typeof d.def === 'number' ? Number(x) : x; buildPanel(); changed(); };
      if (opts.length <= 3) return field(d.label, segmented(opts, v, onPick, { block: true }));
      return field(d.label, selectEl(opts, v, onPick));
    }
    return h('div');
  }

  function exportGroup() {
    const P = S.project;
    const box = h('div.panel-group', h('h3', 'Export'));
    const transparent = P.params[P.style].ground === 'transparent';
    if (transparent) P.exportFormat = 'png';
    box.append(field('Dateiformat', segmented([{ value: 'jpeg', label: 'JPEG' }, { value: 'png', label: 'PNG (verlustfrei)' }], P.exportFormat, (v) => {
      if (transparent && v === 'jpeg') { toast('Transparenz geht nur mit PNG.'); return; }
      P.exportFormat = v; buildPanel(); saveProject();
    })));
    if (P.exportFormat === 'jpeg') box.append(slider({ label: 'JPEG-Qualität', min: 70, max: 100, step: 1, value: P.quality, format: (v) => v + (v >= 95 ? ' (4:4:4)' : ''), onChange: (v) => { P.quality = v; saveProject(); } }));
    else box.append(h('p.small.muted', 'PNG ist verlustfrei, aber sehr groß (bei 24 × 36 in schnell über 100 MB) – ideal für Druckereien, nicht für Etsy-Downloads.'));
    box.append(h('div.row', { style: { margin: '6px 0 14px' } }, btn('Datei exportieren', () => doExport(), { iconName: 'download', cls: 'primary' })));

    // Etsy
    const sel = new Set(P.etsySizes || ETSY_SET.filter((e) => e.def).map((e) => e.id));
    const checks = h('div');
    for (const e of ETSY_SET) {
      const s = sizeById(e.id);
      const cb = h('input', { type: 'checkbox', checked: sel.has(e.id), onchange: () => { if (cb.checked) sel.add(e.id); else sel.delete(e.id); P.etsySizes = [...sel]; saveProject(); countLbl.textContent = countText(); } });
      checks.append(h('label.check-row', cb, h('span', h('b', e.ratio), ` · ${s.label}`)));
    }
    const countText = () => `${sel.size} Datei(en)` + (sel.size > 5 ? ' – Etsy erlaubt höchstens 5 pro Angebot' : '');
    const countLbl = h('span.small.muted', countText());
    box.append(h('div.section-title', 'Etsy-Set (digitale Downloads)'),
      h('p.small.muted', 'Je Seitenverhältnis die größte gängige Datei, damit Käufer in viele Rahmen drucken können. Jede Datei wird automatisch unter 20 MB gehalten (Qualität, notfalls Auflösung leicht reduziert).'),
      checks, h('div.row', { style: { marginTop: '6px' } }, btn('Etsy-Set exportieren', () => doEtsy([...sel]), { iconName: 'layers' }), countLbl));

    // Ergebnisse
    if (S.results.length) {
      const list = h('div.export-list');
      for (const r of S.results) {
        list.append(h('div.export-item', icon('image', 20),
          h('div.grow', h('div', r.name), h('div.t2', `${num(r.W)} × ${num(r.H)} px · ${r.dpi} dpi · ${bytesFmt(r.blob.size)}${r.quality ? ' · Q' + r.quality : ''}${r.blob.size > ETSY_MAX_BYTES ? ' · über 20 MB' : ''}`)),
          btn('', () => shareOrDownload([new File([r.blob], r.name, { type: r.blob.type })], { title: r.name }), { cls: 'icon small ghost', iconName: 'share', title: 'Teilen / sichern' }),
          btn('', () => downloadBlob(r.blob, r.name), { cls: 'icon small ghost', iconName: 'download', title: 'Herunterladen' })));
      }
      box.append(h('div.section-title', 'Fertige Dateien'), list,
        h('div.row', { style: { marginTop: '8px' } },
          btn('Alle teilen / sichern', () => shareOrDownload(S.results.map((r) => new File([r.blob], r.name, { type: r.blob.type })), { title: 'Druckdateien' }), { iconName: 'share', cls: 'small primary' }),
          btn('Liste leeren', () => { S.results = []; buildPanel(); }, { cls: 'small ghost' })),
        h('p.small.muted', { style: { marginTop: '6px' } }, 'Im Teilen-Menü „In Dateien sichern“ wählen – von dort kannst du sie bei Etsy hochladen.'));
    }
    return box;
  }

  async function doExport() {
    const P = S.project;
    const lay = computeLayout(P, S.src.w, S.src.h);
    const ac = new AbortController();
    const prog = progressOverlay(`${num(lay.W)} × ${num(lay.H)} px werden gerechnet`, { onCancel: () => ac.abort() });
    try {
      const fmt = P.exportFormat === 'png' ? 'png' : 'jpeg';
      const t0 = performance.now();
      const blob = await exportFile(eng, P, lay, S.src, textures(), S.mask && !S.mask.empty, {
        format: fmt, quality: P.quality, subsample: P.quality < 95, alpha: P.params[P.style].ground === 'transparent', signal: ac.signal,
        onProgress: (f) => prog.set(f, `${Math.round(f * 100)} % · ${Math.round((performance.now() - t0) / 1000)} s`),
      });
      S.results.unshift({ name: fileNameFor(S.rec.name, lay, fmt === 'png' ? 'png' : 'jpg'), blob, W: lay.W, H: lay.H, dpi: lay.dpi, quality: fmt === 'jpeg' ? P.quality : null });
      prog.close();
      buildPanel();
      panel.scrollTop = panel.scrollHeight;
      toast(`Fertig: ${bytesFmt(blob.size)} – unten in „Fertige Dateien“ teilen oder sichern.`, { timeout: 4500 });
    } catch (e) {
      prog.close();
      if (e.name !== 'AbortError') { console.error(e); toast('Export fehlgeschlagen: ' + e.message, { bad: true, timeout: 6000 }); }
    }
  }

  async function doEtsy(sizeIds) {
    if (!sizeIds.length) { toast('Bitte mindestens ein Format wählen.'); return; }
    const ac = new AbortController();
    const prog = progressOverlay('Etsy-Set wird erstellt', { onCancel: () => ac.abort() });
    try {
      const res = await exportEtsySet(eng, S.project, S.src, textures(), S.mask && !S.mask.empty, sizeIds, {
        baseName: S.rec.name, signal: ac.signal,
        onProgress: (f) => prog.set(f), onStatus: (m) => prog.set(undefined, m),
      });
      for (const r of res.reverse()) S.results.unshift({ name: r.name, blob: r.blob, W: r.layout.W, H: r.layout.H, dpi: r.layout.dpi, quality: r.quality });
      prog.close();
      buildPanel();
      panel.scrollTop = panel.scrollHeight;
      toast(`${res.length} Dateien fertig – alle unter 20 MB.`, { timeout: 4000 });
    } catch (e) {
      prog.close();
      if (e.name !== 'AbortError') { console.error(e); toast('Etsy-Set fehlgeschlagen: ' + e.message, { bad: true, timeout: 6000 }); }
    }
  }

  async function openImageId(imageId) {
    const im = store.images.get(imageId);
    if (!im) return;
    await loadSource(im.blob, { name: im.name || 'Druck' });
  }

  const onRestore = () => {
    if (S.rec && S.rec.file) { S.src = null; S.fieldTex = null; S.paintTex = null; loadSource(S.rec.file, { rec: { ...S.rec, settings: S.project } }); }
  };
  eng.restoreHandlers.add(onRestore);
  const ro = new ResizeObserver(() => fitPreview());
  ro.observe(wrap);
  buildPanel();
  requestAnimationFrame(() => {
    fitPreview();
    if (ctx.pendingPrintImage) { const id = ctx.pendingPrintImage; ctx.pendingPrintImage = null; openImageId(id); }
  });

  return {
    el: root,
    destroy: () => { ro.disconnect(); eng.restoreHandlers.delete(onRestore); saveProject.flush && saveProject.flush(); },
    openImageId,
  };
}
