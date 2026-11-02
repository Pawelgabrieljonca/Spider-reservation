import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Info } from 'lucide-react';
import {
  KURTYKA_GRADES,
  POPULAR_KURTYKA_GRADES,
  getGradeEquivalent,
} from '../utils/grades';

const SCALES = [
  { key: 'kurtyka', label: 'Kurtyka' },
  { key: 'french', label: 'Francuska' },
];

function tileLabel(grade, scale) {
  if (scale === 'french') {
    const eq = getGradeEquivalent(grade);
    // Wpisy typu „6c / 6c+” skracamy do pierwszej wartości, aby kafelek był zwarty
    return eq ? eq.french.split(' / ')[0] : grade;
  }
  return grade;
}

/**
 * Wybór wyceny drogi w formie kafelków z przełącznikiem skali (Kurtyka / Francuska).
 * Wartość przechowywana i wysyłana do API jest zawsze w skali krakowskiej (Kurtyki).
 */
export default function GradePicker({ value, onChange, onOpenConverter, label = 'Wycena drogi *' }) {
  const [scale, setScale] = useState('kurtyka');
  const [showAll, setShowAll] = useState(false);

  const tiles = useMemo(() => {
    if (showAll) return KURTYKA_GRADES;
    const set = new Set(POPULAR_KURTYKA_GRADES);
    if (value && KURTYKA_GRADES.includes(value)) set.add(value);
    return KURTYKA_GRADES.filter((g) => set.has(g));
  }, [showAll, value]);

  const eq = getGradeEquivalent(value);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-slate-700">{label}</span>
          {onOpenConverter && (
            <button
              type="button"
              onClick={onOpenConverter}
              aria-label="Otwórz tabelę i przelicznik skal wspinaczkowych"
              title="Tabela i przelicznik skal wspinaczkowych"
              className="inline-flex items-center justify-center w-7 h-7 rounded-full text-emerald-700 hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <Info className="w-4 h-4" />
            </button>
          )}
        </div>

        <div
          role="group"
          aria-label="Skala wyceny"
          className="inline-flex bg-slate-100 p-0.5 rounded-lg border border-slate-200"
        >
          {SCALES.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setScale(s.key)}
              aria-pressed={scale === s.key}
              className={`min-h-[32px] px-2.5 rounded-md text-xs font-semibold transition-colors ${
                scale === s.key
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Wycena drogi">
        {tiles.map((g) => {
          const active = value === g;
          return (
            <button
              key={g}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(g)}
              className={`min-h-[40px] min-w-[44px] px-2.5 py-1 rounded-lg text-sm font-mono font-bold border transition-colors ${
                active
                  ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {tileLabel(g, scale)}
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="min-h-[40px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border border-dashed border-slate-300 text-slate-600 hover:bg-slate-50"
        >
          {showAll ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" />
              <span>Mniej</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              <span>Wszystkie (do VI.8 / 9a)</span>
            </>
          )}
        </button>
      </div>

      {eq ? (
        <p className="text-sm text-slate-600 mt-2.5" aria-live="polite">
          Wybrano: <strong className="font-mono text-slate-900">{value}</strong>{' '}
          (Francuska: <strong>{eq.french}</strong>, UIAA: <strong>{eq.uiaa}</strong>) –{' '}
          {eq.level}
        </p>
      ) : (
        <p className="text-sm text-slate-500 mt-2.5">Wybierz wycenę drogi.</p>
      )}
    </div>
  );
}

