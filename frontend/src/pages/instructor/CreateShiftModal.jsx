import { useMemo, useState } from 'react';
import { CalendarCheck, CalendarDays, CalendarRange, ChevronLeft, ChevronRight, Clock, Minus, Plus } from 'lucide-react';
import apiClient, { extractApiError } from '../../core/api';
import { addDays, formatDurationMinutes, formatShortDate, minutesToTimeString, startOfDay, toLocalIsoWithOffset } from '../../core/dateUtils';
import { AlertBanner, BTN_PRIMARY, BTN_SECONDARY, ModalShell } from '../../ui/common';

const OPEN_MIN = 9 * 60;
const CLOSE_MIN = 22 * 60;
const STEP_MIN = 30;
const MIN_DURATION = 60;
const DURATION_CHIPS = [60, 90, 120, 180, 240, 360];
const WEEKS_OPTIONS = [1, 2, 3, 4, 6, 8];
const WEEKDAY_BUTTONS = [
  { day: 1, label: 'Pon', fullName: 'Poniedziałek' },
  { day: 2, label: 'Wt', fullName: 'Wtorek' },
  { day: 3, label: 'Śr', fullName: 'Środa' },
  { day: 4, label: 'Czw', fullName: 'Czwartek' },
  { day: 5, label: 'Pt', fullName: 'Piątek' },
  { day: 6, label: 'Sob', fullName: 'Sobota' },
  { day: 0, label: 'Nd', fullName: 'Niedziela' },
];
const PRESETS = [
  { label: 'Dni powszednie (Pon–Pt)', days: [1, 2, 3, 4, 5] },
  { label: 'Codziennie (7 dni)', days: [1, 2, 3, 4, 5, 6, 0] },
  { label: 'Weekend (Sob–Nd)', days: [6, 0] },
];

