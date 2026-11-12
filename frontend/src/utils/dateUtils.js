// Narzędzia formatowania dat i godzin – bezwzględnie format 24-godzinny (HH:mm, hour12: false)

export function formatDate24(isoString) {
  if (!isoString) return '—';
  const date = new Date(isoString);
  return date.toLocaleDateString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatWeekdayDate(isoString) {
  if (!isoString) return '—';
  const date = new Date(isoString);
  return date.toLocaleDateString('pl-PL', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatTime24(isoString) {
  if (!isoString) return '—';
  const date = new Date(isoString);
  return date.toLocaleTimeString('pl-PL', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function formatDateTime24(isoString) {
  if (!isoString) return '—';
  return `${formatDate24(isoString)}, ${formatTime24(isoString)}`;
}

export function formatSlotRange24(startIso, endIso) {
  if (!startIso) return '—';
  const datePart = formatWeekdayDate(startIso);
  const startPart = formatTime24(startIso);
  const endPart = endIso ? formatTime24(endIso) : '';
  return endPart ? `${datePart} • ${startPart}–${endPart}` : `${datePart} • ${startPart}`;
}

export function toLocalDateInputValue(dateObj) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Konwertuje lokalny obiekt Date na ciąg ISO 8601 z jawnym offsetem strefy czasowej (np. 2026-11-05T09:00:00+01:00)
export function toLocalIsoWithOffset(dateObj) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  const hours = String(dateObj.getHours()).padStart(2, '0');
  const minutes = String(dateObj.getMinutes()).padStart(2, '0');
  const seconds = String(dateObj.getSeconds()).padStart(2, '0');

  const offsetMin = -dateObj.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const absOffset = Math.abs(offsetMin);
  const offH = String(Math.floor(absOffset / 60)).padStart(2, '0');
  const offM = String(absOffset % 60).padStart(2, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${sign}${offH}:${offM}`;
}

// Generuje listę godzin 24h (HH:mm) co 30 minut w ścisłym przedziale [startHour:00 .. endHour:00]
export function build24hTimeOptions(startHour = 9, endHour = 22) {
  const options = [];
  for (let h = startHour; h <= endHour; h += 1) {
    const hh = String(h).padStart(2, '0');
    options.push(`${hh}:00`);
    if (h < endHour) {
      options.push(`${hh}:30`);
    }
  }
  return options;
}

export function timeStringToMinutes(hhmm) {
  const [hh, mm] = hhmm.split(':').map(Number);
  return hh * 60 + mm;
}

export function minutesToTimeString(totalMinutes) {
  const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const mm = String(totalMinutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function slotTypeLabel(slotType) {
  if (slotType === 'INDIVIDUAL_1H') return 'Trening indywidualny (60 min, 1 os.)';
  if (slotType === 'GROUP_1_5H') return 'Trening w małej grupie (90 min, max 3 os.)';
  if (slotType === 'AVAILABILITY_WINDOW') return 'Dyżur instruktora';
  return slotType || '—';
}

export function slotTypeShortLabel(slotType) {
  if (slotType === 'INDIVIDUAL_1H') return '1h Indywidualny';
  if (slotType === 'GROUP_1_5H') return '1.5h Grupowy';
  if (slotType === 'AVAILABILITY_WINDOW') return 'Okno dyżuru';
  return slotType || '—';
}

export function formatDurationMinutes(totalMinutes) {
  const mins = Number(totalMinutes) || 0;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export const EXPERIENCE_LEVEL_OPTIONS = [
  {
    value: 'BEGINNER',
    title: 'Początkujący',
    description:
      'Pierwsze wizyty na ściance, nauka podstaw asekuracji, bezpiecznego odpadania i techniki nóg.',
  },
  {
    value: 'INTERMEDIATE',
    title: 'Średniozaawansowany',
    description:
      'Swobodne wspinanie na wędkę lub z dolną asekuracją, praca nad płynnością ruchu (ok. V – VI.2).',
  },
  {
    value: 'ADVANCED',
    title: 'Zaawansowany',
    description:
      'Trening ukierunkowany na wynik, przewieszenia, bouldering siłowy oraz taktykę przejść RP/OS.',
  },
];

export function experienceLevelLabel(level) {
  if (level === 'BEGINNER') return 'Początkujący';
  if (level === 'INTERMEDIATE') return 'Średniozaawansowany';
  if (level === 'ADVANCED') return 'Zaawansowany';
  return null;
}
