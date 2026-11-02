import { useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Clock,
  Minus,
  Plus,
  X,
} from 'lucide-react';
import apiClient from '../api/client';
import { BTN_PRIMARY, BTN_SECONDARY } from '../styles/ui';
import {
  formatDurationMinutes,
  minutesToTimeString,
  toLocalIsoWithOffset,
} from '../utils/dateUtils';
import { extractApiError } from '../utils/grades';

const OPEN_MIN = 9 * 60; // 09:00
const CLOSE_MIN = 22 * 60; // 22:00
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

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d, n) {
  const r = startOfDay(d);
  r.setDate(r.getDate() + n);
  return r;
}

function formatFullDate(d) {
  const weekday = d.toLocaleDateString('pl-PL', { weekday: 'long' });
  const date = d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return `${weekday}, ${date}`;
}

function formatShortDate(d) {
  return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' });
}

function formatDayChip(d) {
  const dateStr = d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' });
  const weekday = d.toLocaleDateString('pl-PL', { weekday: 'short' });
  return `${dateStr} (${weekday})`;
}

function withMinutes(day, minutes) {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minutes / 60), minutes % 60, 0);
}

/**
 * Zaawansowane okno dodawania dyżurów instruktora:
 * 1. Pojedynczy dzień (szybki dyżur z opcją powtarzania danego dnia)
 * 2. Seria dyżurów (wiele dni, np. na 2 tygodnie w dni robocze lub weekendy)
 */
