// Einstellungen, Sicherung & Wiederherstellung.
import { h, btn, field, segmented, slider, toggle, toast, confirmDialog, pickFiles, progressOverlay } from './core/ui.js';
import { store } from './core/store.js';
import { db, requestPersistence, storageEstimate, STORES } from './core/db.js';
import { makeZip, readZip } from './core/zip.js';
import { bytesFmt, todayISO, downloadBlob, shareOrDownload, WEEKDAYS_SHORT, uid, debounce } from './core/util.js';
import { openFeedLookSheet } from './planner/feedlook.js';
import { openBrandEditor } from './stories/brand-editor.js';
import { lookById } from './gl/looks.js';
import { IN_CLAUDE } from './core/platform.js';

export const APP_VERSION = '1.0.0';

export function settingsView() {
  const root = h('div.view');
  const body = h('div.view-body');
  root.append(h('div.view-head', h('h1', 'Einstellungen')), body);
  const save = debounce((patch) => store.saveSettings(patch), 300);

  function render() {
    const s = store.settings;
    body.replaceChildren();
    const wrap = h('div.settings');
    body.append(wrap);

    // Konto
    const name = h('input.input', { value: s.account.name, oninput: () => save({ account: { name: name.value } }) });
    const handle = h('input.input', { value: s.account.handle, oninput: () => save({ account: { handle: handle.value.replace(/^@/, '') } }) });
    wrap.append(h('div.card', h('h2', 'Profil'), h('p.muted', 'Nur für die Vorschau im Raster und im Telefonrahmen.'),
      h('div.two-col', field('Name', name), field('Benutzername', handle))));

    // Rhythmus
    const days = h('div.weekday-pick');
    WEEKDAYS_SHORT.forEach((d, i) => {
      const on = s.rhythm.days.includes(i);
      days.append(h('button', { type: 'button', 'aria-pressed': String(on), onclick: (e) => {
        const set = new Set(store.settings.rhythm.days);
        if (set.has(i)) set.delete(i); else set.add(i);
        e.currentTarget.setAttribute('aria-pressed', String(set.has(i)));
        store.saveSettings({ rhythm: { days: [...set].sort() } });
      } }, d));
    });
    const time = h('input.input', { type: 'time', value: s.rhythm.time, style: { maxWidth: '160px' }, onchange: () => store.saveSettings({ rhythm: { time: time.value } }) });
    wrap.append(h('div.card', h('h2', 'Posting-Rhythmus'), h('p.muted', 'Neue Beiträge landen automatisch auf dem nächsten freien Posting-Tag.'),
      field('Tage', days), field('Uhrzeit', time)));

    // Stil
    wrap.append(h('div.card', h('h2', 'Stil'), h('p.muted', `Feed-Look: ${lookById(s.feedLook.id).name} (${Math.round(s.feedLook.strength * 100)} %) · Angleichen ${Math.round(s.feedLook.harmonize * 100)} % · Story-Stil: ${s.brand.name || 'eigen'}`),
      h('div.row.wrap', btn('Feed-Look', () => openFeedLookSheet(), { iconName: 'palette' }), btn('Story-Stil', () => openBrandEditor(() => render()), { iconName: 'story' }))));

    // Hashtags
    const sets = h('div.set-list');
    const renderSets = () => {
      sets.replaceChildren();
      for (const hs of store.settings.hashtagSets) {
        const n = h('input.input', { value: hs.name, placeholder: 'Name', style: { maxWidth: '150px' } });
        const t = h('textarea.textarea', { value: hs.tags, rows: 2, placeholder: '#eins #zwei', style: { minHeight: '46px' } });
        const upd = () => { hs.name = n.value; hs.tags = t.value; save({ hashtagSets: store.settings.hashtagSets }); };
        n.addEventListener('input', upd); t.addEventListener('input', upd);
        sets.append(h('div.set-item', n, t, btn('', () => { store.saveSettings({ hashtagSets: store.settings.hashtagSets.filter((x) => x.id !== hs.id) }).then(renderSets); }, { cls: 'icon ghost', iconName: 'trash', title: 'Entfernen' })));
      }
    };
    renderSets();
    wrap.append(h('div.card', h('h2', 'Hashtags'),
      h('p.muted', 'Instagram erlaubt seit Ende 2025 nur noch wenige Hashtags pro Beitrag (laut Meldungen 5). Der Zähler im Editor warnt, sobald es zu viele sind.'),
      field('Höchstzahl', segmented([{ value: 3, label: '3' }, { value: 5, label: '5' }, { value: 10, label: '10' }, { value: 30, label: '30' }], s.hashtagLimit, (v) => store.saveSettings({ hashtagLimit: v }))),
      h('div.section-title', 'Gespeicherte Sets'), sets,
      h('div.row', { style: { marginTop: '8px' } }, btn('Set hinzufügen', () => { store.saveSettings({ hashtagSets: [...store.settings.hashtagSets, { id: uid(), name: 'Neu', tags: '' }] }).then(renderSets); }, { iconName: 'plus', cls: 'small' }))));

    // Export
    wrap.append(h('div.card', h('h2', 'Export für Instagram'),
      field('Bildbreite', segmented([{ value: 1080, label: '1080 px (Standard)' }, { value: 1440, label: '1440 px' }], s.exportWidth, (v) => store.saveSettings({ exportWidth: v }))),
      slider({ label: 'JPEG-Qualität', min: 0.8, max: 1, step: 0.01, value: s.jpegQuality, format: (v) => Math.round(v * 100) + ' %', onChange: (v) => store.saveSettings({ jpegQuality: v }) }),
      field('Darstellung', segmented([{ value: 'auto', label: 'automatisch' }, { value: 'light', label: 'hell' }, { value: 'dark', label: 'dunkel' }], s.theme, (v) => { store.saveSettings({ theme: v }); applyTheme(v); }))));

    // Daten
    const est = h('div.small.muted', 'Speicher wird ermittelt …');
    const meter = h('div.storage-meter', h('div', { style: { width: '0%' } }));
    storageEstimate().then((e) => {
      if (!e) { est.textContent = 'Speicherangabe nicht verfügbar.'; return; }
      est.textContent = `Belegt: ${bytesFmt(e.usage)} von ca. ${bytesFmt(e.quota)} · ${store.images.size} Bilder, ${store.posts.size} Beiträge, ${store.stories.size} Stories`;
      meter.firstChild.style.width = Math.min(100, (e.usage / e.quota) * 100).toFixed(1) + '%';
    });
    const persist = h('div.small.muted');
    if (IN_CLAUDE) persist.textContent = 'Atelier läuft gerade in Claude: Die Daten liegen im Speicher dieser Ansicht auf diesem Gerät. Erstelle regelmäßig eine Sicherung – damit bist du auf der sicheren Seite und kannst alles auch in eine installierte Version übernehmen.';
    else (navigator.storage && navigator.storage.persisted ? navigator.storage.persisted() : Promise.resolve(false)).then((p) => {
      persist.textContent = p ? 'Dauerhafter Speicher ist aktiv.' : 'Tipp: Zum Home-Bildschirm hinzufügen – dann löscht Safari die Daten nicht automatisch. Trotzdem regelmäßig sichern.';
    });
    let withPrints = false;
    wrap.append(h('div.card', h('h2', 'Daten & Sicherung'),
      h('p.muted', 'Alles bleibt auf diesem iPad – nichts wird hochgeladen. Eine Sicherung (ZIP) kannst du in „Dateien“ oder iCloud ablegen und später wieder einspielen.'),
      meter, est, persist,
      toggle('Druckprojekte (Originalbilder) mitsichern', false, (v) => { withPrints = v; }),
      h('div.row.wrap', { style: { marginTop: '6px' } },
        btn('Sicherung erstellen', () => exportBackup(withPrints), { iconName: 'download', cls: 'primary' }),
        btn('Sicherung einspielen', () => importBackup(), { iconName: 'folder' }),
        IN_CLAUDE ? null : btn('Speicher dauerhaft machen', async () => { const ok = await requestPersistence(); toast(ok ? 'Dauerhafter Speicher aktiv' : 'Der Browser hat abgelehnt – App zum Home-Bildschirm hinzufügen hilft.'); render(); }, { cls: 'ghost' })),
      h('div.row', { style: { marginTop: '14px' } }, btn('Alle Daten löschen', async () => {
        if (!(await confirmDialog('Alle Bilder, Beiträge, Stories, Druckprojekte und Einstellungen werden von diesem Gerät gelöscht.', { title: 'Wirklich alles löschen?', ok: 'Alles löschen', danger: true }))) return;
        for (const st of STORES) await db.clear(st);
        location.reload();
      }, { cls: 'ghost danger', iconName: 'trash' }))));

    wrap.append(h('div.card', h('h2', 'Über Atelier'),
      h('p.small.muted', `Version ${APP_VERSION}. Alle Looks und Druckstile sind eigene, rein rechnerische Verfahren (Farbkurven, Rauschen, Höhenlinien) – keine KI-Bildgenerierung, keine fremden Texturen oder Presets. Die mitgelieferten Schriften stehen unter der SIL Open Font License und dürfen auch kommerziell genutzt werden.`),
      h('p.small.muted', 'Rechte: Verkaufe nur Drucke von Fotos, an denen du die Rechte hast (eigene Fotos; bei erkennbaren Personen oder privaten Gebäuden ggf. Freigaben).'),
      IN_CLAUDE ? h('p.small.muted', 'Schriftlizenzen: siehe fonts/LICENSE-OFL.txt im Projekt.') : h('a.small', { href: 'fonts/LICENSE-OFL.txt', target: '_blank' }, 'Schriftlizenzen ansehen')));
  }

  const off = store.on((t) => { if (t === 'settings') { /* Felder nicht neu aufbauen während der Eingabe */ } });
  render();
  return { el: root, destroy: off };
}

