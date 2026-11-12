// Bibliothek: alle importierten Bilder, Auswahl → Beiträge / Stories.
import { h, btn, openSheet, toast, confirmDialog, pickFiles, segmented, popMenu } from '../core/ui.js';
import { store } from '../core/store.js';
import { importFiles } from './picker.js';
import { openPostEditor } from './post-editor.js';
import { openStoryEditor } from '../stories/story-editor.js';
import { renderImage, resolveLook, dropTextures } from './render.js';
import { fmtDate, isoFromDate } from '../core/util.js';

let filter = 'alle';

export function libraryView({ go, openInPrint }) {
  const root = h('div.view');
  const sub = h('span.sub');
  let selecting = false;
  const selected = new Set();
  const selBtn = btn('Auswählen', () => { selecting = !selecting; selected.clear(); render(); }, { cls: 'ghost' });
  const head = h('div.view-head', h('h1', 'Bilder'), sub, h('div.spacer'),
    selBtn,
    btn('Importieren', () => doImport(), { iconName: 'photoAdd', cls: 'primary' }));
  const body = h('div.view-body');
  root.append(head, body);

  async function doImport() {
    const files = await pickFiles({ multiple: true });
    if (!files.length) return;
    const recs = await importFiles(files);
    if (recs.length) toast(`${recs.length} Bild(er) importiert`);
  }

  // Ziehen & Ablegen (Mac/Desktop, im Split-View auf dem iPad auch aus Dateien)
  body.addEventListener('dragover', (e) => { e.preventDefault(); });
  body.addEventListener('drop', async (e) => {
    e.preventDefault();
    const files = [...(e.dataTransfer?.files || [])];
    if (files.length) { const r = await importFiles(files); if (r.length) toast(`${r.length} Bild(er) importiert`); }
  });

  function render() {
    selBtn.textContent = selecting ? 'Fertig' : 'Auswählen';
    const all = [...store.images.values()].sort((a, b) => b.created - a.created);
    const used = (im) => store.usage(im.id) > 0;
    const list = all.filter((im) => filter === 'alle' || (filter === 'frei' ? !used(im) : used(im)));
    sub.textContent = `${all.length} Bilder · ${all.filter((im) => !used(im)).length} unbenutzt`;
    body.replaceChildren();
    body.append(h('div.row.wrap', { style: { marginBottom: '14px' } },
      segmented([{ value: 'alle', label: 'Alle' }, { value: 'frei', label: 'Unbenutzt' }, { value: 'benutzt', label: 'Verwendet' }], filter, (v) => { filter = v; render(); })));
    if (!all.length) {
      body.append(h('div.empty',
        h('h3', 'Deine Bildbibliothek'),
        h('p', 'Importiere Fotos aus der Mediathek. Sie werden nur auf diesem Gerät gespeichert. Hier ordnest du sie Beiträgen und Stories zu.'),
        btn('Bilder importieren', () => doImport(), { iconName: 'photoAdd', cls: 'primary' })));
      return;
    }
    const grid = h('div.lib-grid' + (selecting ? '.selecting' : ''));
    for (const im of list) {
      const use = store.usage(im.id);
      const it = h('div.lib-item' + (selected.has(im.id) ? '.selected' : ''), {
        onclick: () => {
          if (!selecting) { openDetail(im.id); return; }
          if (selected.has(im.id)) selected.delete(im.id); else selected.add(im.id);
          it.classList.toggle('selected');
          renderSelbar();
        },
      }, h('img', { src: store.thumbUrl(im.id), alt: '', loading: 'lazy' }), use ? h('span.use', `${use}× verwendet`) : null, h('span.check'));
      grid.append(it);
    }
    body.append(grid);
    if (selecting) { body.append(selbar); renderSelbar(); }
  }

  const selbar = h('div.selbar');
  function renderSelbar() {
    const n = selected.size;
    selbar.replaceChildren(
      h('span.small', n ? `${n} ausgewählt` : 'Bilder antippen'),
      h('div.spacer'),
      btn('Ein Beitrag (Karussell)', () => createPosts(false), { cls: 'small', disabled: !n }),
      btn('Je ein Beitrag', () => createPosts(true), { cls: 'small', disabled: !n }),
      btn('Story', () => createStory(), { cls: 'small', disabled: !n }),
      btn('Löschen', () => removeSelected(), { cls: 'small danger', disabled: !n }));
  }

  async function createPosts(each) {
    const ids = [...selected];
    if (each) {
      let date = null;
      for (const id of ids) {
        date = store.nextFreeSlot('post');
        const p = store.newPost({ date, status: 'entwurf', slides: [{ imageId: id, crop: {} }] });
        await store.savePost(p, { silent: true });
      }
      store.emit('posts');
      toast(`${ids.length} Beiträge an den nächsten Posting-Tagen eingeplant`);
      selecting = false; selected.clear(); render();
      go('raster');
    } else {
      const p = store.newPost({ date: store.nextFreeSlot('post'), status: 'entwurf', slides: ids.slice(0, 20).map((imageId) => ({ imageId, crop: {} })) });
      await store.savePost(p);
      selecting = false; selected.clear(); render();
      openPostEditor(p.id);
    }
  }
  async function createStory() {
    const ids = [...selected];
    const { framesFromImages } = await import('../stories/templates.js');
    const s = store.newStory({ date: store.nextFreeSlot('story'), frames: framesFromImages(ids) });
    await store.saveStory(s);
    selecting = false; selected.clear(); render();
    openStoryEditor(s.id);
  }
  async function removeSelected() {
    const n = selected.size;
    if (!(await confirmDialog(`${n} Bild(er) werden aus der Bibliothek gelöscht und aus Beiträgen/Stories entfernt.`, { title: 'Bilder löschen?', ok: 'Löschen', danger: true }))) return;
    for (const id of selected) { dropTextures(id); await store.deleteImage(id); }
    selected.clear(); render();
  }

  async function openDetail(id) {
    const im = store.images.get(id);
    if (!im) return;
    const stage = h('div', { style: { background: 'var(--stage)', borderRadius: '10px', padding: '14px', display: 'flex', justifyContent: 'center' } });
    const usedIn = [];
    for (const p of store.posts.values()) if (p.slides.some((s) => s.imageId === id)) usedIn.push({ label: `Beitrag ${p.date ? fmtDate(p.date) : '(Idee)'}`, open: () => openPostEditor(p.id) });
    for (const s of store.stories.values()) if (s.frames.some((f) => (f.images || []).some((sl) => sl && sl.imageId === id))) usedIn.push({ label: `Story ${s.date ? fmtDate(s.date) : ''}`, open: () => openStoryEditor(s.id) });
    const sh = openSheet({
      title: im.name || 'Bild',
      body: h('div', stage,
        h('p.small.muted', { style: { marginTop: '10px' } }, `${im.origW || im.w} × ${im.origH || im.h} px (Original) · importiert ${fmtDate(isoFromDate(new Date(im.created)), { year: true })} · Vorschau mit Feed-Look`),
        usedIn.length ? h('div', h('div.section-title', 'Verwendet in'), ...usedIn.map((u) => h('button.chip', { type: 'button', style: { marginRight: '6px' }, onclick: () => { sh.close(); u.open(); } }, u.label))) : h('p.small.muted', 'Noch in keinem Beitrag verwendet.'),
        h('div.row.wrap', { style: { marginTop: '16px' } },
          btn('Neuer Beitrag', async () => { const p = store.newPost({ date: store.nextFreeSlot('post'), status: 'entwurf', slides: [{ imageId: id, crop: {} }] }); await store.savePost(p); sh.close(); openPostEditor(p.id); }, { iconName: 'plus', cls: 'primary' }),
          btn('Neue Story', async () => { const { framesFromImages } = await import('../stories/templates.js'); const s = store.newStory({ date: store.nextFreeSlot('story'), frames: framesFromImages([id]) }); await store.saveStory(s); sh.close(); openStoryEditor(s.id); }, { iconName: 'story' }),
          btn('Im Druckstudio öffnen', () => { sh.close(); openInPrint(id); }, { iconName: 'print' }),
          btn('Als Profilbild', async () => { await store.saveSettings({ account: { avatarImageId: id } }); toast('Profilbild für die Vorschau gesetzt'); }, { cls: 'ghost' }),
          btn('Löschen', async () => {
            if (await confirmDialog('Das Bild wird gelöscht und aus Beiträgen/Stories entfernt.', { title: 'Bild löschen?', ok: 'Löschen', danger: true })) { dropTextures(id); await store.deleteImage(id); sh.close(); }
          }, { cls: 'ghost danger', iconName: 'trash' }))),
      narrow: false,
    });
    const max = 1400;
    const w = im.w >= im.h ? max : Math.round((max * im.w) / im.h), hh = im.w >= im.h ? Math.round((max * im.h) / im.w) : max;
    const c = await renderImage(id, { outW: w, outH: hh, look: resolveLook(null, id) });
    c.style.maxWidth = '100%'; c.style.maxHeight = '62vh'; c.style.width = 'auto'; c.style.height = 'auto';
    stage.append(c);
  }

  const off = store.on((t) => { if (t === 'images' || t === 'posts' || t === 'stories') render(); });
  render();
  return { el: root, destroy: off, actions: { import: doImport } };
}

export { popMenu };
