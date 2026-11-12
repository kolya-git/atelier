// Looks: zurückhaltende, filmnahe Farbabstimmungen. Eigene Namen, eigene Werte – keine Kopie fremder Presets.
import { clamp } from '../core/util.js';

// Parameter: exp, temp, tint, contrast, highlights, shadows, whites, blacks, fade, rolloff,
// sat, vib, orange/yellow/green/blue: [Farbton, Sättigung, Helligkeit], sTint/hTint: [r,g,b] Teiltonung,
// balance, mono, monoMix, vignette, grain, grainSize
export const LOOKS = [
  { id: 'original', name: 'Original', note: 'unverändert', p: {} },
  { id: 'natur', name: 'Natur', note: 'leicht warm, weiche Lichter',
    p: { temp: 0.05, contrast: 0.06, highlights: -0.35, shadows: 0.18, rolloff: 0.6, vib: 0.1, sat: -0.04,
      green: [0.008, -0.1, -0.05], blue: [0, -0.08, 0], grain: 0.16 } },
  { id: 'leinen', name: 'Leinen', note: 'warm, matt, gedeckte Grüntöne',
    p: { temp: 0.1, tint: 0.02, contrast: -0.12, highlights: -0.3, shadows: 0.25, fade: 0.055, rolloff: 0.7, sat: -0.14,
      orange: [0, 0.04, 0.02], yellow: [-0.012, -0.12, 0], green: [0.03, -0.32, -0.06], blue: [-0.01, -0.3, -0.04],
      sTint: [0.022, 0.012, -0.012], hTint: [0.018, 0.01, -0.02], grain: 0.22 } },
  { id: 'salz', name: 'Salz', note: 'hell, luftig, klare Weißtöne',
    p: { exp: 0.18, temp: -0.03, contrast: -0.08, highlights: -0.2, shadows: 0.3, blacks: 0.25, rolloff: 0.8, sat: -0.18,
      green: [0.01, -0.18, 0.05], blue: [0, -0.15, 0.06], hTint: [-0.006, 0, 0.008], grain: 0.1 } },
  { id: 'erde', name: 'Erde', note: 'erdig, satte Tiefen, ruhige Blautöne',
    p: { exp: -0.05, temp: 0.12, contrast: 0.12, highlights: -0.25, shadows: -0.05, fade: 0.03, rolloff: 0.5, sat: -0.06,
      orange: [-0.006, 0.1, -0.02], yellow: [-0.02, -0.05, -0.04], green: [0.035, -0.3, -0.12], blue: [0.02, -0.38, -0.1],
      sTint: [0.016, 0.004, -0.014], grain: 0.2, vignette: 0.25 } },
  { id: 'moos', name: 'Moos', note: 'tief, grün-kühl, ruhig',
    p: { exp: -0.12, temp: -0.02, tint: -0.03, contrast: 0.1, highlights: -0.3, shadows: 0.05, fade: 0.04, rolloff: 0.6, sat: -0.1,
      yellow: [0.02, -0.1, -0.05], green: [-0.01, -0.12, -0.1], blue: [-0.02, -0.25, -0.08],
      sTint: [-0.01, 0.012, 0.01], hTint: [0.014, 0.008, -0.01], grain: 0.22, vignette: 0.3 } },
  { id: 'nebel', name: 'Nebel', note: 'kühl, weich, verblasst',
    p: { exp: 0.08, temp: -0.08, contrast: -0.25, highlights: -0.2, shadows: 0.32, fade: 0.08, rolloff: 0.8, sat: -0.3,
      green: [0.02, -0.25, 0.04], blue: [0, -0.2, 0.05], sTint: [-0.008, 0.002, 0.014], grain: 0.18 } },
  { id: 'abend', name: 'Abendlicht', note: 'goldene Lichter, weiche Schatten',
    p: { exp: 0.02, temp: 0.16, tint: 0.04, contrast: 0.04, highlights: -0.35, shadows: 0.2, fade: 0.03, rolloff: 0.75, sat: -0.02, vib: 0.08,
      orange: [-0.004, 0.06, 0.04], green: [0.03, -0.25, -0.05], blue: [0.01, -0.2, -0.05],
      sTint: [0.01, -0.004, 0.012], hTint: [0.03, 0.014, -0.022], grain: 0.18 } },
  { id: 'silber', name: 'Silber', note: 'Schwarzweiß, ausgewogen',
    p: { contrast: 0.14, highlights: -0.3, shadows: 0.15, rolloff: 0.6, mono: 1, monoMix: [0.3, 0.55, 0.15], grain: 0.3, vignette: 0.2 } },
  { id: 'kohle', name: 'Kohle', note: 'Schwarzweiß, kräftig, tiefes Schwarz',
    p: { exp: -0.05, contrast: 0.35, highlights: -0.2, shadows: -0.1, blacks: -0.3, rolloff: 0.5, mono: 1, monoMix: [0.42, 0.48, 0.1], grain: 0.4, vignette: 0.35 } },
  { id: 'tee', name: 'Tee', note: 'warm getöntes Schwarzweiß',
    p: { contrast: 0.05, highlights: -0.25, shadows: 0.2, fade: 0.05, rolloff: 0.7, mono: 1, monoMix: [0.34, 0.52, 0.14],
      sTint: [0.03, 0.012, -0.022], hTint: [0.026, 0.014, -0.018], grain: 0.26 } },
];