let themeSetByApp = false;
export function applyTheme(v) {
  // „automatisch“ lässt eine Vorgabe der Umgebung (z. B. Claudes Hell/Dunkel) unangetastet
  if (v === 'light' || v === 'dark') { document.documentElement.dataset.theme = v; themeSetByApp = true; }
  else if (themeSetByApp) { delete document.documentElement.dataset.theme; themeSetByApp = false; }
}

async function exportBackup(withPrints) {
  const prog = progressOverlay('Sicherung wird erstellt');
  try {
    const files = [];
    const images = [...store.images.values()];
    const meta = images.map(({ blob, thumb, ...rest }) => rest);
    let prints = [];
    if (withPrints) {
      const all = await db.all('prints');
      prints = all.map(({ file, mask, thumb, ...rest }) => ({ ...rest, hasMask: !!mask }));
      all.forEach((p, i) => {
        prog.set(0.5 + (i / Math.max(1, all.length)) * 0.4, 'Druckprojekte');
        if (p.file) files.push({ name: `prints/${p.id}.bin`, data: p.file });
        if (p.mask) files.push({ name: `prints/${p.id}_mask.png`, data: p.mask });
        if (p.thumb) files.push({ name: `prints/${p.id}_thumb.jpg`, data: p.thumb });
      });
    }
    images.forEach((im) => {
      files.push({ name: `images/${im.id}.jpg`, data: im.blob });
      files.push({ name: `thumbs/${im.id}.jpg`, data: im.thumb });
    });
    const data = { app: 'atelier', version: 1, created: new Date().toISOString(), settings: store.settings, posts: [...store.posts.values()], stories: [...store.stories.values()], images: meta, prints };
    files.unshift({ name: 'data.json', data: JSON.stringify(data) });
    prog.set(0.9, 'ZIP wird geschrieben');
    const zip = await makeZip(files);
    prog.close();
    const file = new File([zip], `atelier-sicherung-${todayISO()}.zip`, { type: 'application/zip' });
    // Teilen braucht eine frische Geste → kleiner Dialog
    const { openSheet } = await import('./core/ui.js');
    openSheet({ title: 'Sicherung bereit', narrow: true, body: h('div', h('p.muted', `${file.name} · ${bytesFmt(file.size)}`),
      h('div.row.wrap', { style: { marginTop: '10px' } },
        btn('In Dateien sichern / teilen', () => shareOrDownload([file], { title: 'Atelier-Sicherung' }), { iconName: 'share', cls: 'primary' }),
        btn('Herunterladen', () => downloadBlob(file, file.name), { iconName: 'download' }))) });
  } catch (e) {
    prog.close();
    toast('Sicherung fehlgeschlagen: ' + e.message, { bad: true });
  }
}

