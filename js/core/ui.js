// UI-Bausteine: DOM-Helfer, Symbole, Dialoge, Bedienelemente.

/** Hyperscript: h('div.klasse', {onclick, attrs…}, kinder…) */
export function h(tag, props, ...children) {
  let [name, ...classes] = tag.split('.');
  let id = null;
  if (name.includes('#')) [name, id] = name.split('#');
  const el = name === 'svg' || name === 'path' ? document.createElementNS('http://www.w3.org/2000/svg', name) : document.createElement(name || 'div');
  if (id) el.id = id;
  if (classes.length) el.className = classes.join(' ');
  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) {
    children.unshift(props);
    props = null;
  }
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className += (el.className ? ' ' : '') + v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') el.innerHTML = v;
      else if (k in el && k !== 'list' && k !== 'form' && typeof v !== 'string') el[k] = v;
      else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(el) { while (el.firstChild) el.firstChild.remove(); return el; }

// ---------- Symbole (eigene, schlichte Linien-Icons) ----------
const ICONS = {
  grid: 'M4 4h4.5v4.5H4zM9.75 4h4.5v4.5h-4.5zM15.5 4H20v4.5h-4.5zM4 9.75h4.5v4.5H4zM9.75 9.75h4.5v4.5h-4.5zM15.5 9.75H20v4.5h-4.5zM4 15.5h4.5V20H4zM9.75 15.5h4.5V20h-4.5zM15.5 15.5H20V20h-4.5z',
  calendar: 'M4.5 6.5h15v13h-15zM4.5 10h15M8.5 4v4M15.5 4v4',
  image: 'M4 5h16v14H4zM4 16l4.5-4.5 3.5 3.5 2.5-2.5L20 17.5M15.5 9.2a1.2 1.2 0 1 0 0-.01',
  story: 'M7.5 3.5h9a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2zM9 7h6M9 17h3.5',
  print: 'M3.5 4.5h17v15h-17zM7 8h10v8H7z',
  sliders: 'M5 6h9M17.5 6H19M5 12h3M11.5 12H19M5 18h10M18.5 18H19M14 4.5v3M8 10.5v3M15 16.5v3',
  plus: 'M12 5v14M5 12h14',
  share: 'M12 3.5v11M8 7l4-3.5L16 7M7 10.5H5.5v9h13v-9H17',
  download: 'M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14',
  trash: 'M5 7h14M10 7V5h4v2M7 7l1 12.5h8L17 7M10.5 10.5v6M13.5 10.5v6',
  copy: 'M8.5 8.5h11v11h-11zM15.5 8.5V4.5h-11v11h4',
  close: 'M6 6l12 12M18 6 6 18',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  left: 'M14.5 6 8.5 12l6 6',
  right: 'M9.5 6l6 6-6 6',
  more: 'M4.6 12a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0-2.8 0M10.6 12a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0-2.8 0M16.6 12a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0-2.8 0',
  carousel: 'M8 8h11v11H8zM5 15.5V5h10.5',
  eye: 'M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12zM12 9.3a2.7 2.7 0 1 0 0 5.4 2.7 2.7 0 0 0 0-5.4z',
  dice: 'M5 5h14v14H5zM9 9h.01M15 9h.01M12 12h.01M9 15h.01M15 15h.01',
  loupe: 'M10.5 4.5a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM15 15l5 5',
  brush: 'M14.5 4.5l5 5-7.5 7.5-5-5zM7 12l-2.2 2.2c-1 1-.8 2.8-2.3 4.3 2 .3 4.7-.3 5.8-1.5L10.5 15',
  undo: 'M8.5 8H15a4.5 4.5 0 0 1 0 9H9M8.5 8l3-3M8.5 8l3 3',
  folder: 'M3.5 6.5h6l2 2h9v10h-17z',
  photoAdd: 'M4 5h11M4 5v14h16v-7M4 16l4.5-4.5 3.5 3.5 2.5-2.5 5.5 5M18 3v6M15 6h6',
  text: 'M5 6.5V5h14v1.5M12 5v14M9.5 19h5',
  compare: 'M12 3.5v17M5 6h4.5v12H5zM14.5 6H19v12h-4.5',
  info: 'M12 8h.01M11 11.5h1V17h1M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17z',
  crop: 'M7 3.5V17h13.5M3.5 7H17v13.5',
  swap: 'M7 7h11l-3-3M17 17H6l3 3',
  dup: 'M8 8h11v11H8zM5 16V5h11',
  clock: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 7.5V12l3 2',
  palette: 'M12 3.5c-4.7 0-8.5 3.6-8.5 8.2 0 4.4 3.6 8.8 8.1 8.8 1.4 0 1.9-.9 1.9-1.8 0-1.4-1.3-1.6-1.3-2.8 0-.9.7-1.4 1.6-1.4h2.4c2.4 0 4.3-1.7 4.3-4.1 0-3.9-3.8-6.9-8.5-6.9zM7.8 11h.01M10.3 7.6h.01M14.5 7.8h.01',
  layers: 'M12 4l8.5 4.5L12 13 3.5 8.5zM3.5 12.5 12 17l8.5-4.5M3.5 16.5 12 21l8.5-4.5',
  expand: 'M4.5 9.5v-5h5M19.5 9.5v-5h-5M4.5 14.5v5h5M19.5 14.5v5h-5',
  frame: 'M4 4h16v16H4zM7.5 7.5h9v9h-9z',
};

