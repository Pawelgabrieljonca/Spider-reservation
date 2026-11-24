const fmt = (iso, method, opts) => (iso ? new Date(iso)[method]('pl-PL', opts) : '—');
const pad2 = (n) => String(n).padStart(2, '0');

export const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d, n) => { const r = startOfDay(d); r.setDate(r.getDate() + n); return r; };
export const formatShortDate = (d) => d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' });
export const formatDate24 = (iso) => fmt(iso, 'toLocaleDateString', { day: '2-digit', month: '2-digit', year: 'numeric' });
export const formatWeekdayDate = (iso) => fmt(iso, 'toLocaleDateString', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
export const formatTime24 = (iso) => fmt(iso, 'toLocaleTimeString', { hour: '2-digit', minute: '2-digit', hour12: false });
export const formatDateTime24 = (iso) => (iso ? `${formatDate24(iso)}, ${formatTime24(iso)}` : '—');
export const formatSlotRange24 = (startIso, endIso) =>
  startIso ? `${formatWeekdayDate(startIso)} • ${formatTime24(startIso)}${endIso ? `–${formatTime24(endIso)}` : ''}` : '—';

export const toLocalDateInputValue = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export function toLocalIsoWithOffset(d) {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return `${toLocalDateInputValue(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
}

export const minutesToTimeString = (mins) => `${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}`;

export const SLOT_TYPE_META = {
  INDIVIDUAL_1H: {
    short: '1h Indywidualny',
    full: 'Trening indywidualny (60 min)',
    title: 'Trening indywidualny',
    reservationTitle: 'Trening indywidualny 1 h',
    subtitle: 'Czas: 60 min • Limit: 1 os.',
    maxCapacity: 1,
    group: false,
  },
  GROUP_1_5H: {
    short: '1.5h Grupowy',
    full: 'Trening w małej grupie (90 min)',
    title: 'Trening w małej grupie',
    reservationTitle: 'Sekcja grupowa 1,5 h',
    subtitle: 'Czas: 90 min • Limit: 3 os.',
    maxCapacity: 3,
    group: true,
  },
};

export const slotTypeShortLabel = (t) => SLOT_TYPE_META[t]?.short || (t === 'AVAILABILITY_WINDOW' ? 'Okno dyżuru' : t) || '—';
export const slotTypeFullLabel = (t) => SLOT_TYPE_META[t]?.full || t || 'Trening wspinaczkowy';

export function formatDurationMinutes(totalMinutes) {
  const mins = Number(totalMinutes) || 0;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (!h) return `${m} min`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export const EXPERIENCE_LEVEL_OPTIONS = [
  { value: 'BEGINNER', title: 'Początkujący', description: 'Pierwsze wizyty na ściance, nauka podstaw asekuracji, bezpiecznego odpadania i techniki nóg.' },
  { value: 'INTERMEDIATE', title: 'Średniozaawansowany', description: 'Swobodne wspinanie na wędkę lub z dolną asekuracją, praca nad płynnością ruchu (ok. V – VI.2).' },
  { value: 'ADVANCED', title: 'Zaawansowany', description: 'Trening ukierunkowany na wynik, przewieszenia, bouldering siłowy oraz taktykę przejść RP/OS.' },
];

export const experienceLevelLabel = (lvl) => EXPERIENCE_LEVEL_OPTIONS.find((o) => o.value === lvl)?.title || null;