async function importBackup() {
  const files = await pickFiles({ accept: '.zip,application/zip', multiple: false });
  if (!files.length) return;
  const replace = await confirmDialog('Sollen die vorhandenen Daten vorher gelöscht werden? „Zusammenführen“ behält sie und ergänzt die Sicherung.', { title: 'Sicherung einspielen', ok: 'Ersetzen', cancel: 'Zusammenführen' });
  const prog = progressOverlay('Sicherung wird eingespielt');
  try {
    const entries = await readZip(files[0]);
    const dataBlob = entries.get('data.json');
    if (!dataBlob) throw new Error('data.json fehlt – ist das eine Atelier-Sicherung?');
    const data = JSON.parse(await dataBlob.text());
    if (data.app !== 'atelier') throw new Error('Unbekanntes Format');
    if (replace) for (const st of STORES) await db.clear(st);
    let i = 0;
    for (const m of data.images || []) {
      prog.set((i++ / Math.max(1, data.images.length)) * 0.8, 'Bilder');
      const blob = entries.get(`images/${m.id}.jpg`), thumb = entries.get(`thumbs/${m.id}.jpg`);
      if (!blob || !thumb) continue;
      await db.put('images', { ...m, blob: new Blob([blob], { type: 'image/jpeg' }), thumb: new Blob([thumb], { type: 'image/jpeg' }) });
    }
    for (const p of data.posts || []) await db.put('posts', p);
    for (const s of data.stories || []) await db.put('stories', s);
    for (const p of data.prints || []) {
      const file = entries.get(`prints/${p.id}.bin`);
      if (!file) continue;
      const rec = { ...p, file: new Blob([file], { type: p.fileType || 'image/jpeg' }) };
      const mask = entries.get(`prints/${p.id}_mask.png`); if (mask) rec.mask = new Blob([mask], { type: 'image/png' });
      const th = entries.get(`prints/${p.id}_thumb.jpg`); if (th) rec.thumb = new Blob([th], { type: 'image/jpeg' });
      delete rec.hasMask;
      await db.put('prints', rec);
    }
    if (data.settings) await db.put('kv', { key: 'settings', value: data.settings });
    prog.close();
    toast('Sicherung eingespielt – App wird neu geladen');
    setTimeout(() => location.reload(), 900);
  } catch (e) {
    prog.close();
    toast('Einspielen fehlgeschlagen: ' + e.message, { bad: true, timeout: 5000 });
  }
}
