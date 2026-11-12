// Umsortieren per Langdruck + Ziehen (Touch, Stift, Maus). HTML5-Drag&Drop funktioniert auf dem iPad nicht zuverlässig.

/**
 * container: Element mit den Einträgen
 * opts.items: CSS-Selektor der Einträge
 * opts.onDrop(fromEl, toEl, event): Ziel-Element unter dem Finger (oder null)
 * opts.targets: optionaler Selektor für zusätzliche Ablageziele (z. B. Kalendertage)
 * opts.delay: Langdruck-Dauer (ms)
 */
let suppressClickUntil = 0;

export function sortable(container, { items, targets, onDrop, onTap, delay = 380 }) {
  let state = null;

  const cleanup = () => {
    if (!state) return;
    clearTimeout(state.timer);
    if (state.ghost) state.ghost.remove();
    if (state.el) state.el.classList.remove('dragging');
    if (state.over) state.over.classList.remove('drop-target');
    cancelAnimationFrame(state.raf);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    state = null;
  };

  const activate = () => {
    const { el, x, y } = state;
    state.active = true;
    const r = el.getBoundingClientRect();
    const ghost = el.cloneNode(true);
    ghost.classList.add('drag-ghost');
    ghost.classList.remove('dragging');
    Object.assign(ghost.style, { width: r.width + 'px', height: r.height + 'px', left: r.left + 'px', top: r.top + 'px', margin: '0' });
    state.dx = x - r.left; state.dy = y - r.top;
    document.body.append(ghost);
    state.ghost = ghost;
    el.classList.add('dragging');
    if (navigator.vibrate) try { navigator.vibrate(8); } catch { /* egal */ }
  };

  const findTarget = (x, y) => {
    const under = document.elementFromPoint(x, y);
    if (!under) return null;
    const sel = targets ? `${items}, ${targets}` : items;
    const t = under.closest(sel);
    if (t && (container.contains(t) || targets)) return t === state.el ? null : t;
    return null;
  };

  const autoScroll = () => {
    if (!state || !state.active) return;
    const sc = state.scroller;
    if (sc) {
      const r = sc.getBoundingClientRect();
      const edge = 60;
      if (state.y < r.top + edge) sc.scrollTop -= Math.ceil((r.top + edge - state.y) / 6);
      else if (state.y > r.bottom - edge) sc.scrollTop += Math.ceil((state.y - (r.bottom - edge)) / 6);
      if (state.x < r.left + edge) sc.scrollLeft -= Math.ceil((r.left + edge - state.x) / 6);
      else if (state.x > r.right - edge) sc.scrollLeft += Math.ceil((state.x - (r.right - edge)) / 6);
    }
    state.raf = requestAnimationFrame(autoScroll);
  };

  function onMove(e) {
    if (!state || e.pointerId !== state.id) return;
    state.x = e.clientX; state.y = e.clientY;
    if (!state.active) {
      if (Math.hypot(e.clientX - state.sx, e.clientY - state.sy) > 9) cleanup();
      return;
    }
    e.preventDefault();
    state.ghost.style.left = e.clientX - state.dx + 'px';
    state.ghost.style.top = e.clientY - state.dy + 'px';
    const t = findTarget(e.clientX, e.clientY);
    if (t !== state.over) {
      if (state.over) state.over.classList.remove('drop-target');
      state.over = t;
      if (t) t.classList.add('drop-target');
    }
  }
  function onUp(e) {
    if (!state || e.pointerId !== state.id) return;
    const s = state;
    if (s.active) {
      const t = findTarget(e.clientX, e.clientY);
      const from = s.el;
      cleanup();
      suppressClickUntil = performance.now() + 450;
      onDrop && onDrop(from, t, e);
    } else {
      cleanup();
    }
  }
  function onCancel() { cleanup(); }

  container.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    const el = e.target.closest(items);
    if (!el || !container.contains(el)) return;
    cleanup();
    const scroller = findScroller(container);
    state = { el, id: e.pointerId, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, active: false, scroller };
    state.timer = setTimeout(() => { if (state && !state.active) { activate(); autoScroll(); } }, e.pointerType === 'mouse' ? 160 : delay);
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  });
  // Scrollen verhindern, sobald gezogen wird (iOS)
  container.addEventListener('touchmove', (e) => { if (state && state.active) e.preventDefault(); }, { passive: false });
  container.addEventListener('contextmenu', (e) => { if (e.target.closest(items)) e.preventDefault(); });
  if (onTap) {
    container.addEventListener('click', (e) => {
      if (performance.now() < suppressClickUntil) return;
      const el = e.target.closest(items);
      if (!el || !container.contains(el)) return;
      onTap(el, e);
    });
  }
  return { destroy: cleanup };
}

function findScroller(el) {
  let n = el;
  while (n && n !== document.body) {
    const st = getComputedStyle(n);
    if (/(auto|scroll)/.test(st.overflowY + st.overflowX) && (n.scrollHeight > n.clientHeight || n.scrollWidth > n.clientWidth)) return n;
    n = n.parentElement;
  }
  return null;
}
