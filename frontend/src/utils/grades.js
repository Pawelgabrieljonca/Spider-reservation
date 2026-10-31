// Skala krakowska (Kurtyki) obowiązująca na CW Spider oraz tabela przeliczeniowa (Francuska / UIAA)

export const KURTYKA_GRADES = [
  'II',
  'III',
  'IV',
  'IV+',
  'V-',
  'V',
  'V+',
  'VI',
  'VI+',
  'VI.1',
  'VI.1+',
  'VI.2',
  'VI.2+',
  'VI.3',
  'VI.3+',
  'VI.4',
  'VI.4+',
  'VI.5',
  'VI.5+',
  'VI.6',
  'VI.6+',
  'VI.7',
  'VI.7+',
  'VI.8',
];

export const POPULAR_KURTYKA_GRADES = [
  'IV+',
  'V',
  'V+',
  'VI',
  'VI+',
  'VI.1',
  'VI.1+',
  'VI.2',
  'VI.3',
];

export const GRADE_CONVERSION_TABLE = [
  { kurtyka: 'II', french: '2', uiaa: 'II', level: 'Początkujący' },
  { kurtyka: 'III', french: '3', uiaa: 'III', level: 'Początkujący' },
  { kurtyka: 'IV', french: '4a', uiaa: 'IV', level: 'Początkujący' },
  { kurtyka: 'IV+', french: '4b', uiaa: 'IV+', level: 'Początkujący' },
  { kurtyka: 'V-', french: '4c', uiaa: 'V-', level: 'Rekreacyjny' },
  { kurtyka: 'V', french: '5a', uiaa: 'V', level: 'Rekreacyjny' },
  { kurtyka: 'V+', french: '5b', uiaa: 'V+/VI-', level: 'Rekreacyjny' },
  { kurtyka: 'VI', french: '5c', uiaa: 'VI+', level: 'Średniozaawansowany' },
  { kurtyka: 'VI+', french: '6a', uiaa: 'VII-', level: 'Średniozaawansowany' },
  { kurtyka: 'VI.1', french: '6a+', uiaa: 'VII', level: 'Średniozaawansowany' },
  { kurtyka: 'VI.1+', french: '6b', uiaa: 'VII+', level: 'Średniozaawansowany' },
  { kurtyka: 'VI.2', french: '6b+', uiaa: 'VIII-', level: 'Zaawansowany' },
  { kurtyka: 'VI.2+', french: '6c / 6c+', uiaa: 'VIII', level: 'Zaawansowany' },
  { kurtyka: 'VI.3', french: '7a', uiaa: 'VIII+', level: 'Zaawansowany' },
  { kurtyka: 'VI.3+', french: '7a+', uiaa: 'VIII+/IX-', level: 'Zaawansowany' },
  { kurtyka: 'VI.4', french: '7b', uiaa: 'IX-', level: 'Ekspert' },
  { kurtyka: 'VI.4+', french: '7b+ / 7c', uiaa: 'IX', level: 'Ekspert' },
  { kurtyka: 'VI.5', french: '7c+', uiaa: 'IX+', level: 'Ekspert' },
  { kurtyka: 'VI.5+', french: '8a', uiaa: 'IX+/X-', level: 'Ekspert' },
  { kurtyka: 'VI.6', french: '8a+', uiaa: 'X-', level: 'Elita' },
  { kurtyka: 'VI.6+', french: '8b', uiaa: 'X', level: 'Elita' },
  { kurtyka: 'VI.7', french: '8b+', uiaa: 'X+', level: 'Elita' },
  { kurtyka: 'VI.7+', french: '8c', uiaa: 'XI-', level: 'Elita' },
  { kurtyka: 'VI.8', french: '8c+ / 9a', uiaa: 'XI', level: 'Elita' },
];

const FULL_RANK_ORDER = ['I', ...KURTYKA_GRADES, 'VI.8+'];

export function getGradeRank(gradeRaw) {
  const g = (gradeRaw || '').trim();
  const idx = FULL_RANK_ORDER.indexOf(g);
  if (idx !== -1) return idx + 100; // Wyższy priorytet dla oficjalnej skali krakowskiej

  // Fallback dla ewentualnych historycznych wpisów w skali francuskiej
  const lower = g.toLowerCase();
  const num = parseInt(lower.charAt(0), 10);
  if (!Number.isNaN(num)) {
    return num * 10 + (lower.charCodeAt(1) || 0) * 0.1 + (lower.includes('+') ? 0.05 : 0);
  }
  return -1;
}

export function getGradeEquivalent(gradeRaw) {
  const g = (gradeRaw || '').trim();
  return GRADE_CONVERSION_TABLE.find((row) => row.kurtyka === g) || null;
}

export function getGradeBadgeClasses(gradeRaw) {
  const g = (gradeRaw || '').trim();
  const idx = KURTYKA_GRADES.indexOf(g);

  if (g === 'I' || (idx >= 0 && idx <= 6)) {
    // I .. V+
    return 'bg-emerald-100 text-emerald-900 border-emerald-300';
  }
  if (idx >= 7 && idx <= 10) {
    // VI .. VI.1+
    return 'bg-sky-100 text-sky-900 border-sky-300';
  }
  if (idx >= 11 && idx <= 14) {
    // VI.2 .. VI.3+
    return 'bg-amber-100 text-amber-900 border-amber-300';
  }
  if (idx >= 15 && idx <= 18) {
    // VI.4 .. VI.5+
    return 'bg-purple-100 text-purple-900 border-purple-300';
  }
  if (idx >= 19 || g === 'VI.8+') {
    // VI.6 .. VI.8+
    return 'bg-rose-100 text-rose-900 border-rose-300';
  }

  // Fallback dla historycznych wpisów
  return 'bg-slate-100 text-slate-800 border-slate-300';
}

export function extractApiError(err, fallback = 'Wystąpił błąd podczas komunikacji z serwerem.') {
  const data = err?.response?.data;
  if (!data) return fallback;
  if (typeof data.message === 'string' && data.message.trim()) {
    return data.message;
  }
  const errorBuckets = data.errors?.json || data.errors?.query;
  if (errorBuckets && typeof errorBuckets === 'object') {
    for (const key of Object.keys(errorBuckets)) {
      const val = errorBuckets[key];
      if (Array.isArray(val) && val.length > 0) return String(val[0]);
      if (typeof val === 'string') return val;
    }
  }
  return fallback;
}

