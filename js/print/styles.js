// Druckstile: Parameter, Voreinstellungen und Umrechnung in Shader-Uniforms.
// Alle Stile sind eigene, prozedurale Verfahren (keine Nachahmung bestimmter Künstler, keine fremden Texturen).
import { hexToUnit, clamp } from '../core/util.js';
import { lookUniforms } from '../gl/looks.js';
import { sizeById, paperMM, pxFor } from './formats.js';

const DIRS = [[270, 'oben'], [315, 'oben rechts'], [0, 'rechts'], [45, 'unten rechts'], [90, 'unten'], [135, 'unten links'], [180, 'links'], [225, 'oben links']];

// Gemeinsame Masken-Parameter („Bereiche herausnehmen“)
const MASK = [
  { key: 'mAmount', idx: 0, label: 'Menge (wie viel wegfällt)', type: 'range', min: 0.05, max: 0.95, step: 0.01, def: 0.36, group: 'Aussparung' },
  { key: 'mSource', idx: 1, label: 'Kante folgt …', type: 'select', def: 2, group: 'Aussparung',
    options: [[0, 'hellen Bildbereichen'], [1, 'dunklen Bildbereichen'], [2, 'dem Bildrand'], [3, 'einer Richtung'], [4, 'nur der gemalten Maske']] },
  { key: 'mAngle', idx: 2, label: 'Ausblenden nach', type: 'select', def: 270, group: 'Aussparung', options: DIRS, rad: true, showIf: (p) => +p.mSource === 3 },
  { key: 'mSubject', idx: 10, label: 'Motiv schützen (Details behalten)', type: 'range', min: 0, max: 1, step: 0.01, def: 0.5, group: 'Aussparung' },
  { key: 'mDetail', idx: 7, label: 'Kantenverlauf: detailreich ↔ ruhig', type: 'range', min: 0, max: 1, step: 0.01, def: 0.7, group: 'Kante' },
  { key: 'mSoft', idx: 3, label: 'Weichheit', type: 'range', min: 0, max: 1, step: 0.01, def: 0.2, group: 'Kante' },
  { key: 'mRough', idx: 4, label: 'Unruhe', type: 'range', min: 0, max: 1, step: 0.01, def: 0.45, group: 'Kante' },
  { key: 'mScale', idx: 6, label: 'Größe der Formen', type: 'range', min: 0, max: 1, step: 0.01, def: 0.4, group: 'Kante' },
  { key: 'mFiber', idx: 5, label: 'Faser / Pinselstruktur', type: 'range', min: 0, max: 1, step: 0.01, def: 0.5, group: 'Kante' },
];
const RIM = { key: 'mRim', idx: 8, label: 'Pigmentrand an der Kante', type: 'range', min: 0, max: 1, step: 0.01, def: 0.35, group: 'Kante' };
const GHOST = { key: 'mGhost', idx: 9, label: 'Restbild im Freiraum', type: 'range', min: 0, max: 1, step: 0.01, def: 0, group: 'Aussparung' };

export const GROUNDS = {
  paper: { label: 'Papier', tones: [['#f4efe6', 'Warmweiß'], ['#efe7d9', 'Naturweiß'], ['#f8f7f3', 'Hellweiß'], ['#e4e0d8', 'Hellgrau'], ['#2b2a28', 'Anthrazit']] },
  linen: { label: 'Leinen', tones: [['#d8cdbb', 'Natur'], ['#e8e1d4', 'Hell'], ['#bdb6aa', 'Grau'], ['#5f594f', 'Dunkel']] },
  plain: { label: 'Weiß (Druckmaterial scheint durch)', tones: [['#ffffff', 'Weiß']] },
  transparent: { label: 'Transparent (nur PNG)', tones: [['#ffffff', 'Weiß']] },
};
export const INKS = [['#24221e', 'Tusche'], ['#3b3b3a', 'Graphit'], ['#5b3f2c', 'Sepia'], ['#263b5e', 'Indigo'], ['#3f4b36', 'Moos'], ['#8a4b34', 'Rötel'], ['#f3efe7', 'Hell (für dunklen Grund)']];

