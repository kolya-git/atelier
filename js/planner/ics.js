// Termine als Kalenderdatei (.ics) – der iPad-Kalender erinnert dann zur geplanten Zeit.
import { store } from '../core/store.js';
import { todayISO } from '../core/util.js';

const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
const fold = (line) => {
  const out = [];
  let s = line;
  while (s.length > 74) { out.push(s.slice(0, 74)); s = ' ' + s.slice(74); }
  out.push(s);
  return out.join('\r\n');
};
const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export function makeICS(items) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Atelier//Planer//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  const now = stamp(new Date());
  for (const it of items) {
    if (!it.date) continue;
    const [hh, mm] = (it.time || '18:00').split(':');
    const start = `${it.date.replace(/-/g, '')}T${hh.padStart(2, '0')}${mm.padStart(2, '0')}00`;
    const endMin = Number(hh) * 60 + Number(mm) + 15;
    const end = `${it.date.replace(/-/g, '')}T${String(Math.floor(endMin / 60) % 24).padStart(2, '0')}${String(endMin % 60).padStart(2, '0')}00`;
    const kind = it.kind === 'story' ? 'Story' : 'Beitrag';
    const text = it.kind === 'story' ? (it.title || '') : (it.caption || '').split('\n')[0];
    lines.push('BEGIN:VEVENT', `UID:${it.id}@atelier`, `DTSTAMP:${now}`, `DTSTART:${start}`, `DTEND:${end}`,
      fold(`SUMMARY:${esc(`Instagram-${kind}${text ? ': ' + text.slice(0, 60) : ''}`)}`),
      fold(`DESCRIPTION:${esc(it.kind === 'story' ? 'Story aus Atelier posten.' : (it.caption || ''))}`),
      'BEGIN:VALARM', 'ACTION:DISPLAY', fold(`DESCRIPTION:${esc('Jetzt posten: ' + kind)}`), 'TRIGGER:-PT10M', 'END:VALARM',
      'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/calendar;charset=utf-8' });
}

export function upcomingItems() {
  const t = todayISO();
  const items = [...store.posts.values(), ...store.stories.values()].filter((p) => p.date && p.date >= t && p.status !== 'veroeffentlicht');
  return items.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}
