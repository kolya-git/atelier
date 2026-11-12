// Druckformate. Intern alles in Millimetern.

const IN = 25.4;
const inch = (id, w, h, note) => ({ id, label: `${fmtNum(w)} × ${fmtNum(h)} in`, w: w * IN, h: h * IN, unit: 'in', note });
const cm = (id, w, h, note) => ({ id, label: `${fmtNum(w)} × ${fmtNum(h)} cm`, w: w * 10, h: h * 10, unit: 'cm', note });
const iso = (id, w, h) => ({ id, label: `${id} (${w / 10} × ${h / 10} cm)`, w, h, unit: 'cm' });
function fmtNum(n) { return String(n).replace('.', ','); }

export const SIZE_GROUPS = [
  { group: '2:3', items: [inch('24x36', 24, 36, 'deckt 4×6 bis 20×30 in und 60×90 cm ab'), inch('20x30', 20, 30), inch('16x24', 16, 24), inch('12x18', 12, 18), cm('60x90', 60, 90), cm('40x60', 40, 60)] },
  { group: '3:4', items: [inch('18x24', 18, 24, 'deckt 6×8, 9×12, 12×16 in und 30×40 cm ab'), inch('12x16', 12, 16), cm('60x80', 60, 80), cm('30x40', 30, 40)] },
  { group: '4:5', items: [inch('16x20', 16, 20, 'deckt 8×10 in und 40×50 cm ab'), inch('8x10', 8, 10), cm('40x50', 40, 50)] },
  { group: '5:7', items: [cm('50x70', 50, 70, 'deckt 5×7 in ab'), inch('5x7', 5, 7)] },
  { group: '11:14', items: [inch('11x14', 11, 14)] },
  { group: 'DIN A (1:√2)', items: [iso('A0', 841, 1189), iso('A1', 594, 841), iso('A2', 420, 594), iso('A3', 297, 420), iso('A4', 210, 297)] },
  { group: '7:10', items: [cm('70x100', 70, 100), cm('35x50', 35, 50)] },
  { group: 'Quadrat', items: [cm('50x50', 50, 50), cm('30x30', 30, 30), inch('20x20', 20, 20), inch('12x12', 12, 12)] },
  { group: 'Panorama', items: [cm('50x100', 50, 100), cm('30x90', 30, 90)] },
];

export const ALL_SIZES = SIZE_GROUPS.flatMap((g) => g.items.map((s) => ({ ...s, group: g.group })));
export const sizeById = (id) => ALL_SIZES.find((s) => s.id === id) || ALL_SIZES[0];

export const DPI_OPTIONS = [150, 200, 240, 300];

/** Etsy-Set: je Seitenverhältnis die größte gängige Datei (max. 5 Dateien pro Angebot, je ≤ 20 MB). */
export const ETSY_SET = [
  { id: '24x36', ratio: '2:3', def: true },
  { id: '18x24', ratio: '3:4', def: true },
  { id: '16x20', ratio: '4:5', def: true },
  { id: 'A1', ratio: 'DIN A', def: true },
  { id: '11x14', ratio: '11:14', def: true },
  { id: '50x70', ratio: '5:7', def: false },
  { id: '50x50', ratio: '1:1', def: false },
];

export const ETSY_MAX_BYTES = 20 * 1000 * 1000;

/** Papiergröße (mm) nach Ausrichtung. */
export function paperMM(size, orient, imageAspect) {
  let w = Math.min(size.w, size.h), h = Math.max(size.w, size.h);
  const landscape = orient === 'landscape' || (orient === 'auto' && imageAspect > 1.02);
  if (landscape) [w, h] = [h, w];
  return [w, h];
}

export const pxFor = (mm, dpi) => Math.round((mm / IN) * dpi);
export const mmToIn = (mm) => mm / IN;