export function icon(name, size) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  if (size) { svg.setAttribute('width', size); svg.setAttribute('height', size); }
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', ICONS[name] || ICONS.info);
  svg.append(p);
  return svg;
}

export function btn(label, onClick, { cls = '', iconName, title, disabled } = {}) {
  return h('button.btn' + (cls ? '.' + cls.split(' ').join('.') : ''), { type: 'button', onclick: onClick, title: title || null, disabled: !!disabled, 'aria-label': !label && title ? title : null },
    iconName ? icon(iconName) : null, label || null);
}
export const iconBtn = (name, onClick, title, cls = 'ghost') => btn('', onClick, { cls: 'icon ' + cls, iconName: name, title });

// ---------- Toasts ----------
export function toast(msg, { bad = false, timeout = 2600 } = {}) {
  const host = document.getElementById('toasts');
  const t = h('div.toast' + (bad ? '.bad' : ''), msg);
  host.append(t);
  setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 320); }, timeout);
}

// ---------- Sheets ----------
const sheetStack = [];
/**
 * Öffnet einen Vollbild-Dialog. Gibt {el, body, close, setTitle} zurück.
 * left/right: Arrays von Elementen für die Kopfzeile.
 */
export function openSheet({ title = '', body, left, right, narrow = false, pad = true, onClose, closeLabel = 'Fertig' } = {}) {
  const titleEl = h('h2', title);
  const bodyEl = h('div.sheet-body' + (pad ? '.pad' : ''));
  if (body) append(bodyEl, [body]);
  let closed = false;
  const close = async (reason) => {
    if (closed) return;
    if (onClose) {
      const r = await onClose(reason);
      if (r === false) return;
    }
    closed = true;
    backdrop.remove();
    const i = sheetStack.indexOf(api);
    if (i >= 0) sheetStack.splice(i, 1);
  };
  const leftSide = h('div.side', left || []);
  const rightSide = h('div.side.end', right || [btn(closeLabel, () => close('done'), { cls: 'primary small' })]);
  const sheet = h('div.sheet' + (narrow ? '.narrow' : ''), { role: 'dialog', 'aria-modal': 'true' },
    h('div.sheet-head', leftSide, titleEl, rightSide), bodyEl);
  const backdrop = h('div.sheet-backdrop', sheet);
  if (narrow) backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close('backdrop'); });
  document.body.append(backdrop);
  const api = { el: sheet, body: bodyEl, close, setTitle: (t) => { titleEl.textContent = t; }, left: leftSide, right: rightSide };
  sheetStack.push(api);
  return api;
}