export const PROCESSES = {
  cyan: { label: 'Cyanotypie', tones: ['#0b2342', '#1d4b7a', '#4c7cab', '#a7c1d8'], paperTint: '#e9eef0' },
  platin: { label: 'Platin / Palladium', tones: ['#29241f', '#5a4f45', '#8e8073', '#c9beb0'], paperTint: '#efe8dc' },
  vandyke: { label: 'Van Dyke (Braun)', tones: ['#2a190f', '#5b3923', '#8e6245', '#c6a486'], paperTint: '#eee3d1' },
  salz: { label: 'Salzpapier', tones: ['#3a2015', '#6d422f', '#a1725b', '#d5b8a2'], paperTint: '#f0e6d8' },
  silber: { label: 'Silbergelatine (neutral)', tones: ['#141414', '#434343', '#787878', '#b7b7b6'], paperTint: '#f3f2ef' },
  kalli: { label: 'Kallitypie', tones: ['#221b17', '#534339', '#897565', '#c5b4a4'], paperTint: '#f1eadf' },
  teecyan: { label: 'Cyanotypie, mit Tee getönt', tones: ['#25212e', '#4e4451', '#8d8178', '#cfc4b0'], paperTint: '#efe6d5' },
  lumen: { label: 'Lumen (Sonnendruck)', tones: ['#3a1f2c', '#7d4357', '#b98186', '#e3c0b4'], paperTint: '#f3e6dc' },
  gummiterra: { label: 'Gummidruck Terrakotta', tones: ['#5a2d1f', '#8c4c35', '#c08668', '#e6c4aa'], paperTint: '#f1e5d6' },
  gummigruen: { label: 'Gummidruck Grünspan', tones: ['#22342d', '#4a6457', '#8aa28c', '#ccd7c2'], paperTint: '#eef0e6' },
};

// Farbpaletten für Höhenschichten (dunkel → hell)
export const LAYER_PALETTES = {
  erde: { label: 'Erde', tones: ['#3b3127', '#6b5a45', '#a08a6a', '#cdbb9a', '#ece2cd'] },
  moor: { label: 'Moor', tones: ['#2f3a33', '#51604f', '#7f8c74', '#b4b99d', '#e3e2cf'] },
  see: { label: 'See', tones: ['#23323d', '#3f5867', '#6f8a96', '#a9bcc2', '#e1e7e5'] },
  ton: { label: 'Ton', tones: ['#4a2c24', '#7b4a3b', '#ad7a62', '#d6ad93', '#f0dccb'] },
  graphit: { label: 'Graphit', tones: ['#262626', '#4d4d4c', '#7c7b79', '#b0aeaa', '#e4e2dd'] },
};

