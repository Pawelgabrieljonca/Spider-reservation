import { useEffect, useMemo, useState } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Footprints,
  Lock,
  UserCheck,
} from 'lucide-react';
import { CARD_CLASS } from '../styles/ui';
import {
  formatDurationMinutes,
  formatTime24,
  toLocalDateInputValue,
} from '../utils/dateUtils';

const START_HOUR = 9;
const END_HOUR = 22;
const TOTAL_HOURS = END_HOUR - START_HOUR; // 13h (09:00 - 22:00)
const HOUR_HEIGHT = 56; // 56px na 1 godzinę -> 728px wysokości siatki

const SHORT_WEEKDAYS = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Ndz'];

function getMondayOfDate(dateObj) {
  const d = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
  const dayOffset = (d.getDay() + 6) % 7; // Poniedziałek = 0 .. Niedziela = 6
  d.setDate(d.getDate() - dayOffset);
  return d;
}

function addDays(dateObj, days) {
  const d = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
  d.setDate(d.getDate() + days);
  return d;
}

function formatDateRangeLabel(firstDate, lastDate) {
  if (firstDate.toDateString() === lastDate.toDateString()) {
    return firstDate.toLocaleDateString('pl-PL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }
  const sameYear = firstDate.getFullYear() === lastDate.getFullYear();
  const sameMonth = sameYear && firstDate.getMonth() === lastDate.getMonth();

  if (sameMonth) {
    const monthYear = lastDate.toLocaleDateString('pl-PL', {
      month: 'long',
      year: 'numeric',
    });
    return `${firstDate.getDate()} – ${lastDate.getDate()} ${monthYear}`;
  }

  const startPart = firstDate.toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
  const endPart = lastDate.toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return `${startPart} – ${endPart}`;
}

function isoToMinutesOfDay(isoString) {
  const d = new Date(isoString);
  return d.getHours() * 60 + d.getMinutes();
}

function computeVerticalPosition(startIso, endIso) {
  const startMin = Math.max(START_HOUR * 60, isoToMinutesOfDay(startIso));
  const endMin = Math.min(END_HOUR * 60, isoToMinutesOfDay(endIso));
  const clampedDuration = Math.max(25, endMin - startMin);
  const topPx = ((startMin - START_HOUR * 60) / 60) * HOUR_HEIGHT;
  const heightPx = (clampedDuration / 60) * HOUR_HEIGHT;
  return { topPx, heightPx };
}

function getInitialViewMode() {
  if (typeof window !== 'undefined' && window.innerWidth < 768) {
    return '1day';
  }
  return '3days';
}

export default function InstructorWeekTimeline({
  slots,
  nowMs,
  selectedSlotId,
  onSelectSlot,
}) {
  const baseNowDate = useMemo(() => new Date(nowMs), [nowMs]);
  const todayDateKey = useMemo(() => toLocalDateInputValue(baseNowDate), [baseNowDate]);

  // Tryb widoku: domyślnie 3 dni na desktopie, 1 dzień na urządzeniach mobilnych
  const [viewMode, setViewMode] = useState(getInitialViewMode);

  // Data bazowa (początek aktualnie wyświetlanego okna dni)
  const [anchorDate, setAnchorDate] = useState(() => {
    return new Date(baseNowDate.getFullYear(), baseNowDate.getMonth(), baseNowDate.getDate());
  });

  // Reakcja na zmianę rozmiaru okna przy pierwszym załadowaniu
  useEffect(() => {
    const handleResize = () => {
      // Tylko jeśli użytkownik nie ustawił jeszcze widoku celowo, można zaktualizować
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Poniedziałek tygodnia zawierającego anchorDate (do 7-dniowego paska szybkiego wyboru)
  const currentWeekMonday = useMemo(() => getMondayOfDate(anchorDate), [anchorDate]);

  const weekStripDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, idx) => {
      const dateObj = addDays(currentWeekMonday, idx);
      return {
        idx,
        shortName: SHORT_WEEKDAYS[idx],
        dayNumber: dateObj.getDate(),
        dateObj,
        dateKey: toLocalDateInputValue(dateObj),
      };
    });
  }, [currentWeekMonday]);

  // Dni wyświetlane aktualnie w kolumnach kalendarza
  const displayedDays = useMemo(() => {
    if (viewMode === '1day') {
      const dayIdx = (anchorDate.getDay() + 6) % 7;
      return [
        {
          idx: dayIdx,
          shortName: SHORT_WEEKDAYS[dayIdx],
          dayNumber: anchorDate.getDate(),
          monthShort: anchorDate.toLocaleDateString('pl-PL', { month: '2-digit' }),
          dateObj: anchorDate,
          dateKey: toLocalDateInputValue(anchorDate),
        },
      ];
    }
    if (viewMode === '3days') {
      return Array.from({ length: 3 }, (_, idx) => {
        const d = addDays(anchorDate, idx);
        const dayIdx = (d.getDay() + 6) % 7;
        return {
          idx: dayIdx,
          shortName: SHORT_WEEKDAYS[dayIdx],
          dayNumber: d.getDate(),
          monthShort: d.toLocaleDateString('pl-PL', { month: '2-digit' }),
          dateObj: d,
          dateKey: toLocalDateInputValue(d),
        };
      });
    }
    // 'week'
    return weekStripDays.map((wDay) => ({
      ...wDay,
      monthShort: wDay.dateObj.toLocaleDateString('pl-PL', { month: '2-digit' }),
    }));
  }, [anchorDate, viewMode, weekStripDays]);

  // Grupowanie okien dyżurów wg klucza dnia YYYY-MM-DD
  const slotsByDateKey = useMemo(() => {
    const map = new Map();
    for (const slot of slots) {
      const key = toLocalDateInputValue(new Date(slot.start_time));
      const arr = map.get(key) || [];
      arr.push(slot);
      map.set(key, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
    }
    return map;
  }, [slots]);

  // Statystyki aktualnie wyświetlanego okresu
  const periodSummary = useMemo(() => {
    let shiftCount = 0;
    let shiftMinutes = 0;
    let activeBookings = 0;

    for (const day of displayedDays) {
      const daySlots = slotsByDateKey.get(day.dateKey) || [];
      for (const s of daySlots) {
        if (!s.is_blocked) {
          shiftCount += 1;
          shiftMinutes += Number(s.duration_minutes) || 0;
        }
        activeBookings += Number(s.confirmed_reservations_count) || 0;
      }
    }
    return { shiftCount, shiftMinutes, activeBookings };
  }, [displayedDays, slotsByDateKey]);

  // Najbliższy nadchodzący dyżur (pomoc w szybkim nawigowaniu, gdy widok jest pusty)
  const nearestFutureSlot = useMemo(() => {
    const upcoming = slots
      .filter((s) => new Date(s.end_time).getTime() >= nowMs)
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
    return upcoming[0] || null;
  }, [slots, nowMs]);

  const handleJumpToSlot = (slot) => {
    if (!slot) return;
    const slotDate = new Date(slot.start_time);
    setAnchorDate(new Date(slotDate.getFullYear(), slotDate.getMonth(), slotDate.getDate()));
  };

  // Nawigacja
  const handlePrev = () => {
    if (viewMode === '1day') setAnchorDate((prev) => addDays(prev, -1));
    else if (viewMode === '3days') setAnchorDate((prev) => addDays(prev, -3));
    else setAnchorDate((prev) => addDays(prev, -7));
  };

  const handleNext = () => {
    if (viewMode === '1day') setAnchorDate((prev) => addDays(prev, 1));
    else if (viewMode === '3days') setAnchorDate((prev) => addDays(prev, 3));
    else setAnchorDate((prev) => addDays(prev, 7));
  };

  const handleToday = () => {
    setAnchorDate(new Date(baseNowDate.getFullYear(), baseNowDate.getMonth(), baseNowDate.getDate()));
  };

  const hoursAxis = useMemo(
    () => Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => START_HOUR + i),
    []
  );

  const nowMinutesOfDay = baseNowDate.getHours() * 60 + baseNowDate.getMinutes();
  const showNowIndicator =
    nowMinutesOfDay >= START_HOUR * 60 && nowMinutesOfDay <= END_HOUR * 60;
  const nowTopPx = ((nowMinutesOfDay - START_HOUR * 60) / 60) * HOUR_HEIGHT;

  const renderDayColumnEvents = (dateKey) => {
    const daySlots = slotsByDateKey.get(dateKey) || [];
    const isToday = dateKey === todayDateKey;

    return (
      <div
        className="relative w-full select-none"
        style={{ height: `${TOTAL_HOURS * HOUR_HEIGHT}px` }}
      >
        {/* Linie pomocnicze godzin (pełne) i półgodzin (przerywane) */}
        {hoursAxis.slice(0, TOTAL_HOURS).map((hour, idx) => (
          <div
            key={hour}
            className="absolute inset-x-0 border-t border-slate-200/80 pointer-events-none"
            style={{ top: `${idx * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}
          >
            <div
              className="border-t border-dashed border-slate-100 w-full"
              style={{ marginTop: `${HOUR_HEIGHT / 2}px` }}
            />
          </div>
        ))}
        <div
          className="absolute inset-x-0 border-t border-slate-200 pointer-events-none"
          style={{ top: `${TOTAL_HOURS * HOUR_HEIGHT}px` }}
        />

        {/* Wskaźnik aktualnej godziny („Teraz”) */}
        {isToday && showNowIndicator && (
          <div
            className="absolute inset-x-0 z-20 flex items-center pointer-events-none"
            style={{ top: `${nowTopPx}px` }}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-rose-600 -ml-1 shrink-0 shadow-sm" />
            <div className="h-[2px] bg-rose-600 flex-1 shadow-sm" />
          </div>
        )}

        {/* Bloki okien dyżurów (AvailabilityWindow) */}
        {daySlots.map((slot) => {
          const { topPx, heightPx } = computeVerticalPosition(slot.start_time, slot.end_time);
          const isPast = new Date(slot.end_time).getTime() < nowMs;
          const isSelected = selectedSlotId === slot.id;
          const activeSessions = (slot.booked_sessions || []).filter(
            (bs) => (bs.confirmed_reservations_count || 0) > 0
          );

          let windowStyle =
            'bg-emerald-50/85 border-emerald-400 text-emerald-950 hover:border-emerald-600';
          if (slot.is_blocked) {
            windowStyle =
              'bg-amber-50/90 border-dashed border-amber-400 text-amber-950 hover:border-amber-600';
          } else if (isPast) {
            windowStyle =
              'bg-slate-100/90 border-slate-300 text-slate-600 hover:border-slate-400';
          }

          return (
            <div key={slot.id}>
              {/* Tło okna dyżuru pokazujące pełny zakres obecności instruktora */}
              <button
                type="button"
                onClick={() => onSelectSlot(isSelected ? null : slot.id)}
                title={`Dyżur ${formatTime24(slot.start_time)}–${formatTime24(slot.end_time)} (kliknij, aby zarządzać)`}
                style={{
                  top: `${topPx + 1}px`,
                  height: `${Math.max(heightPx - 2, 26)}px`,
                }}
                className={`absolute inset-x-1 rounded-lg border-2 px-2 py-1 text-left transition-all overflow-hidden focus:outline-none ${windowStyle} ${
                  isSelected ? 'ring-2 ring-slate-900 shadow-md z-10' : 'z-[5]'
                }`}
              >
                <div className="flex items-center justify-between gap-1 text-[11px] leading-tight font-bold">
                  <span className="truncate">
                    {formatTime24(slot.start_time)} – {formatTime24(slot.end_time)}
                  </span>
                  {slot.is_blocked && <Lock className="w-3.5 h-3.5 text-amber-700 shrink-0" />}
                </div>
                <div className="text-[10px] sm:text-xs leading-tight opacity-80 truncate mt-0.5">
                  {slot.is_blocked
                    ? 'Zablokowany dla zapisów'
                    : activeSessions.length === 0
                      ? 'Wolny dyżur'
                      : `Dyżur (${formatDurationMinutes(slot.duration_minutes)})`}
                </div>
              </button>

              {/* Osadzone bloki zarezerwowanych treningów klientów na osi czasu */}
              {activeSessions.map((bs) => {
                const pos = computeVerticalPosition(bs.start_time, bs.end_time);
                const confirmedRes = (bs.reservations || []).filter(
                  (r) => r.status === 'confirmed'
                );
                const clientNames = confirmedRes
                  .map((r) => r.client_name || `#${r.client_id}`)
                  .join(', ');
                const anyEquipment = confirmedRes.some((r) => r.needs_equipment);

                return (
                  <button
                    key={bs.id}
                    type="button"
                    onClick={() => onSelectSlot(isSelected ? null : slot.id)}
                    title={`${formatTime24(bs.start_time)}–${formatTime24(bs.end_time)} • ${clientNames}`}
                    style={{
                      top: `${pos.topPx + 2}px`,
                      height: `${Math.max(pos.heightPx - 4, 30)}px`,
                    }}
                    className={`absolute left-2.5 right-2 z-10 rounded-lg p-2 text-left shadow-sm border transition-transform hover:scale-[1.01] overflow-hidden ${
                      isPast
                        ? 'bg-slate-700 text-white border-slate-800'
                        : 'bg-emerald-700 text-white border-emerald-900/30'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 text-[11px] font-bold leading-tight">
                      <span className="font-mono truncate">
                        {formatTime24(bs.start_time)} – {formatTime24(bs.end_time)}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-white/20 text-[10px] font-bold shrink-0">
                        {bs.slot_type === 'GROUP_1_5H'
                          ? `Grupa (${bs.confirmed_reservations_count}/${bs.max_capacity})`
                          : '1h'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs font-semibold leading-tight mt-1 truncate">
                      <UserCheck className="w-3.5 h-3.5 text-emerald-200 shrink-0" />
                      <span className="truncate">{clientNames}</span>
                    </div>

                    {anyEquipment && pos.heightPx >= 48 && (
                      <div className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-300 text-amber-950 text-[10px] font-bold leading-tight">
                        <Footprints className="w-3 h-3 text-amber-900" />
                        <span>Sprzęt wypożyczalni</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  };

  // Obliczenie szablonu kolumn siatki
  const gridColsClass =
    viewMode === '1day'
      ? 'grid-cols-[56px_1fr]'
      : viewMode === '3days'
        ? 'grid-cols-[56px_repeat(3,minmax(0,1fr))]'
        : 'grid-cols-[56px_repeat(7,minmax(0,1fr))] min-w-[760px]';

  return (
    <section className={`${CARD_CLASS} overflow-hidden shadow-sm`}>
      {/* Główny pasek nawigacji kalendarza: przyciski < / Dzisiaj / >, tytuł zakresu, przełącznik 1d / 3d / tydzień */}
      <div className="p-3.5 sm:p-4 border-b border-slate-200 bg-slate-50/80 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <div className="inline-flex items-center gap-1">
              <button
                type="button"
                onClick={handlePrev}
                aria-label="Wstecz"
                className="inline-flex items-center justify-center min-h-[38px] min-w-[38px] rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handleToday}
                className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
              >
                Dzisiaj
              </button>

              <button
                type="button"
                onClick={handleNext}
                aria-label="Dalej"
                className="inline-flex items-center justify-center min-h-[38px] min-w-[38px] rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <h2 className="text-sm sm:text-base font-extrabold text-slate-900 ml-1 capitalize">
              {formatDateRangeLabel(
                displayedDays[0].dateObj,
                displayedDays[displayedDays.length - 1].dateObj
              )}
            </h2>
          </div>

          <div className="flex items-center justify-between md:justify-end gap-2.5">
            {/* Przełącznik trybu widoku: 1 dzień | 3 dni (domyślny desktop) | Tydzień */}
            <div
              role="group"
              aria-label="Tryb widoku kalendarza"
              className="inline-flex bg-slate-200/90 p-0.5 sm:p-1 rounded-lg border border-slate-300/80 shadow-inner"
            >
              <button
                type="button"
                onClick={() => setViewMode('1day')}
                className={`min-h-[34px] px-2.5 sm:px-3 py-1 rounded-md text-xs sm:text-sm font-semibold transition-colors ${
                  viewMode === '1day'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                1 dzień
              </button>
              <button
                type="button"
                onClick={() => setViewMode('3days')}
                className={`min-h-[34px] px-2.5 sm:px-3 py-1 rounded-md text-xs sm:text-sm font-semibold transition-colors ${
                  viewMode === '3days'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                3 dni
              </button>
              <button
                type="button"
                onClick={() => setViewMode('week')}
                className={`min-h-[34px] px-2.5 sm:px-3 py-1 rounded-md text-xs sm:text-sm font-semibold transition-colors ${
                  viewMode === 'week'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Tydzień
              </button>
            </div>

            <div className="hidden lg:flex items-center gap-1.5 text-xs">
              <span className="px-2.5 py-1 rounded-full bg-white border border-slate-200 text-slate-700 font-medium shadow-sm">
                Dyżury: <strong>{periodSummary.shiftCount}</strong> (
                {formatDurationMinutes(periodSummary.shiftMinutes)})
              </span>
              <span className="px-2.5 py-1 rounded-full bg-emerald-100 border border-emerald-200 text-emerald-900 font-semibold shadow-sm">
                Zapisani: {periodSummary.activeBookings} os.
              </span>
            </div>
          </div>
        </div>

        {/* Pasek szybkiego wyboru 7 dni bieżącego tygodnia (Pon - Ndz) */}
        <div className="grid grid-cols-7 gap-1 pt-1 border-t border-slate-200/80">
          {weekStripDays.map((day) => {
            const isToday = day.dateKey === todayDateKey;
            const isShownInGrid = displayedDays.some((dd) => dd.dateKey === day.dateKey);
            const daySlots = slotsByDateKey.get(day.dateKey) || [];
            const hasShifts = daySlots.length > 0;
            const hasBookings = daySlots.some(
              (s) => (s.confirmed_reservations_count || 0) > 0
            );

            return (
              <button
                key={day.dateKey}
                type="button"
                onClick={() => setAnchorDate(day.dateObj)}
                title={`Przejdź do: ${day.shortName}, ${day.dayNumber}`}
                className={`py-1.5 px-1 rounded-xl flex flex-col items-center justify-center transition-all ${
                  isShownInGrid
                    ? 'bg-emerald-600 text-white font-bold shadow-sm ring-1 ring-emerald-700'
                    : isToday
                      ? 'bg-emerald-50 text-emerald-900 border border-emerald-300 font-semibold'
                      : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <span
                  className={`text-[10px] sm:text-xs uppercase ${
                    isShownInGrid ? 'text-emerald-100' : 'text-slate-500'
                  }`}
                >
                  {day.shortName}
                </span>
                <span className="text-xs sm:text-sm font-bold leading-tight mt-0.5">
                  {day.dayNumber}
                </span>
                <div className="flex items-center gap-0.5 mt-1 h-1.5">
                  {hasShifts && (
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isShownInGrid
                          ? 'bg-white'
                          : hasBookings
                            ? 'bg-emerald-600'
                            : 'bg-emerald-400'
                      }`}
                    />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Legenda wizualna + szybki skok, gdy w widoku brak dyżurów */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 pt-0.5">
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-emerald-50 border-2 border-emerald-400 inline-block" />
              <span>Wolny dyżur</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-emerald-700 inline-block" />
              <span>Zarezerwowany trening</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-amber-50 border-2 border-dashed border-amber-400 inline-block" />
              <span>Zablokowany</span>
            </span>
          </div>

          {periodSummary.shiftCount === 0 && nearestFutureSlot && (
            <button
              type="button"
              onClick={() => handleJumpToSlot(nearestFutureSlot)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-900 underline"
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              <span>
                Skocz do najbliższego dyżuru (
                {new Date(nearestFutureSlot.start_time).toLocaleDateString('pl-PL')})
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Siatka kalendarza 09:00 – 22:00 */}
      <div className={viewMode === 'week' ? 'overflow-x-auto' : ''}>
        <div className={`grid ${gridColsClass} border-b border-slate-200 bg-white sticky top-0 z-20`}>
          <div className="py-2.5 px-2 text-[11px] font-semibold text-slate-400 text-right border-r border-slate-200">
            Godz.
          </div>
          {displayedDays.map((day) => {
            const isToday = day.dateKey === todayDateKey;
            const daySlots = slotsByDateKey.get(day.dateKey) || [];
            const dayMins = daySlots.reduce(
              (acc, s) => acc + (s.is_blocked ? 0 : Number(s.duration_minutes) || 0),
              0
            );

            return (
              <div
                key={day.dateKey}
                className={`py-2 px-2 text-center border-r last:border-r-0 border-slate-200 ${
                  isToday ? 'bg-emerald-50/50' : ''
                }`}
              >
                <div className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-500">
                  {day.shortName}
                </div>
                <div
                  className={`mt-0.5 inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-extrabold ${
                    isToday ? 'bg-emerald-600 text-white' : 'text-slate-900'
                  }`}
                >
                  {day.dayNumber}
                </div>
                <div className="text-[10px] text-slate-500 h-3.5">
                  {dayMins > 0 ? formatDurationMinutes(dayMins) : '—'}
                </div>
              </div>
            );
          })}
        </div>

        {/* Ciało siatki 09:00 – 22:00 */}
        <div className={`grid ${gridColsClass} pb-4`}>
          {/* Lewa kolumna z etykietami godzin */}
          <div
            className="relative border-r border-slate-200 bg-slate-50/40"
            style={{ height: `${TOTAL_HOURS * HOUR_HEIGHT}px` }}
          >
            {hoursAxis.map((hour, idx) => (
              <div
                key={hour}
                className="absolute right-2 -translate-y-2 text-[10px] sm:text-[11px] font-mono font-medium text-slate-500"
                style={{ top: `${idx * HOUR_HEIGHT}px` }}
              >
                {String(hour).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {/* Kolumny dni */}
          {displayedDays.map((day) => {
            const isToday = day.dateKey === todayDateKey;
            return (
              <div
                key={day.dateKey}
                className={`border-r last:border-r-0 border-slate-200 ${
                  isToday ? 'bg-emerald-50/15' : 'bg-white'
                }`}
              >
                {renderDayColumnEvents(day.dateKey)}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