export function confirmDialog(message, { title = 'Sicher?', ok = 'OK', cancel = 'Abbrechen', danger = false } = {}) {
  return new Promise((resolve) => {
    const backdrop = h('div.sheet-backdrop');
    const done = (v) => { backdrop.remove(); resolve(v); };
    const sheet = h('div.sheet.narrow', { role: 'alertdialog' },
      h('div.dialog-text', h('h3', title), h('div.muted', message)),
      h('div.dialog-actions',
        cancel ? btn(cancel, () => done(false)) : null,
        btn(ok, () => done(true), { cls: danger ? 'primary danger' : 'primary' })));
    if (danger) sheet.querySelector('.btn.primary').style.background = 'var(--danger)';
    backdrop.append(sheet);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) done(false); });
    document.body.append(backdrop);
  });
}

export function promptDialog(message, { title = '', value = '', ok = 'OK', placeholder = '' } = {}) {
  return new Promise((resolve) => {
    const backdrop = h('div.sheet-backdrop');
    const input = h('input.input', { value, placeholder });
    const done = (v) => { backdrop.remove(); resolve(v); };
    const sheet = h('div.sheet.narrow', { role: 'dialog' },
      h('div.dialog-text', title ? h('h3', title) : null, message ? h('div.muted', { style: { marginBottom: '10px' } }, message) : null, input),
      h('div.dialog-actions', btn('Abbrechen', () => done(null)), btn(ok, () => done(input.value), { cls: 'primary' })));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(input.value); });
    backdrop.append(sheet);
    document.body.append(backdrop);
    setTimeout(() => input.focus(), 50);
  });
}

/** Popover-Menü an einem Element. items: [{label, icon, onClick, danger}] oder 'sep'. */
export function popMenu(anchor, items) {
  const pop = h('div.menu-pop', { role: 'menu' });
  for (const it of items) {
    if (it === 'sep') { pop.append(h('hr')); continue; }
    if (!it) continue;
    pop.append(h('button' + (it.danger ? '.danger' : ''), { type: 'button', role: 'menuitem', onclick: () => { close(); it.onClick(); } },
      it.icon ? icon(it.icon) : null, it.label));
  }
  const shield = h('div', { style: { position: 'fixed', inset: '0', zIndex: '69' } });
  const close = () => { pop.remove(); shield.remove(); };
  shield.addEventListener('pointerdown', (e) => { e.preventDefault(); close(); });
  document.body.append(shield, pop);
  const r = anchor.getBoundingClientRect();
  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  let x = Math.min(r.right - pw, window.innerWidth - pw - 8);
  x = Math.max(8, x);
  let y = r.bottom + 6;
  if (y + ph > window.innerHeight - 8) y = Math.max(8, r.top - ph - 6);
  pop.style.left = x + 'px';
  pop.style.top = y + 'px';
  return close;
}

// ---------- Bedienelemente ----------
export function segmented(options, value, onChange, { block = false } = {}) {
  const el = h('div.seg' + (block ? '.block' : ''), { role: 'group' });
  const set = (v) => {
    value = v;
    for (const b of el.children) b.setAttribute('aria-pressed', String(b.dataset.v === String(v)));
  };
  for (const o of options) {
    const opt = typeof o === 'object' ? o : { value: o, label: o };
    el.append(h('button', { type: 'button', dataset: { v: String(opt.value) }, title: opt.title || null, onclick: () => { set(opt.value); onChange(opt.value); } }, opt.label));
  }
  set(value);
  el.setValue = set;
  return el;
}