export const STYLES = [
  {
    id: 'galerie', idx: 0, name: 'Galerie',
    desc: 'Ruhiger Druck mit Passepartout-Rand. Optional ein geprägter Plattenrand wie beim Tiefdruck und eine feine Haarlinie.',
    base: { border: 0.1, bottomExtra: 0.3, ground: 'paper', tone: '#f4efe6', texture: 0.55, ink: '#24221e' },
    params: [
      { key: 'plate', idx: 12, label: 'Plattenrand (Prägung)', type: 'toggle', def: 1, group: 'Rand' },
      { key: 'plateDist', idx: 13, label: 'Abstand Plattenrand', type: 'range', min: 2, max: 30, step: 0.5, def: 9, unit: 'mm', group: 'Rand', showIf: (p) => !!+p.plate },
      { key: 'plateStr', idx: 14, label: 'Stärke der Prägung', type: 'range', min: 0, max: 1, step: 0.01, def: 0.7, group: 'Rand', showIf: (p) => !!+p.plate },
      { key: 'plateTone', idx: 17, label: 'Plattenton (Hauch Druckfarbe)', type: 'range', min: 0, max: 1, step: 0.01, def: 0, group: 'Rand', showIf: (p) => !!+p.plate },
      { key: 'keyline', idx: 15, label: 'Haarlinie', type: 'range', min: 0, max: 1, step: 0.01, def: 0, group: 'Rand' },
      { key: 'keyGap', idx: 16, label: 'Abstand Haarlinie', type: 'range', min: 0, max: 12, step: 0.5, def: 3, unit: 'mm', group: 'Rand', showIf: (p) => +p.keyline > 0 },
    ],
  },
  {
    id: 'aussparung', idx: 1, name: 'Aussparung',
    desc: 'Teile des Bildes werden entlang natürlicher Linien herausgenommen. Im Freiraum zeigt sich Leinen, Papier – oder beim Druck auf echte Leinwand das Material selbst.',
    usesMask: true,
    base: { border: 0, bottomExtra: 0, ground: 'linen', tone: '#d8cdbb', texture: 0.85, ink: '#3b3b3a' },
    params: [
      ...MASK, RIM, GHOST,
      { key: 'texIn', idx: 12, label: 'Struktur im Bild', type: 'range', min: 0, max: 1, step: 0.01, def: 0.35, group: 'Untergrund' },
      { key: 'tintIn', idx: 13, label: 'Grundton im Bild', type: 'range', min: 0, max: 1, step: 0.01, def: 0.12, group: 'Untergrund' },
      { key: 'soft2', idx: 16, label: 'Übergang weich (breit auslaufend)', type: 'range', min: 0, max: 1, step: 0.01, def: 0, group: 'Kante' },
      { key: 'blur', idx: 11, label: 'Foto wird zum Rand unscharf', type: 'range', min: 0, max: 1, step: 0.01, def: 0, group: 'Kante' },
      { key: 'lines', idx: 14, label: 'Höhenlinien im Freiraum', type: 'range', min: 0, max: 1, step: 0.01, def: 0, group: 'Aussparung' },
      { key: 'lineLevels', idx: 15, label: 'Anzahl Linien', type: 'range', min: 8, max: 70, step: 1, def: 26, group: 'Aussparung', showIf: (p) => +p.lines > 0 },
      { key: 'lineSource', idx: 17, label: 'Linien folgen …', type: 'select', def: 0, group: 'Aussparung', options: [[0, 'den Helligkeiten'], [1, 'dem Motivrand'], [2, 'beidem']], showIf: (p) => +p.lines > 0 },
    ],
  },
  {
    id: 'edeldruck', idx: 2, name: 'Edeldruck',
    desc: 'Angelehnt an historische Verfahren (Cyanotypie, Platin, Van Dyke, Salzpapier): einfarbig getönt, mit gestrichenem Pinselrand auf Büttenpapier.',
    base: { border: 0.13, bottomExtra: 0.15, ground: 'paper', tone: '#f3eee4', texture: 0.75, ink: '#24221e' },
    params: [
      { key: 'process', label: 'Verfahren', type: 'select', def: 'cyan', group: 'Verfahren', options: Object.entries(PROCESSES).map(([k, v]) => [k, v.label]) },
      { key: 'curve', idx: 13, label: 'Kontrast', type: 'range', min: 0, max: 1, step: 0.01, def: 0.6, group: 'Verfahren' },
      { key: 'dmax', idx: 14, label: 'Tiefe (Dmax)', type: 'range', min: 0.5, max: 1, step: 0.01, def: 0.95, group: 'Verfahren' },
      { key: 'extent', idx: 15, label: 'Pinselrand um das Bild', type: 'range', min: 2, max: 60, step: 0.5, def: 16, unit: 'mm', group: 'Pinsel' },
      { key: 'rough', idx: 16, label: 'Unruhe der Striche', type: 'range', min: 0, max: 1, step: 0.01, def: 0.6, group: 'Pinsel' },
      { key: 'bristle', idx: 17, label: 'Borstenspuren', type: 'range', min: 0, max: 1, step: 0.01, def: 0.7, group: 'Pinsel' },
      { key: 'brushDir', idx: 18, label: 'Pinselrichtung', type: 'select', def: 0, group: 'Pinsel', options: [[0, 'waagerecht'], [1, 'senkrecht']] },
      { key: 'rebate', idx: 19, label: 'Heller Negativrand', type: 'range', min: 0, max: 3, step: 0.1, def: 0.8, unit: 'mm', group: 'Pinsel' },
      { key: 'mottle', idx: 20, label: 'Ungleichmäßige Beschichtung', type: 'range', min: 0, max: 1, step: 0.01, def: 0.5, group: 'Pinsel' },
    ],
  },
  {
    id: 'topografie', idx: 3, name: 'Topografie',
    desc: 'Höhenlinien, die den Helligkeiten oder dem Motivrand folgen – als Linienbild, über dem Foto, als weicher Übergang vom Foto in Linien oder als farbige Höhenschichten.',
    usesMask: (p) => +p.mode === 2 || (+p.mode < 3 && +p.lineSource > 0),
    base: { border: 0.07, bottomExtra: 0.2, ground: 'paper', tone: '#f2ede4', texture: 0.5, ink: '#24221e' },
    params: [
      { key: 'mode', idx: 12, label: 'Darstellung', type: 'select', def: 2, group: 'Linien', options: [[0, 'nur Linien'], [1, 'Linien über dem Bild'], [2, 'Übergang Bild ↔ Linien'], [3, 'Höhenschichten (Flächen)']] },
      { key: 'lineSource', idx: 22, label: 'Linien folgen …', type: 'select', def: 0, group: 'Linien', options: [[0, 'den Helligkeiten'], [1, 'dem Motivrand'], [2, 'beidem']], showIf: (p) => +p.mode < 3 },
      { key: 'levels', idx: 13, label: 'Anzahl Linien', type: 'range', min: 6, max: 90, step: 1, def: 30, group: 'Linien', showIf: (p) => +p.mode < 3 },
      { key: 'bands', idx: 9, label: 'Anzahl Schichten', type: 'range', min: 3, max: 14, step: 1, def: 7, group: 'Linien', showIf: (p) => +p.mode === 3 },
      { key: 'palette', label: 'Farben der Schichten', type: 'select', def: 'erde', group: 'Linien', options: Object.entries(LAYER_PALETTES).map(([k, v]) => [k, v.label]), showIf: (p) => +p.mode === 3 },
      { key: 'bandColor', idx: 8, label: 'Farbe aus dem Bild', type: 'range', min: 0, max: 1, step: 0.01, def: 0.3, group: 'Linien', showIf: (p) => +p.mode === 3 },
      { key: 'bandLines', idx: 23, label: 'Linien zwischen den Schichten', type: 'range', min: 0, max: 1, step: 0.01, def: 0.6, group: 'Linien', showIf: (p) => +p.mode === 3 },
      { key: 'width', idx: 14, label: 'Linienstärke', type: 'range', min: 0.06, max: 1.2, step: 0.01, def: 0.22, unit: 'mm', group: 'Linien' },
      { key: 'index', idx: 15, label: 'Betonte Linie', type: 'select', def: 5, group: 'Linien', options: [[0, 'keine'], [4, 'jede 4.'], [5, 'jede 5.'], [10, 'jede 10.']] },
      { key: 'smooth', idx: 16, label: 'Detailreich ↔ ruhig', type: 'range', min: 0, max: 1, step: 0.01, def: 0.45, group: 'Linien' },
      { key: 'lineColor', idx: 17, label: 'Linienfarbe aus dem Bild', type: 'range', min: 0, max: 1, step: 0.01, def: 0, group: 'Linien' },
      { key: 'imgOpacity', idx: 18, label: 'Bild unter den Linien', type: 'range', min: 0, max: 1, step: 0.01, def: 0.35, group: 'Linien', showIf: (p) => +p.mode === 1 },
      { key: 'tSoft', idx: 19, label: 'Übergang weich (breit auslaufend)', type: 'range', min: 0, max: 1, step: 0.01, def: 0.3, group: 'Übergang', showIf: (p) => +p.mode === 2 },
      { key: 'tReach', idx: 20, label: 'Linien reichen ins Bild', type: 'range', min: 0, max: 1, step: 0.01, def: 0.3, group: 'Übergang', showIf: (p) => +p.mode === 2 },
      { key: 'tFade', idx: 21, label: 'Linien nach außen ausblenden', type: 'range', min: 0, max: 1, step: 0.01, def: 0, group: 'Übergang', showIf: (p) => +p.mode === 2 },
      { key: 'blur', idx: 11, label: 'Foto wird zum Rand unscharf', type: 'range', min: 0, max: 1, step: 0.01, def: 0, group: 'Übergang', showIf: (p) => +p.mode === 2 },
      ...MASK.map((m) => ({ ...m, showIf: m.showIf ? (p) => +p.mode === 2 && m.showIf(p) : (p) => +p.mode === 2 })),
    ],
  },
  {
    id: 'linienstich', idx: 4, name: 'Linienstich',
    desc: 'Das Bild entsteht aus fließenden Linien, deren Stärke der Helligkeit folgt – wie ein Kupferstich, aber ruhig und modern.',
    base: { border: 0.07, bottomExtra: 0.2, ground: 'paper', tone: '#f4f0e7', texture: 0.45, ink: '#24221e' },
    params: [
      { key: 'spacing', idx: 12, label: 'Linienabstand', type: 'range', min: 0.5, max: 6, step: 0.05, def: 2.4, unit: 'mm', group: 'Linien' },
      { key: 'angle', idx: 13, label: 'Winkel', type: 'range', min: -90, max: 90, step: 1, def: 0, unit: '°', group: 'Linien' },
      { key: 'wave', idx: 14, label: 'Natürliches Schwingen', type: 'range', min: 0, max: 1, step: 0.01, def: 0.35, group: 'Linien' },
      { key: 'relief', idx: 15, label: 'Relief (Linien folgen dem Motiv)', type: 'range', min: 0, max: 1, step: 0.01, def: 0.3, group: 'Linien' },
      { key: 'gamma', idx: 16, label: 'Linienstärke: zart ↔ kräftig', type: 'range', min: 0.5, max: 2, step: 0.01, def: 1, group: 'Linien' },
      { key: 'minW', idx: 20, label: 'Mindeststärke', type: 'range', min: 0, max: 0.5, step: 0.01, def: 0.06, unit: 'mm', group: 'Linien' },
      { key: 'cross', idx: 17, label: 'Kreuzschraffur in Tiefen', type: 'range', min: 0, max: 1, step: 0.01, def: 0, group: 'Linien' },
      { key: 'lineColor', idx: 18, label: 'Linienfarbe aus dem Bild', type: 'range', min: 0, max: 1, step: 0.01, def: 0, group: 'Linien' },
    ],
  },
  {
    id: 'buetten', idx: 5, name: 'Büttenrand',
    desc: 'Das Foto als Fragment mit gerissenem, faserigem Büttenrand – auf Papier liegend, mit zartem Schatten.',
    base: { border: 0.1, bottomExtra: 0.15, ground: 'paper', tone: '#e9e3d7', texture: 0.6, ink: '#24221e' },
    params: [
      { key: 'shape', idx: 16, label: 'Form', type: 'select', def: 0, group: 'Rand', options: [[0, 'Rechteck, gerissen'], [1, 'organisch (Maske)']] },
      { key: 'amp', idx: 13, label: 'Ausfransung', type: 'range', min: 0.3, max: 14, step: 0.1, def: 4, unit: 'mm', group: 'Rand', showIf: (p) => +p.shape === 0 },
      { key: 'edgeScale', idx: 18, label: 'Feine ↔ große Risse', type: 'range', min: 0, max: 1, step: 0.01, def: 0.35, group: 'Rand', showIf: (p) => +p.shape === 0 },
      { key: 'fringe', idx: 14, label: 'Papierfasern am Rand', type: 'range', min: 0, max: 8, step: 0.1, def: 2.2, unit: 'mm', group: 'Rand' },
      { key: 'shadow', idx: 15, label: 'Schatten', type: 'range', min: 0, max: 1, step: 0.01, def: 0.4, group: 'Rand', showIf: (p) => +p.shape === 0 },
      ...MASK.map((m) => ({ ...m, showIf: m.showIf ? (p) => +p.shape === 1 && m.showIf(p) : (p) => +p.shape === 1 })),
    ],
  },
  {
    id: 'punktstich', idx: 6, name: 'Punktstich',
    desc: 'Das Bild entsteht aus unregelmäßig gesetzten Tuschepunkten, wie von Hand getupft – dicht in den Tiefen, locker in den Lichtern. Auf Wunsch als Übergang aus dem Foto.',
    usesMask: (p) => +p.mode === 1,
    base: { border: 0.07, bottomExtra: 0.2, ground: 'paper', tone: '#f4f0e7', texture: 0.45, ink: '#24221e' },
    params: [
      { key: 'mode', idx: 20, label: 'Darstellung', type: 'select', def: 0, group: 'Punkte', options: [[0, 'nur Punkte'], [1, 'Übergang Bild ↔ Punkte']] },
      { key: 'spacing', idx: 12, label: 'Punktabstand', type: 'range', min: 0.5, max: 5, step: 0.05, def: 1.3, unit: 'mm', group: 'Punkte' },
      { key: 'jitter', idx: 13, label: 'Unregelmäßigkeit', type: 'range', min: 0, max: 1, step: 0.01, def: 0.8, group: 'Punkte' },
      { key: 'gamma', idx: 14, label: 'Kontrast', type: 'range', min: 0.5, max: 2.5, step: 0.01, def: 1.1, group: 'Punkte' },
      { key: 'maxSize', idx: 15, label: 'Punktgröße in den Tiefen', type: 'range', min: 0.4, max: 1.1, step: 0.01, def: 0.78, group: 'Punkte' },
      { key: 'minSize', idx: 17, label: 'Punkte in den Lichtern', type: 'range', min: 0, max: 0.3, step: 0.01, def: 0.03, group: 'Punkte' },
      { key: 'rough', idx: 18, label: 'Unruhige Punktkanten', type: 'range', min: 0, max: 1, step: 0.01, def: 0.35, group: 'Punkte' },
      { key: 'lineColor', idx: 16, label: 'Punktfarbe aus dem Bild', type: 'range', min: 0, max: 1, step: 0.01, def: 0, group: 'Punkte' },
      { key: 'tSoft', idx: 21, label: 'Übergang weich (breit auslaufend)', type: 'range', min: 0, max: 1, step: 0.01, def: 0.3, group: 'Übergang', showIf: (p) => +p.mode === 1 },
      { key: 'blur', idx: 11, label: 'Foto wird zum Rand unscharf', type: 'range', min: 0, max: 1, step: 0.01, def: 0, group: 'Übergang', showIf: (p) => +p.mode === 1 },
      ...MASK.map((m) => ({ ...m, showIf: m.showIf ? (p) => +p.mode === 1 && m.showIf(p) : (p) => +p.mode === 1 })),
    ],
  },
  {
    id: 'stroemung', idx: 7, name: 'Strömung',
    desc: 'Feine Striche, die den Formen des Bildes folgen – wie eine Federzeichnung oder Holzmaserung. Dichte und Richtung kommen aus dem Foto selbst.',
    usesMask: (p) => +p.mode === 1,
    base: { border: 0.07, bottomExtra: 0.2, ground: 'paper', tone: '#f4f0e7', texture: 0.45, ink: '#2a2622' },
    params: [
      { key: 'mode', idx: 20, label: 'Darstellung', type: 'select', def: 0, group: 'Striche', options: [[0, 'nur Striche'], [1, 'Übergang Bild ↔ Striche']] },
      { key: 'len', idx: 12, label: 'Strichlänge', type: 'range', min: 2, max: 30, step: 0.5, def: 10, unit: 'mm', group: 'Striche' },
      { key: 'cell', idx: 13, label: 'Strichbreite', type: 'range', min: 0.15, max: 1.5, step: 0.01, def: 0.4, unit: 'mm', group: 'Striche' },
      { key: 'gamma', idx: 14, label: 'Kontrast', type: 'range', min: 0.5, max: 2.5, step: 0.01, def: 1.15, group: 'Striche' },
      { key: 'density', idx: 16, label: 'Dichte', type: 'range', min: -0.4, max: 0.4, step: 0.01, def: 0, group: 'Striche' },
      { key: 'det', idx: 18, label: 'Striche folgen: Details ↔ großen Formen', type: 'range', min: 0, max: 1, step: 0.01, def: 0.6, group: 'Striche' },
      { key: 'angle', idx: 15, label: 'Richtung in ruhigen Flächen', type: 'range', min: -90, max: 90, step: 1, def: 35, unit: '°', group: 'Striche' },
      { key: 'edgeSoft', idx: 19, label: 'Weiche Strichkanten', type: 'range', min: 0, max: 1, step: 0.01, def: 0.2, group: 'Striche' },
      { key: 'lineColor', idx: 17, label: 'Strichfarbe aus dem Bild', type: 'range', min: 0, max: 1, step: 0.01, def: 0, group: 'Striche' },
      { key: 'tSoft', idx: 21, label: 'Übergang weich (breit auslaufend)', type: 'range', min: 0, max: 1, step: 0.01, def: 0.3, group: 'Übergang', showIf: (p) => +p.mode === 1 },
      { key: 'blur', idx: 11, label: 'Foto wird zum Rand unscharf', type: 'range', min: 0, max: 1, step: 0.01, def: 0, group: 'Übergang', showIf: (p) => +p.mode === 1 },
      ...MASK.map((m) => ({ ...m, showIf: m.showIf ? (p) => +p.mode === 1 && m.showIf(p) : (p) => +p.mode === 1 })),
    ],
  },
];

