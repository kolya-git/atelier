// Start der App: Speicher laden, Navigation, Ansichten.
import { h, icon, toast } from './core/ui.js';
import { db, requestPersistence } from './core/db.js';
import { store } from './core/store.js';
import { ensureFonts } from './core/fonts.js';
import { gridView } from './planner/grid.js';
import { calendarView } from './planner/calendar.js';
import { libraryView } from './planner/library.js';
import { storiesView } from './stories/stories.js';
import { settingsView, applyTheme } from './settings.js';
import { IN_CLAUDE } from './core/platform.js';

if (IN_CLAUDE) document.documentElement.classList.add('in-claude');

const SECTIONS = [
  { id: 'raster', label: 'Raster', icon: 'grid', view: (ctx) => gridView(ctx) },
  { id: 'kalender', label: 'Kalender', icon: 'calendar', view: (ctx) => calendarView(ctx) },
  { id: 'bilder', label: 'Bilder', icon: 'image', view: (ctx) => libraryView(ctx) },
  { id: 'stories', label: 'Stories', icon: 'story', view: (ctx) => storiesView(ctx) },
  { id: 'druck', label: 'Druck', icon: 'print', view: async (ctx) => (await import('./print/print.js')).printView(ctx) },
  { id: 'einstellungen', label: 'Einstellungen', icon: 'sliders', view: (ctx) => settingsView(ctx) },
];

let current = null;
let currentId = null;
const main = document.getElementById('main');
const nav = document.getElementById('nav');

const ctx = {
  go: (id) => { location.hash = '#' + id; },
  openInPrint: async (imageId) => {
    ctx.pendingPrintImage = imageId;
    if (currentId === 'druck' && current && current.openImageId) { current.openImageId(imageId); ctx.pendingPrintImage = null; }
    else ctx.go('druck');
  },
  pendingPrintImage: null,
};

function buildNav() {
  nav.replaceChildren(h('div.nav-brand', 'Atelier'));
  for (const s of SECTIONS) {
    if (s.id === 'einstellungen') nav.append(h('div.nav-sep'));
    nav.append(h('button', { type: 'button', dataset: { id: s.id }, onclick: () => ctx.go(s.id) }, icon(s.icon), s.label));
  }
}

async function show(id) {
  const sec = SECTIONS.find((s) => s.id === id) || SECTIONS[0];
  if (currentId === sec.id && current) return;
  for (const b of nav.querySelectorAll('button')) b.setAttribute('aria-current', b.dataset.id === sec.id ? 'page' : 'false');
  if (current && current.destroy) { try { current.destroy(); } catch (e) { console.error(e); } }
  currentId = sec.id;
  try {
    current = await sec.view(ctx);
    if (currentId !== sec.id) return;
    main.replaceChildren(current.el);
  } catch (e) {
    console.error(e);
    main.replaceChildren(h('div.empty', h('h3', 'Hier ist etwas schiefgelaufen'), h('p', String(e.message || e))));
  }
}

async function boot() {
  try {
    await db.open();
    await store.load();
  } catch (e) {
    main.replaceChildren(h('div.empty', h('h3', 'Speicher nicht verfügbar'), h('p', 'Atelier braucht den lokalen Browser-Speicher (IndexedDB). Im privaten Modus ist er manchmal gesperrt. ' + (e.message || ''))));
    return;
  }
  applyTheme(store.settings.theme);
  ensureFonts();
  buildNav();
  window.addEventListener('hashchange', () => show(location.hash.slice(1)));
  await show(location.hash.slice(1) || 'raster');
  // dauerhaften Speicher beim ersten Antippen anfragen (Safari erwartet eine Nutzergeste)
  window.addEventListener('pointerdown', () => { requestPersistence(); }, { once: true });
  if (!IN_CLAUDE && 'serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline-Modus optional */ });
  }
}

window.addEventListener('unhandledrejection', (e) => {
  const msg = e.reason && e.reason.message ? e.reason.message : String(e.reason);
  if (/AbortError|abgebrochen/i.test(msg)) return;
  console.error(e.reason);
  toast('Fehler: ' + msg, { bad: true, timeout: 4500 });
});

boot();