const withMinutes = (d, m) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(m / 60), m % 60, 0);
const formatFullDate = (d) => `${d.toLocaleDateString('pl-PL', { weekday: 'long' })}, ${d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
const formatDayChip = (d) => `${formatShortDate(d)} (${d.toLocaleDateString('pl-PL', { weekday: 'short' })})`;
const pluralizeShift = (n) => (n === 1 ? 'dyżur' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'dyżury' : 'dyżurów');

export default function CreateShiftModal({ initialDate, initialHour, onClose, onCreated }) {
  const [nowMs] = useState(() => Date.now());
  const [mode, setMode] = useState('single');
  const [baseDay, setBaseDay] = useState(() => startOfDay(initialDate));
  const [startMin, setStartMin] = useState(() => Math.min(Math.max(initialHour * 60, OPEN_MIN), CLOSE_MIN - MIN_DURATION));
  const [duration, setDuration] = useState(() => Math.min(120, CLOSE_MIN - Math.min(Math.max(initialHour * 60, OPEN_MIN), CLOSE_MIN - MIN_DURATION)));
  const [repeatSingle, setRepeatSingle] = useState(false);
  const [repeatSingleWeeks, setRepeatSingleWeeks] = useState(4);
  const [bulkWeeks, setBulkWeeks] = useState(2);
  const [selectedWeekdays, setSelectedWeekdays] = useState(() => ([0, 6].includes(initialDate.getDay()) ? [6, 0] : [1, 2, 3, 4, 5]));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const canGoPrev = baseDay.getTime() > startOfDay(new Date(nowMs)).getTime();
  const endMin = startMin + duration;
  const bulkEndDate = useMemo(() => addDays(baseDay, bulkWeeks * 7 - 1), [baseDay, bulkWeeks]);

  const shiftStart = (delta) => {
    const next = startMin + delta;
    if (next < OPEN_MIN || next > CLOSE_MIN - MIN_DURATION) return;
    setStartMin(next);
    if (next + duration > CLOSE_MIN) setDuration(CLOSE_MIN - next);
    setErrorMsg(null);
  };

  const toggleWeekday = (dayNum) => {
    setSelectedWeekdays((prev) =>
      (prev.includes(dayNum) ? prev.filter((d) => d !== dayNum) : [...prev, dayNum]).sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b))
    );
    setErrorMsg(null);
  };

  const { plannedWindows, pastSkipped } = useMemo(() => {
    const dates = [];
    if (mode === 'single') {
      const count = repeatSingle ? repeatSingleWeeks : 1;
      for (let i = 0; i < count; i += 1) dates.push(addDays(baseDay, i * 7));
    } else {
      for (let i = 0; i < bulkWeeks * 7; i += 1) {
        const d = addDays(baseDay, i);
        if (selectedWeekdays.includes(d.getDay())) dates.push(d);
      }
    }
    const all = dates.map((d) => ({ date: d, startDt: withMinutes(d, startMin), endDt: withMinutes(d, endMin) }));
    const active = all.filter((w) => w.startDt.getTime() > nowMs);
    return { plannedWindows: active, pastSkipped: all.length - active.length };
  }, [mode, baseDay, startMin, endMin, repeatSingle, repeatSingleWeeks, bulkWeeks, selectedWeekdays, nowMs]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg(null);
    if (plannedWindows.length === 0) {
      setErrorMsg(mode === 'bulk' ? 'Zaznacz co najmniej jeden dzień tygodnia w przyszłości.' : 'Wybrana godzina dyżuru przypada w przeszłości.');
      return;
    }
    const payload = plannedWindows.map((w) => ({ start_time: toLocalIsoWithOffset(w.startDt), end_time: toLocalIsoWithOffset(w.endDt) }));
    setIsSubmitting(true);
    try {
      if (payload.length === 1) {
        const res = await apiClient.post('/api/v1/instructor/slots', payload[0]);
        onCreated({ createdCount: 1, failedCount: 0, start: res.data.start_time, end: res.data.end_time });
      } else {
        const res = await apiClient.post('/api/v1/instructor/slots/bulk', { windows: payload });
        const createdCount = res.data?.created_count || 0;
        if (createdCount === 0) {
          setErrorMsg(res.data?.errors?.[0]?.message || 'Nie udało się zapisać dyżurów (kolizja z istniejącym grafikiem).');
          return;
        }
        onCreated({ createdCount, failedCount: res.data?.failed_count || 0, start: payload[0].start_time, end: payload[0].end_time });
      }
    } catch (err) {
      setErrorMsg(extractApiError(err, 'Nie udało się dodać okna dyżuru. Sprawdź, czy nie koliduje z innym dyżurem.'));
    } finally { setIsSubmitting(false); }
  };

  const header = (
    <div className="flex items-center gap-2.5 min-w-0">
      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
        {mode === 'bulk' ? <CalendarRange className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
      </div>
      <div className="min-w-0">
        <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">{mode === 'bulk' ? 'Seryjne dodawanie dyżurów' : 'Dodaj dyżur'}</h3>
        <p className="text-[11px] sm:text-xs text-slate-500">{mode === 'bulk' ? 'Zaplanuj zmiany hurtowo na wiele dni' : 'Zadeklaruj okno dyspozycyjności w kalendarzu'}</p>
      </div>
    </div>
  );

  const footer = (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:justify-end">
      <button type="button" onClick={onClose} disabled={isSubmitting} className={`${BTN_SECONDARY} w-full sm:w-auto min-h-[44px]`}>Anuluj</button>
      <button type="submit" disabled={isSubmitting || plannedWindows.length === 0} className={`${BTN_PRIMARY} w-full sm:w-auto min-h-[44px]`}>
        <Plus className="w-4 h-4" />
        <span>{isSubmitting ? 'Zapisywanie…' : plannedWindows.length === 1 ? 'Dodaj dyżur' : `Dodaj ${plannedWindows.length} ${pluralizeShift(plannedWindows.length)}`}</span>
      </button>
    </div>
  );

  return (
    <ModalShell header={header} footer={footer} onClose={onClose} onSubmit={handleSubmit} maxWidth="max-w-lg">
      <div role="tablist" aria-label="Tryb dodawania dyżurów" className="grid grid-cols-2 bg-slate-100 p-1 rounded-xl border border-slate-200">
        {[['single', 'Pojedynczy dzień', 'bg-white text-slate-900'], ['bulk', 'Wiele dni', 'bg-emerald-600 text-white']].map(([m, label, activeCls]) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${mode === m ? `${activeCls} shadow-sm` : 'text-slate-600 hover:text-slate-900'}`}>
            {label}
          </button>
        ))}
      </div>

      <AlertBanner type="error" message={errorMsg} onClose={() => setErrorMsg(null)} />

      {mode === 'single' ? (
        <div className="space-y-4">
          <div>
            <span className="flex items-center gap-1.5 text-sm font-medium text-slate-700 mb-1.5"><CalendarDays className="w-4 h-4 text-emerald-600" />Dzień dyżuru</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setBaseDay((d) => addDays(d, -1))} disabled={!canGoPrev} aria-label="Poprzedni dzień" className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40"><ChevronLeft className="w-5 h-5" /></button>
              <div className="flex-1 min-h-[44px] flex items-center justify-center rounded-lg bg-slate-50 border border-slate-200 text-sm sm:text-base font-semibold text-slate-900 capitalize px-2 text-center">{formatFullDate(baseDay)}</div>
              <button type="button" onClick={() => setBaseDay((d) => addDays(d, 1))} aria-label="Następny dzień" className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"><ChevronRight className="w-5 h-5" /></button>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2.5">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input type="checkbox" checked={repeatSingle} onChange={(e) => setRepeatSingle(e.target.checked)} className="mt-0.5 w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
              <span className="text-xs sm:text-sm text-slate-800">
                <span className="font-semibold block">Powtarzaj ten dzień co tydzień</span>
                <span className="text-xs text-slate-500 block">w każdy {baseDay.toLocaleDateString('pl-PL', { weekday: 'long' })} przez wybraną liczbę tygodni</span>
              </span>
            </label>
            {repeatSingle && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1 pl-6">
                <span className="text-xs font-semibold text-slate-600 mr-1">Tygodnie:</span>
                {[2, 3, 4, 6, 8].map((w) => (
                  <button key={w} type="button" onClick={() => setRepeatSingleWeeks(w)} className={`min-h-[34px] px-2.5 rounded-md text-xs font-semibold border ${repeatSingleWeeks === w ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}>{w} tyg.</button>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50/30 p-3.5 sm:p-4">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-1.5"><CalendarDays className="w-4 h-4 text-emerald-600" />Dni tygodnia</span>
              <span className="text-[11px] text-slate-500 font-medium">Zaznaczono: <strong>{selectedWeekdays.length} z 7</strong></span>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {PRESETS.map((p) => {
                const active = selectedWeekdays.length === p.days.length && p.days.every((d) => selectedWeekdays.includes(d));
                return (
                  <button key={p.label} type="button" onClick={() => { setSelectedWeekdays([...p.days]); setErrorMsg(null); }} className={`min-h-[32px] px-2.5 rounded-lg text-xs font-semibold border ${active ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}>{p.label}</button>
                );
              })}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAY_BUTTONS.map((wd) => {
                const active = selectedWeekdays.includes(wd.day);
                return (
                  <button key={wd.day} type="button" aria-pressed={active} onClick={() => toggleWeekday(wd.day)} title={wd.fullName} className={`min-h-[44px] py-1 rounded-lg text-xs sm:text-sm font-bold border flex items-center justify-center ${active ? 'bg-slate-900 text-white border-slate-900 shadow-sm' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}>{wd.label}</button>
                );
              })}
            </div>
          </div>
          <div className="pt-3 border-t border-emerald-200/60 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs sm:text-sm font-bold text-slate-900">Przez ile tygodni?</span>
              <span className="text-xs text-slate-600 font-medium">{formatShortDate(baseDay)} – {formatShortDate(bulkEndDate)} ({bulkWeeks * 7} dni)</span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5" role="radiogroup" aria-label="Liczba tygodni">
              {WEEKS_OPTIONS.map((w) => (
                <button key={w} type="button" role="radio" aria-checked={bulkWeeks === w} onClick={() => setBulkWeeks(w)} className={`min-h-[40px] px-2 py-1.5 rounded-lg text-xs sm:text-sm font-bold border ${bulkWeeks === w ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}>{w} {w === 1 ? 'tydz.' : 'tyg.'}</button>
              ))}
            </div>
            <div className="flex items-center justify-between text-xs text-slate-600 pt-1">
              <span>Start serii od:</span>
              <div className="inline-flex items-center gap-1">
                <button type="button" onClick={() => setBaseDay((d) => addDays(d, -1))} disabled={!canGoPrev} className="p-1 rounded text-slate-500 hover:text-slate-900 disabled:opacity-30"><ChevronLeft className="w-3.5 h-3.5" /></button>
                <strong className="text-slate-900">{formatShortDate(baseDay)}</strong>
                <button type="button" onClick={() => setBaseDay((d) => addDays(d, 1))} className="p-1 rounded text-slate-500 hover:text-slate-900"><ChevronRight className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3.5 pt-2 border-t border-slate-100">
        <div>
          <span className="flex items-center gap-1.5 text-sm font-medium text-slate-700 mb-1.5"><Clock className="w-4 h-4 text-emerald-600" />Początek dyżuru</span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => shiftStart(-STEP_MIN)} disabled={startMin - STEP_MIN < OPEN_MIN} aria-label="Wcześniej o 30 minut" className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40"><Minus className="w-5 h-5" /></button>
            <div className="flex-1 min-h-[44px] flex items-center justify-center rounded-lg bg-slate-50 border border-slate-200 text-xl font-mono font-extrabold text-slate-900" aria-live="polite">{minutesToTimeString(startMin)}</div>
            <button type="button" onClick={() => shiftStart(STEP_MIN)} disabled={startMin + STEP_MIN > CLOSE_MIN - MIN_DURATION} aria-label="Później o 30 minut" className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40"><Plus className="w-5 h-5" /></button>
          </div>
        </div>
        <div>
          <span className="block text-sm font-medium text-slate-700 mb-1.5">Długość dyżuru</span>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5" role="radiogroup" aria-label="Długość dyżuru">
            {DURATION_CHIPS.map((d) => (
              <button key={d} type="button" role="radio" aria-checked={duration === d} disabled={startMin + d > CLOSE_MIN} onClick={() => { setDuration(d); setErrorMsg(null); }} className={`min-h-[40px] px-2 py-1.5 rounded-lg text-xs sm:text-sm font-semibold border disabled:opacity-35 ${duration === d ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}>
                {formatDurationMinutes(d)}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs sm:text-sm text-slate-700">
            Godziny dyżuru: <strong className="font-mono text-emerald-800">{minutesToTimeString(startMin)} – {minutesToTimeString(endMin)}</strong>{' '}
            <span className="text-slate-500">({formatDurationMinutes(duration)})</span>
          </p>
        </div>
      </div>

      <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3.5 space-y-2">
        <div className="flex items-center justify-between text-xs sm:text-sm font-bold text-emerald-950">
          <span className="flex items-center gap-1.5"><CalendarCheck className="w-4 h-4 text-emerald-600" />Do dodania:</span>
          <span className="text-base font-extrabold text-emerald-700">
            {plannedWindows.length} {pluralizeShift(plannedWindows.length)}
          </span>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed">
          Godziny <strong className="font-mono">{minutesToTimeString(startMin)}–{minutesToTimeString(endMin)}</strong>
          {mode === 'bulk' && <> w okresie od <strong>{formatShortDate(baseDay)}</strong> do <strong>{formatShortDate(bulkEndDate)}</strong>.</>}
        </p>
        {plannedWindows.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1 max-h-24 overflow-y-auto">
            {plannedWindows.slice(0, 14).map(({ date }, idx) => (
              <span key={idx} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-white border border-emerald-300 text-emerald-900 shadow-sm">{formatDayChip(date)}</span>
            ))}
            {plannedWindows.length > 14 && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800">+{plannedWindows.length - 14} kolejnych</span>}
          </div>
        )}
        {pastSkipped > 0 && <p className="text-[11px] text-amber-800">Pominięto {pastSkipped} terminów, które już minęły.</p>}
      </div>
    </ModalShell>
  );
}