export const styleById = (id) => STYLES.find((s) => s.id === id) || STYLES[0];
export const styleUsesMask = (style, p) => (typeof style.usesMask === 'function' ? style.usesMask(p) : !!style.usesMask);

export function defaultStyleParams(style) {
  const p = { ...style.base };
  for (const d of style.params) p[d.key] = d.def;
  return p;
}

export function defaultProject() {
  const params = {};
  for (const s of STYLES) params[s.id] = defaultStyleParams(s);
  return {
    sizeId: '18x24', orient: 'auto', dpi: 300,
    style: 'galerie', params,
    look: { id: 'original', strength: 1, grain: 0.35, grainSize: 0.07, sharp: 0 },
    crop: { cx: 0.5, cy: 0.5, zoom: 1 },
    seed: 12345,
    exportFormat: 'jpeg', quality: 92, etsy: true,
  };
}

/** Geometrie: Papier, Bildfenster, Ausschnitt, Pixelmaße. */
export function computeLayout(project, srcW, srcH, sizeOverride) {
  const size = sizeOverride || sizeById(project.sizeId);
  const sp = project.params[project.style];
  const [pw, ph] = paperMM(size, project.orient, srcW / srcH);
  const short = Math.min(pw, ph);
  const b = clamp(sp.border || 0, 0, 0.35) * short;
  const bottom = b * (1 + (sp.bottomExtra || 0));
  const win = [b, b, pw - b, ph - bottom];
  const winW = win[2] - win[0], winH = win[3] - win[1];
  const A = winW / winH, a = srcW / srcH;
  const zoom = Math.max(1, project.crop.zoom || 1);
  let cw, ch;
  if (a > A) { ch = 1 / zoom; cw = (A / a) / zoom; } else { cw = 1 / zoom; ch = (a / A) / zoom; }
  const cx = clamp(project.crop.cx, cw / 2, 1 - cw / 2);
  const cy = clamp(project.crop.cy, ch / 2, 1 - ch / 2);
  const dpi = project.dpi || 300;
  const W = pxFor(pw, dpi), H = pxFor(ph, dpi);
  const srcPpi = (cw * srcW) / (winW / 25.4);
  return {
    size, paperMM: [pw, ph], winMM: win,
    imgRect: [win[0] / pw, win[1] / ph, win[2] / pw, win[3] / ph],
    crop: [cx - cw / 2, cy - ch / 2, cx + cw / 2, cy + ch / 2],
    cropSize: [cw, ch],
    W, H, dpi, srcPpi, upscale: dpi / srcPpi,
  };
}