export const lookById = (id) => LOOKS.find((l) => l.id === id) || LOOKS[0];

const ZERO3 = [0, 0, 0];
const scale3 = (v, s) => (v ? [v[0] * s, v[1] * s, v[2] * s] : ZERO3);
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

function wbGain(temp, tint) {
  const r = 1 + 0.2 * temp, b = 1 - 0.2 * temp, g = 1 - 0.12 * tint;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return [r / lum, g / lum, b / lum];
}

export const NEUTRAL_HARM = { gain: [1, 1, 1], exposure: 0, contrast: 1, pivot: 0.45, sat: 1 };

/**
 * Baut alle Look-Uniforms.
 * look: Look-Objekt oder id; strength 0..1; adjust: {exposure, temp, contrast, saturation, grain}; harm: Angleich-Korrektur
 * grainUnit: Korngröße (px im Planer, mm im Druck)
 */
export function lookUniforms(look, strength = 1, adjust = {}, harm = NEUTRAL_HARM, { grainSize = 1.1, grainScale = 1 } = {}) {
  const L = typeof look === 'string' ? lookById(look) : look || LOOKS[0];
  const p = L.p || {};
  const s = clamp(strength, 0, 1.5);
  const a = adjust || {};
  const mono = clamp((p.mono || 0) * s, 0, 1);
  const temp = (p.temp || 0) * s + (a.temp || 0);
  const tint = (p.tint || 0) * s + (a.tint || 0);
  return {
    u_exposure: (p.exp || 0) * s + (a.exposure || 0),
    u_wbGain: wbGain(temp, tint),
    u_contrast: clamp((p.contrast || 0) * s + (a.contrast || 0), -0.9, 0.9),
    u_pivot: 0.45,
    u_highlights: (p.highlights || 0) * s + (a.highlights || 0),
    u_shadows: (p.shadows || 0) * s + (a.shadows || 0),
    u_whites: (p.whites || 0) * s,
    u_blacks: (p.blacks || 0) * s,
    u_fade: clamp((p.fade || 0) * s + (a.fade || 0), 0, 0.3),
    u_rolloff: clamp((p.rolloff ?? 0.4) * Math.min(1, s) + 0.25 * (1 - Math.min(1, s)), 0, 1),
    u_saturation: clamp((p.sat || 0) * s + (a.saturation || 0), -1, 1),
    u_vibrance: (p.vib || 0) * s + (a.vibrance || 0),
    u_hslOrange: scale3(p.orange, s),
    u_hslYellow: scale3(p.yellow, s),
    u_hslGreen: scale3(p.green, s),
    u_hslBlue: scale3(p.blue, s),
    u_shadowTint: scale3(p.sTint, s),
    u_highlightTint: scale3(p.hTint, s),
    u_tintBalance: p.balance || 0,
    u_mono: mono,
    u_monoMix: p.monoMix || [0.2126, 0.7152, 0.0722],
    u_vignette: clamp((p.vignette || 0) * s + (a.vignette || 0), 0, 1.2),
    u_grain: clamp(((p.grain || 0) * s + (a.grain || 0)) * grainScale, 0, 2),
    u_grainSize: grainSize,
    u_hGain: harm.gain,
    u_hExposure: harm.exposure,
    u_hContrast: harm.contrast,
    u_hPivot: harm.pivot,
    u_hSat: harm.sat,
  };
}

// ---------- Serie angleichen ----------
/** Zielwerte einer Bildgruppe: Median der Kennzahlen (robust gegen Ausreißer). */
export function harmonizeTarget(statsList) {
  const list = statsList.filter(Boolean);
  if (!list.length) return null;
  const med = (k) => {
    const v = list.map((s) => s[k]).sort((a, b) => a - b);
    const m = v.length >> 1;
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  };
  return { logLum: med('logLum'), p05: med('p05'), p50: med('p50'), p95: med('p95'), wbR: med('wbR'), wbB: med('wbB'), chroma: med('chroma') };
}

/**
 * Korrektur für ein Bild in Richtung Gruppen-Ziel.
 * Bewusst begrenzt, damit nichts künstlich wirkt.
 */
export function harmonizeFor(stats, target, strength = 0.7) {
  if (!stats || !target || strength <= 0) return NEUTRAL_HARM;
  const s = clamp(strength, 0, 1);
  const exposure = clamp((target.logLum - stats.logLum) / Math.LN2, -1, 1) * s * 0.75;
  const dR = clamp(target.wbR - stats.wbR, -0.22, 0.22) * s * 0.8;
  const dB = clamp(target.wbB - stats.wbB, -0.22, 0.22) * s * 0.8;
  let gain = [Math.exp(dR), 1, Math.exp(dB)];
  const lum = 0.2126 * gain[0] + 0.7152 * gain[1] + 0.0722 * gain[2];
  gain = gain.map((g) => g / lum);
  const rangeT = Math.max(0.05, target.p95 - target.p05), rangeI = Math.max(0.05, stats.p95 - stats.p05);
  const contrast = 1 + (clamp(rangeT / rangeI, 0.8, 1.25) - 1) * s;
  const sat = 1 + (clamp(target.chroma / Math.max(0.005, stats.chroma), 0.75, 1.3) - 1) * s;
  return { gain, exposure, contrast, pivot: clamp(target.p50 * 0.9, 0.3, 0.6), sat };
}

export const addAdjust = (a = {}, b = {}) => {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = (out[k] || 0) + v;
  return out;
};
export { add3 };