export default function CreateShiftModal({ initialDate, initialHour, onClose, onCreated }) {
  const [nowMs] = useState(() => Date.now());
  const [mode, setMode] = useState('single'); // 'single' | 'bulk'

  // Data początkowa (używana dla pojedynczego dnia i jako start serii)
  const [baseDay, setBaseDay] = useState(() => startOfDay(initialDate));

  // Konfiguracja godzin
  const [startMin, setStartMin] = useState(() =>
    Math.min(Math.max(initialHour * 60, OPEN_MIN), CLOSE_MIN - MIN_DURATION)
  );
  const [duration, setDuration] = useState(() =>
    Math.min(120, CLOSE_MIN - Math.min(Math.max(initialHour * 60, OPEN_MIN), CLOSE_MIN - MIN_DURATION))
  );

  // Ustawienia trybu pojedynczego (powtarzanie tego samego dnia tygodnia)
  const [repeatSingle, setRepeatSingle] = useState(false);
  const [repeatSingleWeeks, setRepeatSingleWeeks] = useState(4);

  // Ustawienia trybu hurtowego (seria dyżurów)
  const [bulkWeeks, setBulkWeeks] = useState(2);
  const [selectedWeekdays, setSelectedWeekdays] = useState(() => {
    const dayOfWeek = initialDate.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) return [6, 0];
    return [1, 2, 3, 4, 5];
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const todayStart = startOfDay(new Date(nowMs));
  const canGoPrev = baseDay.getTime() > todayStart.getTime();
  const endMin = startMin + duration;

  const shiftStart = (delta) => {
    const next = startMin + delta;
    if (next < OPEN_MIN || next > CLOSE_MIN - MIN_DURATION) return;
    setStartMin(next);
    if (next + duration > CLOSE_MIN) setDuration(CLOSE_MIN - next);
    setErrorMsg(null);
  };

  const toggleWeekday = (dayNum) => {
    setSelectedWeekdays((prev) => {
      const next = prev.includes(dayNum)
        ? prev.filter((d) => d !== dayNum)
        : [...prev, dayNum];
      return next.sort((a, b) => ((a === 0 ? 7 : a) - (b === 0 ? 7 : b)));
    });
    setErrorMsg(null);
  };

  const applyPreset = (presetDays) => {
    setSelectedWeekdays([...presetDays]);
    setErrorMsg(null);
  };

  const isPresetActive = (presetDays) => {
    if (selectedWeekdays.length !== presetDays.length) return false;
    return presetDays.every((d) => selectedWeekdays.includes(d));
  };

  // Obliczenie zakresu dni w trybie hurtowym
  const bulkEndDate = useMemo(() => {
    return addDays(baseDay, bulkWeeks * 7 - 1);
  }, [baseDay, bulkWeeks]);

  // Wygenerowane okna dyżurów w zależności od trybu
  const { plannedWindows, pastSkipped } = useMemo(() => {
    if (mode === 'single') {
      if (repeatSingle) {
        const list = [];
        for (let i = 0; i < repeatSingleWeeks; i += 1) {
          const d = addDays(baseDay, i * 7);
          const s = withMinutes(d, startMin);
          const e = withMinutes(d, endMin);
          list.push({ date: d, startDt: s, endDt: e });
        }
        const active = list.filter((item) => item.startDt.getTime() > nowMs);
        return { plannedWindows: active, pastSkipped: list.length - active.length };
      }
      const s = withMinutes(baseDay, startMin);
      const e = withMinutes(baseDay, endMin);
      const isPast = s.getTime() <= nowMs;
      return {
        plannedWindows: isPast ? [] : [{ date: baseDay, startDt: s, endDt: e }],
        pastSkipped: isPast ? 1 : 0,
      };
    }

    // mode === 'bulk'
    const list = [];
    const totalDays = bulkWeeks * 7;
    for (let i = 0; i < totalDays; i += 1) {
      const d = addDays(baseDay, i);
      if (selectedWeekdays.includes(d.getDay())) {
        const s = withMinutes(d, startMin);
        const e = withMinutes(d, endMin);
        list.push({ date: d, startDt: s, endDt: e });
      }
    }
    const active = list.filter((item) => item.startDt.getTime() > nowMs);
    return { plannedWindows: active, pastSkipped: list.length - active.length };
  }, [
    mode,
    baseDay,
    startMin,
    endMin,
    repeatSingle,
    repeatSingleWeeks,
    bulkWeeks,
    selectedWeekdays,
    nowMs,
  ]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg(null);

    if (plannedWindows.length === 0) {
      setErrorMsg(
        mode === 'bulk'
          ? 'Zaznacz co najmniej jeden dzień tygodnia w przyszłości.'
          : 'Wybrana godzina dyżuru przypada w przeszłości.'
      );
      return;
    }

    const payload = plannedWindows.map((w) => ({
      start_time: toLocalIsoWithOffset(w.startDt),
      end_time: toLocalIsoWithOffset(w.endDt),
    }));

    setIsSubmitting(true);
    try {
      if (payload.length === 1) {
        const res = await apiClient.post('/api/v1/instructor/slots', payload[0]);
        onCreated({
          createdCount: 1,
          failedCount: 0,
          start: res.data.start_time,
          end: res.data.end_time,
        });
      } else {
        const res = await apiClient.post('/api/v1/instructor/slots/bulk', { windows: payload });
        const createdCount = res.data?.created_count || 0;
        const failedCount = res.data?.failed_count || 0;
        if (createdCount === 0) {
          setErrorMsg(
            res.data?.errors?.[0]?.message ||
              'Nie udało się zapisać dyżurów (kolizja z istniejącym grafikiem).'
          );
          return;
        }
        onCreated({
          createdCount,
          failedCount,
          start: payload[0].start_time,
          end: payload[0].end_time,
        });
      }
    } catch (err) {
      setErrorMsg(
        extractApiError(
          err,
          'Nie udało się dodać okna dyżuru. Sprawdź, czy nie koliduje z innym dyżurem.'
        )
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-shift-title"
    >
      <form
        onSubmit={handleSubmit}
        className="bg-white border border-slate-200 rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-lg max-h-[92vh] overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-5"
      >
        {/* Wskaźnik chwytu na urządzeniach mobilnych (ergonomiczny arkusz dolny) */}
        <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto -mt-1 mb-1 sm:hidden" aria-hidden="true" />

        {/* Nagłówek okna dialogowego */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2.5 sm:pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              {mode === 'bulk' ? <CalendarRange className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
            </div>
            <div>
              <h3 id="create-shift-title" className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                {mode === 'bulk' ? 'Seryjne dodawanie dyżurów' : 'Dodaj dyżur'}
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-500">
                {mode === 'bulk'
                  ? 'Zaplanuj zmiany hurtowo na wiele dni'
                  : 'Zadeklaruj okno dyspozycyjności w kalendarzu'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zamknij"
            className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Przełącznik trybu: Pojedynczy dzień vs Wiele dni (czysty tekst bez ikony) */}
        <div
          role="tablist"
          aria-label="Tryb dodawania dyżurów"
          className="grid grid-cols-2 bg-slate-100 p-1 rounded-xl border border-slate-200"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'single'}
            onClick={() => setMode('single')}
            className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
              mode === 'single'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Pojedynczy dzień
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'bulk'}
            onClick={() => setMode('bulk')}
            className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
              mode === 'bulk'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-700 hover:text-slate-900'
            }`}
          >
            Wiele dni
          </button>
        </div>

        {errorMsg && (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl px-3.5 py-2.5 flex items-start gap-2 text-sm">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* TRYB 1: POJEDYNCZY DZIEŃ */}
        {mode === 'single' && (
          <div className="space-y-4">
            <div>
              <span className="flex items-center gap-1.5 text-sm font-medium text-slate-700 mb-1.5">
                <CalendarDays className="w-4 h-4 text-emerald-600" />
                Dzień dyżuru
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setBaseDay((d) => addDays(d, -1))}
                  disabled={!canGoPrev}
                  aria-label="Poprzedni dzień"
                  className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="flex-1 min-h-[44px] flex items-center justify-center rounded-lg bg-slate-50 border border-slate-200 text-sm sm:text-base font-semibold text-slate-900 capitalize px-2 text-center">
                  {formatFullDate(baseDay)}
                </div>
                <button
                  type="button"
                  onClick={() => setBaseDay((d) => addDays(d, 1))}
                  aria-label="Następny dzień"
                  className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Powtarzalność danego dnia co tydzień */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2.5">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={repeatSingle}
                  onChange={(e) => setRepeatSingle(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-xs sm:text-sm text-slate-800">
                  <span className="font-semibold block">Powtarzaj ten dzień co tydzień</span>
                  <span className="text-xs text-slate-500 block">
                    w każdy {baseDay.toLocaleDateString('pl-PL', { weekday: 'long' })} przez wybraną liczbę tygodni
                  </span>
                </span>
              </label>

              {repeatSingle && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1 pl-6.5">
                  <span className="text-xs font-semibold text-slate-600 mr-1">Tygodnie:</span>
                  {[2, 3, 4, 6, 8].map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => setRepeatSingleWeeks(w)}
                      className={`min-h-[34px] px-2.5 rounded-md text-xs font-semibold border transition-colors ${
                        repeatSingleWeeks === w
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {w} tyg.
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TRYB 2: SERIA DYŻURÓW (WIELE DNI NA RAZ) */}
        {mode === 'bulk' && (
          <div className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50/30 p-3.5 sm:p-4">
            {/* Wybór dni tygodnia */}
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <CalendarDays className="w-4 h-4 text-emerald-600" />
                  Dni tygodnia
                </span>
                <span className="text-[11px] text-slate-500 font-medium">
                  Zaznaczono: <strong>{selectedWeekdays.length} z 7</strong>
                </span>
              </div>

              {/* Szybkie presety */}
              <div className="flex flex-wrap gap-1.5 mb-2.5">
                {PRESETS.map((p) => {
                  const active = isPresetActive(p.days);
                  return (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => applyPreset(p.days)}
                      className={`min-h-[32px] px-2.5 rounded-lg text-xs font-semibold border transition-colors ${
                        active
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>

              {/* 7 kafelków dni tygodnia */}
              <div className="grid grid-cols-7 gap-1">
                {WEEKDAY_BUTTONS.map((wd) => {
                  const active = selectedWeekdays.includes(wd.day);
                  return (
                    <button
                      key={wd.day}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleWeekday(wd.day)}
                      title={wd.fullName}
                      className={`min-h-[44px] py-1 rounded-lg text-xs sm:text-sm font-bold border transition-colors flex flex-col items-center justify-center ${
                        active
                          ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                          : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <span>{wd.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Horyzont czasowy (liczba tygodni i data startu) */}
            <div className="pt-3 border-t border-emerald-200/60 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs sm:text-sm font-bold text-slate-900">
                  Przez ile tygodni?
                </span>
                <span className="text-xs text-slate-600 font-medium">
                  {formatShortDate(baseDay)} – {formatShortDate(bulkEndDate)} ({bulkWeeks * 7} dni)
                </span>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5" role="radiogroup" aria-label="Liczba tygodni">
                {WEEKS_OPTIONS.map((w) => {
                  const active = bulkWeeks === w;
                  return (
                    <button
                      key={w}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setBulkWeeks(w)}
                      className={`min-h-[40px] px-2 py-1.5 rounded-lg text-xs sm:text-sm font-bold border transition-colors ${
                        active
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {w} {w === 1 ? 'tydz.' : 'tyg.'}
                    </button>
                  );
                })}
              </div>

              {/* Data początkowa serii */}
              <div className="flex items-center justify-between text-xs text-slate-600 pt-1">
                <span>Start serii od:</span>
                <div className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setBaseDay((d) => addDays(d, -1))}
                    disabled={!canGoPrev}
                    className="p-1 rounded text-slate-500 hover:text-slate-900 disabled:opacity-30"
                    title="Dzień wcześniej"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <strong className="text-slate-900">{formatShortDate(baseDay)}</strong>
                  <button
                    type="button"
                    onClick={() => setBaseDay((d) => addDays(d, 1))}
                    className="p-1 rounded text-slate-500 hover:text-slate-900"
                    title="Dzień później"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* WSPÓLNA SEKCJA: GODZINY DYŻURU (09:00 – 22:00) */}
        <div className="space-y-3.5 pt-2 border-t border-slate-100">
          <div>
            <span className="flex items-center gap-1.5 text-sm font-medium text-slate-700 mb-1.5">
              <Clock className="w-4 h-4 text-emerald-600" />
              Początek dyżuru
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => shiftStart(-STEP_MIN)}
                disabled={startMin - STEP_MIN < OPEN_MIN}
                aria-label="Wcześniej o 30 minut"
                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Minus className="w-5 h-5" />
              </button>
              <div
                className="flex-1 min-h-[44px] flex items-center justify-center rounded-lg bg-slate-50 border border-slate-200 text-xl font-mono font-extrabold text-slate-900"
                aria-live="polite"
              >
                {minutesToTimeString(startMin)}
              </div>
              <button
                type="button"
                onClick={() => shiftStart(STEP_MIN)}
                disabled={startMin + STEP_MIN > CLOSE_MIN - MIN_DURATION}
                aria-label="Później o 30 minut"
                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div>
            <span className="block text-sm font-medium text-slate-700 mb-1.5">Długość dyżuru</span>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5" role="radiogroup" aria-label="Długość dyżuru">
              {DURATION_CHIPS.map((d) => {
                const disabled = startMin + d > CLOSE_MIN;
                const active = duration === d;
                return (
                  <button
                    key={d}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={disabled}
                    onClick={() => {
                      setDuration(d);
                      setErrorMsg(null);
                    }}
                    className={`min-h-[40px] px-2 py-1.5 rounded-lg text-xs sm:text-sm font-semibold border transition-colors disabled:opacity-35 disabled:cursor-not-allowed ${
                      active
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {formatDurationMinutes(d)}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs sm:text-sm text-slate-700">
              Godziny dyżuru:{' '}
              <strong className="font-mono text-emerald-800">
                {minutesToTimeString(startMin)} – {minutesToTimeString(endMin)}
              </strong>{' '}
              <span className="text-slate-500">({formatDurationMinutes(duration)})</span>
            </p>
          </div>
        </div>

        {/* PODSUMOWANIE I PODGLĄD WYGENEROWANYCH ZMIAN */}
        <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3.5 space-y-2">
          <div className="flex items-center justify-between text-xs sm:text-sm font-bold text-emerald-950">
            <span className="flex items-center gap-1.5">
              <CalendarCheck className="w-4 h-4 text-emerald-600" />
              Do dodania:
            </span>
            <span className="text-base font-extrabold text-emerald-700">
              {plannedWindows.length}{' '}
              {plannedWindows.length === 1
                ? 'dyżur'
                : plannedWindows.length < 5
                  ? 'dyżury'
                  : 'dyżurów'}
            </span>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            Godziny <strong className="font-mono">{minutesToTimeString(startMin)}–{minutesToTimeString(endMin)}</strong>
            {mode === 'bulk' && (
              <>
                {' '}w okresie od <strong>{formatShortDate(baseDay)}</strong> do{' '}
                <strong>{formatShortDate(bulkEndDate)}</strong>.
              </>
            )}
          </p>

          {/* Podgląd kafelków dni w serii */}
          {plannedWindows.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1 max-h-24 overflow-y-auto">
              {plannedWindows.slice(0, 14).map(({ date }, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-white border border-emerald-300 text-emerald-900 shadow-2xs"
                >
                  {formatDayChip(date)}
                </span>
              ))}
              {plannedWindows.length > 14 && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                  +{plannedWindows.length - 14} kolejnych
                </span>
              )}
            </div>
          )}

          {pastSkipped > 0 && (
            <p className="text-[11px] text-amber-800">
              Pominięto {pastSkipped} terminów, które już minęły.
            </p>
          )}
        </div>

        {/* Przyciski akcji modalnej dostosowane do kciuka na telefonie */}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:justify-end sm:gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className={`${BTN_SECONDARY} w-full sm:w-auto min-h-[44px]`}
          >
            Anuluj
          </button>
          <button
            type="submit"
            disabled={isSubmitting || plannedWindows.length === 0}
            className={`${BTN_PRIMARY} w-full sm:w-auto min-h-[44px]`}
          >
            <Plus className="w-4 h-4" />
            <span>
              {isSubmitting
                ? 'Zapisywanie…'
                : plannedWindows.length === 1
                  ? 'Dodaj dyżur'
                  : `Dodaj ${plannedWindows.length} dyżurów`}
            </span>
          </button>
        </div>
      </form>
    </div>
  );
}
