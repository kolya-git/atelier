// Übersicht aller Stories.
import { h, btn } from '../core/ui.js';
import { store } from '../core/store.js';
import { fmtDate, sortKey } from '../core/util.js';
import { openStoryEditor } from './story-editor.js';
import { openBrandEditor } from './brand-editor.js';
import { storyCoverUrl } from './story-render.js';
import { newFrame } from './templates.js';
import { STATUS } from '../planner/status.js';

export function storiesView() {
  const root = h('div.view');
  const sub = h('span.sub');
  const head = h('div.view-head', h('h1', 'Stories'), sub, h('div.spacer'),
    btn('Story-Stil', () => openBrandEditor(() => render()), { iconName: 'palette', cls: 'ghost' }),
    btn('Story', () => newStory(), { iconName: 'plus', cls: 'primary' }));
  const body = h('div.view-body');
  root.append(head, body);

  async function newStory() {
    const s = store.newStory({ date: store.nextFreeSlot('story'), frames: [newFrame('rahmen'), newFrame('text')] });
    await store.saveStory(s);
    openStoryEditor(s.id);
  }

  function render() {
    const list = [...store.stories.values()].sort((a, b) => (sortKey(b) || '').localeCompare(sortKey(a) || '') || b.created - a.created);
    sub.textContent = `${list.length} Stories`;
    body.replaceChildren();
    if (!list.length) {
      body.append(h('div.empty', h('h3', 'Stories im einheitlichen Stil'),
        h('p', 'Wähle Vorlagen, setze Fotos und kurze Texte ein – Schrift, Farben und Abstände kommen aus deinem Story-Stil. So sieht jede Story aus wie aus einem Guss.'),
        h('div.row', { style: { justifyContent: 'center', marginTop: '12px' } },
          btn('Erste Story anlegen', () => newStory(), { iconName: 'plus', cls: 'primary' }),
          btn('Story-Stil wählen', () => openBrandEditor(() => render()), { iconName: 'palette' }))));
      return;
    }
    const grid = h('div.story-list');
    for (const s of list) {
      const img = h('img', { alt: '' });
      storyCoverUrl(s, 220).then((u) => { if (u) img.src = u; });
      grid.append(h('div.story-card', { onclick: () => openStoryEditor(s.id) },
        h('div.frames', img, h('span.count', `${s.frames.length}`)),
        h('div.meta', h('div', s.title || 'Story'), h('div.d', `${s.date ? fmtDate(s.date) + ' · ' + s.time : 'ohne Termin'} · ${STATUS[s.status] ? STATUS[s.status].label : ''}`))));
    }
    body.append(grid);
  }

  const off = store.on((t) => { if (['stories', 'images', 'settings'].includes(t)) render(); });
  render();
  return { el: root, destroy: off };
}
