import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Plus,
} from 'lucide-react';
import apiClient from '../../api/client';
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  CARD_CLASS,
  INPUT_CLASS,
  SELECT_CLASS,
} from '../../styles/ui';
import {
  build24hTimeOptions,
  formatDurationMinutes,
  formatSlotRange24,
  minutesToTimeString,
  timeStringToMinutes,
  toLocalDateInputValue,
  toLocalIsoWithOffset,
} from '../../utils/dateUtils';
import { extractApiError } from '../../utils/grades';

const OPERATING_START_MIN = 9 * 60; // 09:00
const OPERATING_END_MIN = 22 * 60; // 22:00
const MIN_SHIFT_DURATION_MIN = 60; // min. 1 godzina dyżuru
const TIME_OPTIONS_24H = build24hTimeOptions(9, 22);

const WEEKDAYS = [
  { day: 1, short: 'Pon' },
  { day: 2, short: 'Wt' },
  { day: 3, short: 'Śr' },
  { day: 4, short: 'Czw' },
  { day: 5, short: 'Pt' },
  { day: 6, short: 'Sob' },
  { day: 0, short: 'Nd' },
];

export default function NewSlotsPage() {
  const [tomorrowStr] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return toLocalDateInputValue(d);
  });

  const [rangeMode, setRangeMode] = useState('single'); // 'single' | 'range'
  const [dateFrom, setDateFrom] = useState(tomorrowStr);
  const [dateTo, setDateTo] = useState(tomorrowStr);
  const [selectedWeekdays, setSelectedWeekdays] = useState([1, 2, 3, 4, 5, 6, 0]);

  const [shiftStart, setShiftStart] = useState('14:00');
  const [shiftEnd, setShiftEnd] = useState('20:00');

  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [partialErrors, setPartialErrors] = useState([]);
  const [upcomingWindows, setUpcomingWindows] = useState([]);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const loadUpcomingWindows = () => {
    apiClient
      .get('/api/v1/instructor/slots')
      .then((res) => {
        if (Array.isArray(res.data)) {
          setUpcomingWindows(res.data);
          setNowMs(Date.now());
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    let active = true;
    apiClient
      .get('/api/v1/instructor/slots')
      .then((res) => {
        if (active && Array.isArray(res.data)) {
          setUpcomingWindows(res.data);
          setNowMs(Date.now());
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const validStartOptions = useMemo(
    () =>
      TIME_OPTIONS_24H.filter(
        (t) => timeStringToMinutes(t) + MIN_SHIFT_DURATION_MIN <= OPERATING_END_MIN
      ),
    []
  );

  const validEndOptions = useMemo(() => {
    const minEnd = timeStringToMinutes(shiftStart) + MIN_SHIFT_DURATION_MIN;
    return TIME_OPTIONS_24H.filter((t) => {
      const m = timeStringToMinutes(t);
      return m >= minEnd && m <= OPERATING_END_MIN;
    });
  }, [shiftStart]);

  const handleStartChange = (nextStart) => {
    setShiftStart(nextStart);
    const minEnd = timeStringToMinutes(nextStart) + MIN_SHIFT_DURATION_MIN;
    if (timeStringToMinutes(shiftEnd) < minEnd) {
      setShiftEnd(minutesToTimeString(Math.min(OPERATING_END_MIN, minEnd)));
    }
  };

  const toggleWeekday = (dayNum) => {
    setSelectedWeekdays((prev) =>
      prev.includes(dayNum) ? prev.filter((d) => d !== dayNum) : [...prev, dayNum]
    );
  };

  const selectedDurationMin = Math.max(
    0,
    timeStringToMinutes(shiftEnd) - timeStringToMinutes(shiftStart)
  );

  const handleSaveShift = async (e) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setPartialErrors([]);

    const effectiveEndDay = rangeMode === 'single' ? dateFrom : dateTo;
    if (!dateFrom || !effectiveEndDay) {
      setErrorMsg('Wybierz datę dyżuru.');
      return;
    }
    if (effectiveEndDay < dateFrom) {
      setErrorMsg('Data końcowa nie może być wcześniejsza niż data początkowa.');
      return;
    }

    const startMin = timeStringToMinutes(shiftStart);
    const endMin = timeStringToMinutes(shiftEnd);
    if (startMin < OPERATING_START_MIN || endMin > OPERATING_END_MIN) {
      setErrorMsg('Dyżur musi mieścić się w godzinach otwarcia 09:00 – 22:00.');
      return;
    }
    if (endMin - startMin < MIN_SHIFT_DURATION_MIN) {
      setErrorMsg('Okno dyżuru musi trwać co najmniej 60 minut.');
      return;
    }

    const startDayObj = new Date(`${dateFrom}T00:00:00`);
    const endDayObj = new Date(`${effectiveEndDay}T00:00:00`);
    const diffDays = Math.round((endDayObj - startDayObj) / (1000 * 60 * 60 * 24)) + 1;
    if (diffDays > 31) {
      setErrorMsg('Jednorazowo możesz zapisać dyżury na maksymalnie 31 dni.');
      return;
    }
    if (rangeMode === 'range' && selectedWeekdays.length === 0) {
      setErrorMsg('Zaznacz co najmniej jeden dzień tygodnia.');
      return;
    }

    const [sh, sm] = shiftStart.split(':').map(Number);
    const [eh, em] = shiftEnd.split(':').map(Number);
    const currentNow = Date.now();
    const windowsPayload = [];

    for (let i = 0; i < diffDays; i += 1) {
      const day = new Date(startDayObj);
      day.setDate(startDayObj.getDate() + i);
      if (rangeMode === 'range' && !selectedWeekdays.includes(day.getDay())) {
        continue;
      }

      const startDt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), sh, sm, 0, 0);
      const endDt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), eh, em, 0, 0);

      if (startDt.getTime() <= currentNow) {
        if (rangeMode === 'single') {
          setErrorMsg('Nie można zapisać dyżuru rozpoczynającego się w przeszłości.');
          return;
        }
        continue;
      }

      windowsPayload.push({
        start_time: toLocalIsoWithOffset(startDt),
        end_time: toLocalIsoWithOffset(endDt),
      });
    }

    if (windowsPayload.length === 0) {
      setErrorMsg(
        'Brak przyszłych dni spełniających wybrane kryteria w podanym zakresie dat.'
      );
      return;
    }

    setIsSaving(true);
    try {
      if (windowsPayload.length === 1) {
        const res = await apiClient.post('/api/v1/instructor/slots', windowsPayload[0]);
        setSuccessMsg(
          `Zapisano dyżur: ${formatSlotRange24(res.data.start_time, res.data.end_time)}.`
        );
      } else {
        const res = await apiClient.post('/api/v1/instructor/slots/bulk', {
          windows: windowsPayload,
        });
        const createdCount = res.data?.created_count || 0;
        const failedCount = res.data?.failed_count || 0;
        if (createdCount > 0) {
          setSuccessMsg(
            `Zapisano dyżury (${createdCount} ${
              createdCount === 1 ? 'dzień' : 'dni'
            }) w godzinach ${shiftStart}–${shiftEnd}.`
          );
        }
        if (failedCount > 0) {
          setPartialErrors(res.data?.errors || []);
          if (createdCount === 0) {
            setErrorMsg(
              res.data?.errors?.[0]?.message ||
                'Nie udało się zapisać dyżurów (kolizja z istniejącym grafikiem).'
            );
          }
        }
      }
      loadUpcomingWindows();
    } catch (err) {
      setErrorMsg(extractApiError(err, 'Nie udało się zapisać dyżuru.'));
    } finally {
      setIsSaving(false);
    }
  };

  const visibleUpcoming = useMemo(
    () =>
      upcomingWindows
        .filter((w) => new Date(w.end_time).getTime() >= nowMs)
        .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
        .slice(0, 6),
    [upcomingWindows, nowMs]
  );

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      {/* Zwięzły nagłówek podstrony */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900">
          Dodaj dyżur
        </h1>
        <Link to="/app/instructor" className={BTN_SECONDARY}>
          Wróć do grafiku
        </Link>
      </div>

      {/* Prosty formularz deklaracji okna dyżuru (Dzień/Zakres, Godzina Od – Do, Zapisz dyżur) */}
      <section className={`${CARD_CLASS} p-5 sm:p-7`}>
        <form onSubmit={handleSaveShift} className="space-y-6">
          {/* 1. Wybór dnia lub zakresu dni */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-emerald-600" />
                <span>Dzień dyżuru</span>
              </label>

              <div className="inline-flex bg-slate-100 p-1 rounded-lg border border-slate-200">
                <button
                  type="button"
                  onClick={() => setRangeMode('single')}
                  className={`min-h-[38px] px-3.5 py-1.5 rounded-md text-xs sm:text-sm font-semibold transition-colors ${
                    rangeMode === 'single'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Pojedynczy dzień
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRangeMode('range');
                    if (dateTo < dateFrom) setDateTo(dateFrom);
                  }}
                  className={`min-h-[38px] px-3.5 py-1.5 rounded-md text-xs sm:text-sm font-semibold transition-colors ${
                    rangeMode === 'range'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Zakres dat
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className={rangeMode === 'single' ? 'sm:col-span-2' : ''}>
                <label
                  htmlFor="shift-date-from"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  {rangeMode === 'single' ? 'Data' : 'Data początkowa'}
                </label>
                <input
                  id="shift-date-from"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value);
                    if (rangeMode === 'single' || dateTo < e.target.value) {
                      setDateTo(e.target.value);
                    }
                  }}
                  required
                  className={INPUT_CLASS}
                />
              </div>

              {rangeMode === 'range' && (
                <div>
                  <label
                    htmlFor="shift-date-to"
                    className="block text-sm font-medium text-slate-700 mb-1.5"
                  >
                    Data końcowa
                  </label>
                  <input
                    id="shift-date-to"
                    type="date"
                    min={dateFrom}
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    required
                    className={INPUT_CLASS}
                  />
                </div>
              )}
            </div>

            {rangeMode === 'range' && (
              <div>
                <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                  Dni tygodnia
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAYS.map((wd) => {
                    const active = selectedWeekdays.includes(wd.day);
                    return (
                      <button
                        key={wd.day}
                        type="button"
                        onClick={() => toggleWeekday(wd.day)}
                        className={`min-h-[42px] min-w-[48px] px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${
                          active
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                            : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {wd.short}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 2. Godziny obecności Od – Do (09:00 – 22:00) */}
          <div className="pt-5 border-t border-slate-200 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Clock className="w-5 h-5 text-emerald-600" />
                <span>Godziny dyżuru (09:00 – 22:00)</span>
              </span>
              <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                Czas okna: {formatDurationMinutes(selectedDurationMin)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="shift-start"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Godzina Od
                </label>
                <select
                  id="shift-start"
                  value={shiftStart}
                  onChange={(e) => handleStartChange(e.target.value)}
                  className={SELECT_CLASS}
                >
                  {validStartOptions.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="shift-end"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Godzina Do
                </label>
                <select
                  id="shift-end"
                  value={shiftEnd}
                  onChange={(e) => setShiftEnd(e.target.value)}
                  className={SELECT_CLASS}
                >
                  {validEndOptions.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
              Deklarujesz wyłącznie swoje okno obecności. W tych godzinach klienci sami wybiorą w
              kalendarzu trening indywidualny (60 min) lub w małej grupie (90 min).
            </p>
          </div>

          {errorMsg && (
            <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-3 flex items-start gap-2.5 text-sm">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl px-4 py-3 space-y-1.5 text-sm">
              <div className="flex items-start gap-2.5 font-semibold">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <span>{successMsg}</span>
              </div>
              {partialErrors.length > 0 && (
                <p className="text-xs text-amber-800 pl-7">
                  Pominięto {partialErrors.length} dni z powodu kolizji z istniejącym dyżurem w
                  grafiku.
                </p>
              )}
            </div>
          )}

          <button type="submit" disabled={isSaving} className={`${BTN_PRIMARY} w-full`}>
            <Plus className="w-5 h-5" />
            <span>{isSaving ? 'Zapisywanie dyżuru...' : 'Zapisz dyżur'}</span>
          </button>
        </form>
      </section>

      {/* Kompaktowy podgląd najbliższych zapisanych dyżurów */}
      {visibleUpcoming.length > 0 && (
        <section className={`${CARD_CLASS} p-4 sm:p-5 space-y-3`}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
              Najbliższe zapisane dyżury
            </h2>
            <Link
              to="/app/instructor"
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-800"
            >
              Pełny grafik &rarr;
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {visibleUpcoming.map((win) => (
              <div
                key={win.id}
                className="py-2.5 flex items-center justify-between gap-2 text-sm"
              >
                <span className="font-semibold text-slate-900">
                  {formatSlotRange24(win.start_time, win.end_time)}
                </span>
                <span className="text-xs font-medium text-slate-500 shrink-0">
                  {formatDurationMinutes(win.duration_minutes)} • Zapisy:{' '}
                  <strong className="text-emerald-700">
                    {win.confirmed_reservations_count || 0}
                  </strong>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
