// Kalender: Monatsübersicht und Liste. Beiträge und Stories per Langdruck auf andere Tage ziehen.
import { h, btn, iconBtn, openSheet, segmented, toast } from '../core/ui.js';
import { store } from '../core/store.js';
import { sortable } from '../core/sortable.js';
import { MONTHS, WEEKDAYS_SHORT, isoFromDate, todayISO, weekday, fmtDateLong, fmtDate, relDay, downloadBlob, sortKey } from '../core/util.js';
import { tileUrl } from './render.js';
import { openPostEditor } from './post-editor.js';
import { openStoryEditor } from '../stories/story-editor.js';
import { storyCoverUrl } from '../stories/story-render.js';
import { makeICS, upcomingItems } from './ics.js';
import { STATUS } from './status.js';
import { IN_CLAUDE } from '../core/platform.js';

let viewMonth = null;
let mode = 'monat';

export function calendarView() {
  const root = h('div.view');
  const head = h('div.view-head', h('h1', 'Kalender'), h('div.spacer'),
    segmented([{ value: 'monat', label: 'Monat' }, { value: 'liste', label: 'Liste' }], mode, (v) => { mode = v; render(); }),
    IN_CLAUDE ? null : btn('Termine exportieren', () => {
      const items = upcomingItems();
      if (!items.length) { toast('Keine kommenden Termine.'); return; }
      downloadBlob(makeICS(items), 'instagram-plan.ics');
      toast(`${items.length} Termine als Kalenderdatei – mit Erinnerung 10 Minuten vorher.`, { timeout: 4000 });
    }, { iconName: 'calendar', cls: 'ghost' }));
  const body = h('div.view-body');
  root.append(head, body);
  if (!viewMonth) { const d = new Date(); viewMonth = new Date(d.getFullYear(), d.getMonth(), 1); }

  const itemsByDay = () => {
    const map = new Map();
    for (const p of [...store.posts.values(), ...store.stories.values()]) {
      if (!p.date) continue;
      if (!map.has(p.date)) map.set(p.date, []);
      map.get(p.date).push(p);
    }
    for (const l of map.values()) l.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    return map;
  };

  function itemEl(p) {
    const isStory = p.kind === 'story';
    const el = h('div.cal-item' + (isStory ? '.story' : ''), { dataset: { id: p.id, kind: p.kind }, title: isStory ? (p.title || 'Story') : (p.caption || 'Beitrag').slice(0, 60) });
    const img = h('img', { alt: '' });
    el.append(img, h('span.dot.st-' + p.status));
    (isStory ? storyCoverUrl(p, 90) : tileUrl(p, { w: 120 })).then((u) => { if (u) img.src = u; });
    return el;
  }

  function openItem(id, kind) { if (kind === 'story') openStoryEditor(id); else openPostEditor(id); }

  function renderMonth() {
    const map = itemsByDay();
    const y = viewMonth.getFullYear(), m = viewMonth.getMonth();
    const title = h('h2', `${MONTHS[m]} ${y}`);
    body.append(h('div.cal-head',
      iconBtn('left', () => { viewMonth = new Date(y, m - 1, 1); render(); }, 'Voriger Monat', ''),
      title,
      iconBtn('right', () => { viewMonth = new Date(y, m + 1, 1); render(); }, 'Nächster Monat', ''),
      btn('Heute', () => { const d = new Date(); viewMonth = new Date(d.getFullYear(), d.getMonth(), 1); render(); }, { cls: 'small ghost' })));
    const grid = h('div.cal-grid');
    for (const wd of WEEKDAYS_SHORT) grid.append(h('div.cal-dow', wd));
    const first = new Date(y, m, 1);
    const startOffset = (first.getDay() + 6) % 7;
    const start = new Date(y, m, 1 - startOffset);
    const today = todayISO();
    const rhythm = new Set(store.settings.rhythm.days);
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const cells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
    for (let i = 0; i < cells; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const iso = isoFromDate(d);
      const cell = h('div.cal-day' + (d.getMonth() !== m ? '.other' : '') + (iso === today ? '.today' : '') + (rhythm.has(weekday(iso)) ? '.posting-day' : ''),
        { dataset: { date: iso } }, h('div.cal-num', String(d.getDate())));
      const items = h('div.cal-items');
      for (const p of map.get(iso) || []) items.append(itemEl(p));
      cell.append(items);
      grid.append(cell);
    }
    body.append(grid);
    body.append(h('p.small.muted', { style: { marginTop: '10px' } }, 'Tag antippen: Beitrag oder Story anlegen. Lange drücken und ziehen: Termin verschieben. Unterstrichene Tage sind deine Posting-Tage.'));
    grid.addEventListener('click', (e) => {
      const it = e.target.closest('.cal-item');
      if (it) return;
      const day = e.target.closest('.cal-day');
      if (day) openDaySheet(day.dataset.date);
    });
    sortable(grid, {
      items: '.cal-item', targets: '.cal-day',
      onTap: (el) => openItem(el.dataset.id, el.dataset.kind),
      onDrop: async (from, to) => {
        const day = to && (to.classList.contains('cal-day') ? to : to.closest('.cal-day'));
        if (!day) return;
        const id = from.dataset.id, kind = from.dataset.kind;
        const rec = kind === 'story' ? store.stories.get(id) : store.posts.get(id);
        if (!rec || rec.date === day.dataset.date) return;
        rec.date = day.dataset.date;
        if (kind === 'story') await store.saveStory(rec); else await store.savePost(rec);
        toast(`Verschoben auf ${fmtDate(rec.date)}`);
      },
    });
  }

  function renderList() {
    const all = [...store.posts.values(), ...store.stories.values()].sort((a, b) => (sortKey(a) || '9').localeCompare(sortKey(b) || '9'));
    const t = todayISO();
    const upcoming = all.filter((p) => p.date && p.date >= t);
    const past = all.filter((p) => p.date && p.date < t).reverse().slice(0, 30);
    const ideas = all.filter((p) => !p.date);
    const wrap = h('div.agenda');
    const group = (label, list) => {
      if (!list.length) return;
      wrap.append(h('div.section-title', label));
      let lastDay = null, dayBox = null;
      for (const p of list) {
        if (p.date !== lastDay) {
          lastDay = p.date;
          dayBox = h('div.agenda-day', h('h4', p.date ? `${fmtDateLong(p.date)} ${relDay(p.date) ? '· ' + relDay(p.date) : ''}` : 'ohne Termin'));
          wrap.append(dayBox);
        }
        const isStory = p.kind === 'story';
        const img = h('img', { alt: '' });
        (isStory ? storyCoverUrl(p, 90) : tileUrl(p, { w: 120 })).then((u) => { if (u) img.src = u; });
        dayBox.append(h('div.agenda-item', { onclick: () => openItem(p.id, p.kind) },
          h('div.thumb' + (isStory ? '.story' : ''), img),
          h('div.txt',
            h('div.t1', isStory ? (p.title || `Story · ${p.frames.length} Seiten`) : (p.caption || '').split('\n')[0] || (p.slides.length ? `Beitrag · ${p.slides.length} Bild(er)` : 'Leerer Beitrag')),
            h('div.t2', `${isStory ? 'Story' : 'Beitrag'} · ${p.time || ''} · ${STATUS[p.status] ? STATUS[p.status].label : ''}`)),
          h('span.dot.st-' + p.status)));
      }
    };
    group('Kommend', upcoming);
    group('Ideen', ideas);
    group('Vergangen', past);
    if (!all.length) wrap.append(h('div.empty', h('h3', 'Noch nichts geplant'), h('p', 'Lege im Raster oder hier im Kalender Beiträge und Stories an.')));
    body.append(wrap);
  }

  function render() {
    body.replaceChildren();
    if (mode === 'liste') renderList(); else renderMonth();
  }

  async function openDaySheet(iso) {
    const items = (itemsByDay().get(iso) || []);
    const list = h('div');
    for (const p of items) {
      const isStory = p.kind === 'story';
      const img = h('img', { alt: '' });
      (isStory ? storyCoverUrl(p, 90) : tileUrl(p, { w: 120 })).then((u) => { if (u) img.src = u; });
      list.append(h('div.agenda-item', { onclick: () => { sh.close(); openItem(p.id, p.kind); } },
        h('div.thumb' + (isStory ? '.story' : ''), img),
        h('div.txt', h('div.t1', isStory ? (p.title || 'Story') : ((p.caption || '').split('\n')[0] || 'Beitrag')), h('div.t2', `${isStory ? 'Story' : 'Beitrag'} · ${p.time}`))));
    }
    if (!items.length) list.append(h('p.muted', 'Für diesen Tag ist noch nichts geplant.'));
    const sh = openSheet({
      title: fmtDateLong(iso), narrow: true,
      body: h('div', list, h('div.row', { style: { marginTop: '14px' } },
        btn('Beitrag anlegen', async () => { const p = store.newPost({ date: iso, status: 'entwurf' }); await store.savePost(p); sh.close(); openPostEditor(p.id); }, { iconName: 'plus', cls: 'primary' }),
        btn('Story anlegen', async () => { const s = store.newStory({ date: iso }); await store.saveStory(s); sh.close(); openStoryEditor(s.id); }, { iconName: 'story' }))),
    });
  }

  const off = store.on((t) => { if (['posts', 'stories', 'images', 'settings'].includes(t)) render(); });
  render();
  return { el: root, destroy: off };
}
