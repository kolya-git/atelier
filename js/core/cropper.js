// Bildausschnitt wählen: verschieben (ein Finger), zoomen (zwei Finger / Mausrad), Doppeltippen = zurücksetzen.
import { h } from './ui.js';
import { clamp } from './util.js';

export function createCropper({ aspect = 0.75, crop = {}, onChange } = {}) {
  const el = h('div.crop-frame');
  const grid = h('div.grid-lines');
  el.append(grid);
  let A = aspect;
  let c = { cx: 0.5, cy: 0.5, zoom: 1, ...crop };
  let img = null, iw = 1, ih = 1, fw = 100, fh = 100;
  let maxW = 100, maxH = 100;

  const scale = () => Math.max(fw / iw, fh / ih) * c.zoom;
  function apply() {
    el.style.width = fw + 'px';
    el.style.height = fh + 'px';
    if (!img) return;
    const s = scale();
    const cw = fw / (iw * s), ch = fh / (ih * s);
    c.cx = clamp(c.cx, cw / 2, 1 - cw / 2);
    c.cy = clamp(c.cy, ch / 2, 1 - ch / 2);
    const tx = fw / 2 - c.cx * iw * s, ty = fh / 2 - c.cy * ih * s;
    img.style.width = iw + 'px';
    img.style.height = ih + 'px';
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
  }
  function fit(w, hgt) {
    maxW = w; maxH = hgt;
    if (w / hgt > A) { fh = Math.floor(hgt); fw = Math.floor(hgt * A); } else { fw = Math.floor(w); fh = Math.floor(w / A); }
    apply();
  }

  const pts = new Map();
  let start = null, lastTap = 0;
  const snap = () => {
    const p = [...pts.values()];
    return {
      c: { ...c }, p: p.map((q) => ({ ...q })),
      dist: p.length > 1 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0,
      mid: p.length > 1 ? { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 } : p[0],
    };
  };
  el.addEventListener('pointerdown', (e) => {
    if (!img) return;
    el.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    start = snap();
    el.classList.add('active');
    const now = performance.now();
    if (pts.size === 1 && now - lastTap < 320) { c = { cx: 0.5, cy: 0.5, zoom: 1 }; apply(); onChange && onChange({ ...c }, true); }
    lastTap = now;
  });
  el.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId) || !start) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = [...pts.values()];
    if (p.length === 1 && start.p.length === 1) {
      const s = scale();
      c.cx = start.c.cx - (p[0].x - start.p[0].x) / (iw * s);
      c.cy = start.c.cy - (p[0].y - start.p[0].y) / (ih * s);
    } else if (p.length >= 2 && start.dist > 0) {
      const dist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      const mid = { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 };
      c.zoom = clamp(start.c.zoom * (dist / start.dist), 1, 6);
      const s = scale();
      c.cx = start.c.cx - (mid.x - start.mid.x) / (iw * s);
      c.cy = start.c.cy - (mid.y - start.mid.y) / (ih * s);
    }
    apply();
    onChange && onChange({ ...c }, false);
  });
  const end = (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    start = pts.size ? snap() : null;
    if (!pts.size) { el.classList.remove('active'); onChange && onChange({ ...c }, true); }
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('wheel', (e) => {
    if (!img) return;
    e.preventDefault();
    c.zoom = clamp(c.zoom * Math.exp(-e.deltaY * 0.0015), 1, 6);
    apply();
    onChange && onChange({ ...c }, true);
  }, { passive: false });

  return {
    el,
    fit,
    setImage(node, w, hgt) {
      if (img && img !== node) { img.remove(); if (img.tagName === 'CANVAS') { img.width = 0; img.height = 0; } }
      img = node; iw = w || node.width; ih = hgt || node.height;
      if (!node.parentNode) el.insertBefore(node, grid);
      apply();
    },
    setAspect(a) { A = a; fit(maxW, maxH); },
    setCrop(cr) { c = { cx: 0.5, cy: 0.5, zoom: 1, ...cr }; apply(); },
    getCrop: () => ({ ...c }),
  };
}
