// Raster: so wird das Profil aussehen, wenn alle geplanten Beiträge veröffentlicht sind.
import { h, icon, btn, iconBtn, toast } from '../core/ui.js';
import { store } from '../core/store.js';
import { tileUrl } from './render.js';
import { sortable } from '../core/sortable.js';
import { fmtDate } from '../core/util.js';
import { openPostEditor } from './post-editor.js';
import { openFeedLookSheet } from './feedlook.js';
import { STATUS } from './status.js';

export function gridView({ go }) {
  const root = h('div.view');
  const sub = h('span.sub');
  const head = h('div.view-head',
    h('h1', 'Raster'), sub, h('div.spacer'),
    btn('Feed-Look', () => openFeedLookSheet(), { iconName: 'palette', cls: 'ghost' }),
    btn('Beitrag', () => newPost(), { iconName: 'plus', cls: 'primary' }));
  const body = h('div.view-body');
  root.append(head, body);

  async function newPost(patch = {}) {
    const p = store.newPost({ date: store.nextFreeSlot('post'), ...patch });
    await store.savePost(p);
    openPostEditor(p.id);
  }

  function tile(p, { past = false } = {}) {
    const s = store.settings;
    const t = h('div.tile' + (past ? '.past' : ''), { dataset: { id: p.id } });
    if (!p.slides.length) {
      t.classList.add('placeholder');
      t.append(h('div', h('div', icon('image', 22)), p.caption ? p.caption.slice(0, 40) : 'Bilder wählen'));
    } else {
      const img = h('img', { alt: '' });
      t.append(img);
      tileUrl(p).then((u) => { if (u) img.src = u; });
      if (p.slides.length > 1) t.append(h('div.multi', icon('carousel', 16)));
    }
    if (s.gridInfo) {
      t.append(h('div.tile-info',
        h('span.badge', h('span.dot.st-' + p.status), p.date ? fmtDate(p.date, { weekday: false }) : 'Idee')));
    }
    return t;
  }

  function render() {
    const s = store.settings;
    const posts = store.sortedPosts();
    const dated = posts.filter((p) => p.date && (s.gridShowPublished || p.status !== 'veroeffentlicht'));
    const ideas = posts.filter((p) => !p.date);
    const planned = posts.filter((p) => p.date && p.status !== 'veroeffentlicht').length;
    const published = posts.filter((p) => p.status === 'veroeffentlicht').length;
    sub.textContent = `${planned} geplant · ${ideas.length} Ideen · ${published} veröffentlicht`;
    body.replaceChildren();
    const wrap = h('div.feed-wrap');
    body.append(wrap);
    const acc = s.account;
    const av = h('div.avatar', acc.avatarImageId && store.images.get(acc.avatarImageId) ? h('img', { src: store.thumbUrl(acc.avatarImageId), alt: '' }) : (acc.name || 'A').slice(0, 1));
    wrap.append(h('div.profile-head', av, h('div', h('div.name', acc.name), h('div.handle', '@' + acc.handle))));

    if (!posts.length) {
      wrap.append(h('div.empty',
        h('h3', 'Noch keine Beiträge'),
        h('p', 'Importiere zuerst Bilder und lege daraus Beiträge an. Das Raster zeigt dir dann, wie dein Profil wirken wird – mit einheitlichem Look.'),
        h('div.row', { style: { justifyContent: 'center', marginTop: '12px' } },
          btn('Bilder importieren', () => go('bilder'), { iconName: 'photoAdd' }),
          btn('Leeren Beitrag', () => newPost(), { iconName: 'plus' }))));
      return;
    }

    if (ideas.length) {
      wrap.append(h('div.section-title', 'Ideen ohne Termin – lange drücken und auf eine Kachel ziehen zum Tauschen'));
      const tray = h('div.ideas-tray');
      for (const p of ideas) tray.append(tile(p));
      wrap.append(tray);
      sortable(tray, {
        items: '.tile', targets: '.feed-grid .tile',
        onTap: (el) => openPostEditor(el.dataset.id),
        onDrop: async (from, to) => {
          if (!to || !to.closest('.feed-grid')) return;
          const a = store.posts.get(from.dataset.id), b = store.posts.get(to.dataset.id);
          if (!a || !b) return;
          if (b.status === 'veroeffentlicht') { toast('Veröffentlichte Beiträge bleiben an ihrem Platz.'); return; }
          [a.date, b.date] = [b.date, null];
          [a.time, b.time] = [b.time, a.time];
          if (a.status === 'idee') a.status = 'entwurf';
          await store.savePost(a, { silent: true });
          await store.savePost(b);
          toast('Getauscht: Idee hat jetzt den Termin.');
        },
      });
    }

    const grid = h('div.feed-grid' + (s.gridSquare ? '.square' : ''));
    for (const p of dated) grid.append(tile(p, { past: p.status === 'veroeffentlicht' }));
    wrap.append(grid);
    wrap.append(h('div.feed-legend', ...Object.entries(STATUS).map(([k, v]) => h('span', h('span.dot.st-' + k), v.label))));
    wrap.append(h('p.small.muted', { style: { marginTop: '10px' } },
      'Tippen öffnet einen Beitrag. Lange drücken und ziehen ordnet um – die Termine bleiben an ihrem Platz, die Beiträge wandern.'));

    sortable(grid, {
      items: '.tile',
      onTap: (el) => openPostEditor(el.dataset.id),
      onDrop: async (from, to) => {
        if (!to) return;
        const movable = dated.filter((p) => p.status !== 'veroeffentlicht');
        const a = movable.findIndex((p) => p.id === from.dataset.id);
        const b = movable.findIndex((p) => p.id === to.dataset.id);
        if (a < 0 || b < 0) { toast('Veröffentlichte Beiträge bleiben an ihrem Platz.'); return; }
        const slots = movable.map((p) => ({ date: p.date, time: p.time }));
        const list = movable.slice();
        const [m] = list.splice(a, 1);
        list.splice(b, 0, m);
        for (let i = 0; i < list.length; i++) {
          const p = list[i];
          if (p.date !== slots[i].date || p.time !== slots[i].time) {
            p.date = slots[i].date; p.time = slots[i].time;
            await store.savePost(p, { silent: true });
          }
        }
        store.emit('posts');
      },
    });
  }

  const off = store.on((t) => { if (t === 'posts' || t === 'images' || t === 'settings') render(); });
  render();
  return { el: root, destroy: off, actions: { newPost } };
}

export { iconBtn };