export function slider({ label, min = 0, max = 1, step = 0.01, value = 0, format, onInput, onChange }) {
  const out = h('output');
  const fmt = format || ((v) => String(Math.round(v * 100) / 100).replace('.', ','));
  const input = h('input', { type: 'range', min, max, step, value });
  const id = 'sl-' + Math.random().toString(36).slice(2, 8);
  input.id = id;
  const update = () => { out.textContent = fmt(Number(input.value)); };
  input.addEventListener('input', () => { update(); onInput && onInput(Number(input.value)); });
  input.addEventListener('change', () => { onChange && onChange(Number(input.value)); });
  // Doppeltippen auf das Label setzt auf den Startwert zurück
  const initial = value;
  const lab = h('label', { for: id, ondblclick: () => { input.value = initial; update(); onInput && onInput(Number(initial)); onChange && onChange(Number(initial)); } }, label);
  update();
  const el = h('div.slider', lab, out, input);
  el.setValue = (v) => { input.value = v; update(); };
  el.input = input;
  return el;
}

export function toggle(label, checked, onChange) {
  const input = h('input', { type: 'checkbox', checked: !!checked, onchange: () => onChange(input.checked) });
  const el = h('label.toggle', input, h('span', label));
  el.input = input;
  return el;
}

export function field(label, control, hint) {
  return h('div.field', h('div.label', label), control, hint ? h('div.hint', hint) : null);
}

export function selectEl(options, value, onChange) {
  const sel = h('select.select', { onchange: () => onChange(sel.value) });
  for (const o of options) {
    if (o.group) {
      const g = h('optgroup', { label: o.group });
      for (const c of o.options) g.append(h('option', { value: c.value }, c.label));
      sel.append(g);
    } else sel.append(h('option', { value: o.value }, o.label));
  }
  sel.value = value;
  return sel;
}

/** Fortschrittsanzeige mit Abbrechen. */
export function progressOverlay(title, { onCancel } = {}) {
  const bar = h('div');
  const text = h('div.small.muted', ' ');
  const card = h('div.progress-card', h('h3', title), text, h('div.progress-bar', bar),
    onCancel ? h('div.row', h('div.spacer'), btn('Abbrechen', () => onCancel(), { cls: 'small' })) : null);
  const ov = h('div.progress-overlay', card);
  document.body.append(ov);
  return {
    set(frac, msg) { if (Number.isFinite(frac)) bar.style.width = Math.round(Math.max(0, Math.min(1, frac)) * 100) + '%'; if (msg != null) text.textContent = msg; },
    title(t) { card.querySelector('h3').textContent = t; },
    close() { ov.remove(); },
  };
}

/** Datei-Auswahl öffnen (Fotos-Mediathek auf dem iPad). */
export function pickFiles({ accept = 'image/*', multiple = true } = {}) {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept, multiple, style: { position: 'fixed', left: '-1000px' } });
    let done = false;
    input.addEventListener('change', () => { done = true; resolve([...input.files]); input.remove(); });
    // Safari meldet „abgebrochen“ nicht zuverlässig – focus-Rückkehr als Hinweis
    window.addEventListener('focus', () => setTimeout(() => { if (!done) { resolve([]); input.remove(); } }, 1200), { once: true });
    document.body.append(input);
    input.click();
  });
}

/** Lange drücken erkennen (für Kontextmenüs auf Touch). */
export function onLongPress(el, fn, ms = 480) {
  let timer = 0, sx = 0, sy = 0;
  el.addEventListener('pointerdown', (e) => {
    sx = e.clientX; sy = e.clientY;
    clearTimeout(timer);
    timer = setTimeout(() => fn(e), ms);
  });
  const cancel = () => clearTimeout(timer);
  el.addEventListener('pointermove', (e) => { if (Math.hypot(e.clientX - sx, e.clientY - sy) > 8) cancel(); });
  el.addEventListener('pointerup', cancel);
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('contextmenu', (e) => { e.preventDefault(); cancel(); fn(e); });
}
