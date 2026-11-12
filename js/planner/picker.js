// Bilder aus der Bibliothek auswählen (oder neu importieren).
import { h, openSheet, btn, toast, pickFiles, progressOverlay } from '../core/ui.js';
import { store } from '../core/store.js';
import { prepareImport } from '../core/imageio.js';

/** Importiert Dateien in die Bibliothek. Rückgabe: neue Bild-Datensätze. */
export async function importFiles(files) {
  const list = [...files].filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|heic|heif|webp|avif)$/i.test(f.name));
  if (!list.length) return [];
  const prog = progressOverlay(list.length > 1 ? `${list.length} Bilder werden importiert` : 'Bild wird importiert');
  const out = [];
  let failed = 0;
  for (let i = 0; i < list.length; i++) {
    prog.set(i / list.length, list[i].name);
    try {
      const prep = await prepareImport(list[i]);
      out.push(await store.addImage(prep, list[i].name.replace(/\.[^.]+$/, '')));
    } catch (e) {
      console.error(e);
      failed++;
    }
  }
  prog.close();
  if (failed) toast(`${failed} Datei(en) konnten nicht gelesen werden.`, { bad: true });
  return out;
}

/** Öffnet die Auswahl. Rückgabe: Promise<string[]> (Bild-IDs). */
export function pickImages({ multiple = true, title = 'Bilder wählen', preselect = [] } = {}) {
  return new Promise((resolve) => {
    const selected = new Set(preselect);
    let done = false;
    const grid = h('div.lib-grid.selecting');
    const count = h('span.small.muted');
    const render = () => {
      grid.replaceChildren();
      const imgs = [...store.images.values()].sort((a, b) => b.created - a.created);
      if (!imgs.length) grid.append(h('div.empty', { style: { gridColumn: '1 / -1' } }, h('h3', 'Noch keine Bilder'), h('p', 'Importiere Bilder aus deiner Mediathek.')));
      for (const im of imgs) {
        const use = store.usage(im.id);
        const it = h('div.lib-item' + (selected.has(im.id) ? '.selected' : ''), {
          onclick: () => {
            if (!multiple) { selected.clear(); selected.add(im.id); finish(); return; }
            if (selected.has(im.id)) selected.delete(im.id); else selected.add(im.id);
            it.classList.toggle('selected');
            count.textContent = selected.size ? `${selected.size} ausgewählt` : '';
          },
        }, h('img', { src: store.thumbUrl(im.id), alt: '', loading: 'lazy' }), use ? h('span.use', `${use}×`) : null, h('span.check'));
        grid.append(it);
      }
      count.textContent = selected.size ? `${selected.size} ausgewählt` : '';
    };
    const finish = () => { if (done) return; done = true; sheet.close('done'); resolve([...selected]); };
    const sheet = openSheet({
      title,
      body: h('div', h('div.row', { style: { marginBottom: '12px' } },
        btn('Aus Fotos importieren', async () => {
          const files = await pickFiles({ multiple: true });
          const recs = await importFiles(files);
          for (const r of recs) selected.add(r.id);
          render();
        }, { iconName: 'photoAdd' }), h('div.spacer'), count), grid),
      left: [btn('Abbrechen', () => { done = true; sheet.close('cancel'); resolve(null); }, { cls: 'ghost small' })],
      right: multiple ? [btn('Übernehmen', () => finish(), { cls: 'primary small' })] : [],
      onClose: () => { if (!done) { done = true; resolve(null); } },
    });
    render();
  });
}