/** Alle Uniforms für den Druck-Shader. */
export function printUniforms(project, layout, src, { outW, outH, tile, flipY = 1, showPaint = false, hasPaint = false }) {
  const style = styleById(project.style);
  const sp = project.params[style.id];
  const P = new Float32Array(24);
  for (const d of style.params) {
    if (d.idx == null) continue;
    let v = sp[d.key] ?? d.def;
    if (d.type === 'toggle') v = v ? 1 : 0;
    v = Number(v);
    if (d.rad) v = (v * Math.PI) / 180;
    P[d.idx] = v;
  }
  if (style.usesMask && !style.params.some((d) => d.idx === 8)) P[8] = 0;
  const mmPerPx = layout.paperMM[0] / outW;
  const paper = hexToUnit(sp.tone || '#ffffff');
  const groundIdx = { paper: 0, linen: 1, plain: 2, transparent: 3 }[sp.ground] ?? 0;
  const look = project.look || {};
  // Edeldruck: Tonwertverlauf
  let toneArr;
  if (style.id === 'topografie') {
    toneArr = (LAYER_PALETTES[sp.palette] || LAYER_PALETTES.erde).tones.map(hexToUnit).flat();
  } else {
    const proc = PROCESSES[sp.process] || PROCESSES.cyan;
    const tone = proc.tones.map(hexToUnit);
    const tint = hexToUnit(proc.paperTint);
    const paperStop = paper.map((v, i) => v * 0.8 + tint[i] * 0.2 * (v / Math.max(0.2, Math.max(...paper))));
    toneArr = [...tone, paperStop].flat();
  }
  const lu = lookUniforms(look.id || 'original', look.strength ?? 1, look.adjust || {}, undefined, { grainSize: look.grainSize || 0.07, grainScale: 1 });
  lu.u_grain = (look.grain ?? 0.3) * (style.id === 'edeldruck' ? 0.7 : 1);
  const sharp = clamp(look.sharp || 0, 0, 1);
  return {
    ...lu,
    u_outSize: [outW, outH],
    u_tile: tile || [0, 0, outW, outH],
    u_flipY: flipY,
    u_seed: project.seed >>> 0,
    u_orient: src.orient,
    u_srcSize: [src.texW, src.texH],
    u_cubicB: 1 / 3 - sharp / 3, u_cubicC: 1 / 3 + sharp / 6,
    u_fieldSize: [src.fieldW || 1, src.fieldH || 1],
    u_paintSize: [src.paintW || 1, src.paintH || 1],
    u_hasPaint: hasPaint ? 1 : 0,
    u_showPaint: showPaint ? 1 : 0,
    u_paperMM: layout.paperMM,
    u_mmPerPx: mmPerPx,
    u_imgRect: layout.imgRect,
    u_crop: layout.crop,
    u_style: style.idx,
    u_p: P,
    u_paper: paper,
    u_ink: hexToUnit(sp.ink || '#24221e'),
    u_ground: groundIdx,
    u_groundTex: groundIdx <= 1 ? sp.texture ?? 0.5 : 0,
    u_tone: toneArr,
    u_lookOn: 1,
  };
}
