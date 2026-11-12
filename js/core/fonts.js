// Mitgelieferte Schriften (alle SIL Open Font License – frei nutzbar, auch kommerziell).

export const FONTS = {
  'Cormorant Garamond': { kind: 'serif', label: 'Cormorant Garamond', weights: [400, 500, 600], italic: true, note: 'elegante Antiqua für große Titel' },
  'EB Garamond': { kind: 'serif', label: 'EB Garamond', weights: [400, 500], italic: true, note: 'klassische Buchschrift' },
  'Newsreader': { kind: 'serif', label: 'Newsreader', weights: [400, 500], italic: true, note: 'ruhige Zeitungs-Antiqua' },
  'Jost': { kind: 'sans', label: 'Jost', weights: [300, 400, 500], italic: false, note: 'geometrische Grotesk' },
  'Hanken Grotesk': { kind: 'sans', label: 'Hanken Grotesk', weights: [400, 500, 600], italic: false, note: 'neutrale Grotesk' },
  'IBM Plex Mono': { kind: 'mono', label: 'IBM Plex Mono', weights: [400, 500], italic: false, note: 'Schreibmaschinen-Charakter für Daten & Etiketten' },
};

export const fontStack = (name) => {
  const f = FONTS[name];
  const fallback = !f ? 'serif' : f.kind === 'mono' ? 'monospace' : f.kind === 'sans' ? 'sans-serif' : 'serif';
  return `"${name}", ${fallback}`;
};

let allLoaded = null;
/** Lädt alle Schnitte, damit das Canvas sie sofort korrekt zeichnet. */
export function ensureFonts() {
  if (allLoaded) return allLoaded;
  const jobs = [];
  for (const [name, f] of Object.entries(FONTS)) {
    for (const w of f.weights) {
      jobs.push(document.fonts.load(`${w} 40px "${name}"`));
      if (f.italic && w === 400) jobs.push(document.fonts.load(`italic 400 40px "${name}"`));
    }
  }
  allLoaded = Promise.allSettled(jobs).then(() => document.fonts.ready);
  return allLoaded;
}
