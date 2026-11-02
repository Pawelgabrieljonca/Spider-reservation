import { useMemo, useState } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Footprints,
  Lock,
  Plus,
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
const HOUR_HEIGHT = 48; // Zwarty, czytelny raster 48px na 1 godzinę (624px cała siatka)

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

/**
 * Wolne przedziały w oknie dyżuru = okno pomniejszone o zajęte sesje treningowe.
 * Zwraca przedziały (ms) o długości co najmniej 30 minut.
 */
function computeFreeSegments(slot, sessions) {
  const windowStart = new Date(slot.start_time).getTime();
  const windowEnd = new Date(slot.end_time).getTime();
  const busy = sessions
    .map((bs) => [
      Math.max(windowStart, new Date(bs.start_time).getTime()),
      Math.min(windowEnd, new Date(bs.end_time).getTime()),
    ])
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);

  const free = [];
  let cursor = windowStart;
  for (const [s, e] of busy) {
    if (s > cursor) free.push({ start: cursor, end: s });
    cursor = Math.max(cursor, e);
  }
  if (cursor < windowEnd) free.push({ start: cursor, end: windowEnd });
  return free.filter((seg) => seg.end - seg.start >= 30 * 60000);
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
  onRequestCreate,
  highlightFilter = null,
}) {
  const baseNowDate = useMemo(() => new Date(nowMs), [nowMs]);
  const todayDateKey = useMemo(() => toLocalDateInputValue(baseNowDate), [baseNowDate]);

  // Tryb widoku: domyślnie 3 dni na desktopie, 1 dzień na urządzeniach mobilnych
  const [viewMode, setViewMode] = useState(getInitialViewMode);

  // Data bazowa (początek aktualnie wyświetlanego okna dni)
  const [anchorDate, setAnchorDate] = useState(() => {
    return new Date(baseNowDate.getFullYear(), baseNowDate.getMonth(), baseNowDate.getDate());
  });

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
    const monday = getMondayOfDate(anchorDate);
    return Array.from({ length: 7 }, (_, idx) => {
      const d = addDays(monday, idx);
      return {
        idx,
        shortName: SHORT_WEEKDAYS[idx],
        dayNumber: d.getDate(),
        monthShort: d.toLocaleDateString('pl-PL', { month: '2-digit' }),
        dateObj: d,
        dateKey: toLocalDateInputValue(d),
      };
    });
  }, [anchorDate, viewMode]);

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

  const todayIsDisplayed = displayedDays.some((d) => d.dateKey === todayDateKey);
  const currentTimeLabel = baseNowDate.toLocaleTimeString('pl-PL', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const renderDayColumnEvents = (day) => {
    const daySlots = slotsByDateKey.get(day.dateKey) || [];
    const isToday = day.dateKey === todayDateKey;

    return (
      <div
        className="relative w-full select-none"
        style={{ height: `${TOTAL_HOURS * HOUR_HEIGHT}px` }}
      >
        {/* Puste interaktywne wiersze godzinowe (Wzorzec Google Calendar) */}
        {hoursAxis.slice(0, TOTAL_HOURS).map((hour, idx) => (
          <div
            key={hour}
            onClick={() => onRequestCreate?.({ dayDate: day.dateObj, hour })}
            title={`Kliknij, aby dodać dyżur o ${String(hour).padStart(2, '0')}:00`}
            className="absolute inset-x-0 group cursor-pointer hover:bg-emerald-50/60 transition-colors"
            style={{ top: `${idx * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}
          >
            {/* Linia połówki godziny */}
            <div
              className="border-t border-dashed border-slate-100 group-hover:border-emerald-200 w-full"
              style={{ marginTop: `${HOUR_HEIGHT / 2}px` }}
            />
            {/* Dyskretna etykieta hover ułatwiająca klikanie */}
            <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute right-1.5 top-1 z-10 flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-emerald-100 border border-emerald-300 px-1.5 py-0.5 rounded shadow-sm pointer-events-none">
              <Plus className="w-3 h-3 text-emerald-600" />
              <span>Dodaj {String(hour).padStart(2, '0')}:00</span>
            </div>
          </div>
        ))}

        {/* Dolna linia graniczna siatki */}
        <div
          className="absolute inset-x-0 border-t border-slate-200 pointer-events-none"
          style={{ top: `${TOTAL_HOURS * HOUR_HEIGHT}px` }}
        />

        {/* Wskaźnik aktualnego czasu („Teraz”) powiązany z dniem dzisiejszym */}
        {isToday && showNowIndicator && (
          <div
            className="absolute inset-x-0 z-20 flex items-center pointer-events-none"
            style={{ top: `${nowTopPx}px`, transform: 'translateY(-50%)' }}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-rose-600 -ml-1 shrink-0 shadow-sm" />
            <div className="h-[2px] bg-rose-600 flex-1 shadow-sm" />
            <span className="bg-rose-600 text-white font-mono text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm mr-1">
              Teraz
            </span>
          </div>
        )}

        {/* Bloki okien dyżurów: część zajęta (klient + rodzaj treningu + sprzęt) oraz pozostałe wolne przedziały */}
        {daySlots.map((slot) => {
          const { topPx, heightPx } = computeVerticalPosition(slot.start_time, slot.end_time);
          const isPast = new Date(slot.end_time).getTime() < nowMs;
          const isSelected = selectedSlotId === slot.id;
          const activeSessions = (slot.booked_sessions || []).filter(
            (bs) => (bs.confirmed_reservations_count || 0) > 0
          );
          const hasBookings = activeSessions.length > 0;
          const freeSegments = slot.is_blocked ? [] : computeFreeSegments(slot, activeSessions);

          let dimmed = false;
          if (highlightFilter === 'booked') dimmed = !hasBookings;
          else if (highlightFilter === 'upcoming') dimmed = slot.is_blocked || isPast;
          else if (highlightFilter === 'completed') dimmed = !isPast;

          let windowStyle =
            'bg-emerald-50/85 border-emerald-400 text-emerald-950 hover:border-emerald-600';
          if (slot.is_blocked) {
            windowStyle =
              'bg-amber-50/90 border-dashed border-amber-400 text-amber-950 hover:border-amber-600';
          } else if (isPast) {
            windowStyle =
              'bg-slate-100/90 border-slate-300 text-slate-600 hover:border-slate-400';
          } else if (hasBookings) {
            // Okno z zapisami: tło przezroczyste – widać blok zajęty i osobne bloki wolne
            windowStyle = 'bg-white/40 border-emerald-500 text-emerald-950 hover:border-emerald-700';
          }

          return (
            <div key={slot.id} className={`transition-opacity ${dimmed ? 'opacity-25' : ''}`}>
              {/* Ramka okna dyżuru pokazująca pełny zakres obecności instruktora */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectSlot(isSelected ? null : slot.id);
                }}
                title={`Dyżur ${formatTime24(slot.start_time)}–${formatTime24(slot.end_time)} (kliknij, aby zarządzać)`}
                style={{
                  top: `${topPx + 1}px`,
                  height: `${Math.max(heightPx - 2, 24)}px`,
                }}
                className={`absolute inset-x-1 rounded-lg border-2 px-2 py-1 text-left transition-all overflow-hidden focus:outline-none ${windowStyle} ${
                  isSelected ? 'ring-2 ring-slate-900 shadow-md z-10' : 'z-[5]'
                }`}
              >
                {!hasBookings && (
                  <>
                    <div className="flex items-center justify-between gap-1 text-[11px] leading-tight font-bold">
                      <span className="truncate">
                        {formatTime24(slot.start_time)} – {formatTime24(slot.end_time)}
                      </span>
                      {slot.is_blocked && <Lock className="w-3.5 h-3.5 text-amber-700 shrink-0" />}
                    </div>
                    <div className="text-[10px] leading-tight opacity-80 truncate mt-0.5">
                      {slot.is_blocked
                        ? 'Zablokowany dla zapisów'
                        : `Wolny dyżur (${formatDurationMinutes(slot.duration_minutes)})`}
                    </div>
                  </>
                )}
              </button>

              {/* Pozostałe wolne przedziały w oknie (klik przechodzi do okna dyżuru) */}
              {freeSegments.map((seg) => {
                const pos = computeVerticalPosition(
                  new Date(seg.start).toISOString(),
                  new Date(seg.end).toISOString()
                );
                const minutes = Math.round((seg.end - seg.start) / 60000);
                return (
                  <div
                    key={`free-${seg.start}`}
                    aria-hidden="true"
                    style={{
                      top: `${pos.topPx + 2}px`,
                      height: `${Math.max(pos.heightPx - 4, 20)}px`,
                    }}
                    className={`absolute left-2 right-1.5 z-[6] pointer-events-none rounded-md border border-dashed px-1.5 py-0.5 overflow-hidden text-[10px] leading-tight font-semibold ${
                      isPast
                        ? 'border-slate-300 bg-slate-50 text-slate-500'
                        : 'border-emerald-400 bg-emerald-50 text-emerald-800'
                    }`}
                  >
                    <span className="font-mono">
                      {formatTime24(new Date(seg.start).toISOString())}–
                      {formatTime24(new Date(seg.end).toISOString())}
                    </span>{' '}
                    <span className="font-bold">Wolne</span>
                    {pos.heightPx >= 40 && (
                      <span className="block font-normal opacity-80">
                        {formatDurationMinutes(minutes)} do zarezerwowania
                      </span>
                    )}
                  </div>
                );
              })}

              {/* Bloki zajęte: klient, rodzaj treningu, tag sprzętu */}
              {activeSessions.map((bs) => {
                const pos = computeVerticalPosition(bs.start_time, bs.end_time);
                const confirmedRes = (bs.reservations || []).filter(
                  (r) => r.status === 'confirmed'
                );
                const clientNames = confirmedRes
                  .map((r) => r.client_name || `#${r.client_id}`)
                  .join(', ');
                const equipmentRes = confirmedRes.filter((r) => r.needs_equipment);
                const anyEquipment = equipmentRes.length > 0;
                const isGroup = bs.slot_type === 'GROUP_1_5H';
                const typeLabel = isGroup
                  ? `Grupa ${bs.confirmed_reservations_count}/${bs.max_capacity}`
                  : 'Indyw. 1h';

                let equipmentLabel = 'Własny sprzęt';
                if (anyEquipment) {
                  if (confirmedRes.length === 1) {
                    const shoe = equipmentRes[0].client_shoe_size;
                    equipmentLabel = shoe ? `Wypożyczenie • but EU ${shoe}` : 'Wypożyczenie sprzętu';
                  } else {
                    equipmentLabel = `Wypożyczenie: ${equipmentRes.length} z ${confirmedRes.length} os.`;
                  }
                }
                const roomForThirdLine = pos.heightPx >= 60;

                return (
                  <button
                    key={bs.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectSlot(isSelected ? null : slot.id);
                    }}
                    title={`${formatTime24(bs.start_time)}–${formatTime24(bs.end_time)} • ${typeLabel} • ${clientNames} • ${equipmentLabel}`}
                    style={{
                      top: `${pos.topPx + 2}px`,
                      height: `${Math.max(pos.heightPx - 4, 28)}px`,
                    }}
                    className={`absolute left-2 right-1.5 z-10 rounded-lg p-1.5 text-left shadow-sm border transition-transform hover:scale-[1.01] overflow-hidden ${
                      isPast
                        ? 'bg-slate-700 text-white border-slate-800'
                        : 'bg-emerald-700 text-white border-emerald-900/30'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 text-[10px] font-bold leading-tight">
                      <span className="font-mono truncate">
                        {formatTime24(bs.start_time)} – {formatTime24(bs.end_time)}
                      </span>
                      <span className="px-1 rounded bg-white/20 text-[9px] font-bold shrink-0">
                        {typeLabel}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 text-[11px] font-semibold leading-tight mt-0.5">
                      <UserCheck className="w-3 h-3 text-emerald-200 shrink-0" />
                      <span className="truncate flex-1">{clientNames}</span>
                      {anyEquipment && !roomForThirdLine && (
                        <Footprints className="w-3 h-3 text-amber-300 shrink-0" aria-label={equipmentLabel} />
                      )}
                    </div>

                    {roomForThirdLine && (
                      <div
                        className={`mt-1 inline-flex max-w-full items-center gap-1 px-1.5 rounded text-[9px] font-bold leading-tight ${
                          anyEquipment ? 'bg-amber-300 text-amber-950' : 'bg-white/15 text-white/90'
                        }`}
                      >
                        <Footprints className="w-3 h-3 shrink-0" />
                        <span className="truncate">{equipmentLabel}</span>
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
      {/* 
        Pasek nawigacji kalendarza: 
        - Mobile: czytelny nagłówek daty na pełną szerokość + pasek nawigacji i widoków pod spodem
        - Desktop: jednolita belka < Dzisiaj > z zakresem i przełącznikiem 1 dzień | 3 dni | Tydzień
      */}
      <div className="p-3 sm:p-4 border-b border-slate-200 bg-slate-50/80">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3">
          {/* Tytuł i kontekstowe podsumowanie na mobile na pełną szerokość (bez ucinania tekstu) */}
          <div className="sm:hidden min-w-0">
            <h2 className="text-sm font-extrabold text-slate-900 capitalize truncate">
              {formatDateRangeLabel(
                displayedDays[0].dateObj,
                displayedDays[displayedDays.length - 1].dateObj
              )}
            </h2>
            <p className="text-[11px] text-slate-500 font-medium truncate mt-0.5">
              {periodSummary.shiftCount > 0 ? (
                <>
                  <span className="text-slate-800 font-semibold">
                    {formatDurationMinutes(periodSummary.shiftMinutes)} dyżurów
                  </span>
                  <span className="mx-1 text-slate-400">•</span>
                  <span className={periodSummary.activeBookings > 0 ? 'text-emerald-700 font-semibold' : 'text-slate-500'}>
                    {periodSummary.activeBookings}{' '}
                    {periodSummary.activeBookings === 1 ? 'zapisany' : 'zapisanych'}
                  </span>
                </>
              ) : (
                <span className="text-slate-400">Brak zaplanowanych dyżurów</span>
              )}
            </p>
          </div>

          <div className="flex items-center justify-between sm:justify-start gap-2 sm:gap-3">
            <div className="inline-flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={handlePrev}
                aria-label="Wstecz"
                className="inline-flex items-center justify-center min-h-[38px] min-w-[38px] rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition-colors shadow-sm"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handleToday}
                className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition-colors shadow-sm"
              >
                Dzisiaj
              </button>

              <button
                type="button"
                onClick={handleNext}
                aria-label="Dalej"
                className="inline-flex items-center justify-center min-h-[38px] min-w-[38px] rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition-colors shadow-sm"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Tytuł i kontekstowe podsumowanie na desktopie */}
            <div className="hidden sm:block min-w-0">
              <h2 className="text-sm sm:text-base font-extrabold text-slate-900 capitalize truncate">
                {formatDateRangeLabel(
                  displayedDays[0].dateObj,
                  displayedDays[displayedDays.length - 1].dateObj
                )}
              </h2>
              <p className="text-xs text-slate-500 font-medium truncate mt-0.5">
                {periodSummary.shiftCount > 0 ? (
                  <>
                    <span className="text-slate-800 font-semibold">
                      {formatDurationMinutes(periodSummary.shiftMinutes)} dyżurów łącznie
                    </span>
                    <span className="mx-1.5 text-slate-400">•</span>
                    <span className={periodSummary.activeBookings > 0 ? 'text-emerald-700 font-semibold' : 'text-slate-500'}>
                      {periodSummary.activeBookings}{' '}
                      {periodSummary.activeBookings === 1 ? 'zapisany uczestnik' : 'zapisanych uczestników'}
                    </span>
                  </>
                ) : (
                  <span className="text-slate-400">Brak zaplanowanych dyżurów w tym okresie</span>
                )}
              </p>
            </div>

            {/* Przełącznik trybu widoku na mobile – kompaktowe pigułki 1 d. | 3 d. | Tydz. */}
            <div className="sm:hidden">
              <div
                role="group"
                aria-label="Tryb widoku kalendarza"
                className="inline-flex bg-slate-200/90 p-0.5 rounded-lg border border-slate-300/80 shadow-inner"
              >
                <button
                  type="button"
                  onClick={() => setViewMode('1day')}
                  className={`min-h-[34px] px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                    viewMode === '1day'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  1 d.
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('3days')}
                  className={`min-h-[34px] px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                    viewMode === '3days'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  3 d.
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('week')}
                  className={`min-h-[34px] px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                    viewMode === 'week'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Tydz.
                </button>
              </div>
            </div>
          </div>

          {/* Przełącznik trybu widoku na desktopie: 1 dzień | 3 dni | Tydzień */}
          <div className="hidden sm:flex items-center justify-end gap-2">
            <div
              role="group"
              aria-label="Tryb widoku kalendarza"
              className="inline-flex bg-slate-200/90 p-1 rounded-lg border border-slate-300/80 shadow-inner"
            >
              <button
                type="button"
                onClick={() => setViewMode('1day')}
                className={`min-h-[34px] px-3 py-1 rounded-md text-xs sm:text-sm font-semibold transition-colors ${
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
                className={`min-h-[34px] px-3 py-1 rounded-md text-xs sm:text-sm font-semibold transition-colors ${
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
                className={`min-h-[34px] px-3 py-1 rounded-md text-xs sm:text-sm font-semibold transition-colors ${
                  viewMode === 'week'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Tydzień
              </button>
            </div>
          </div>
        </div>

        {/* Dyskretny pasek szybkiego skoku, jeśli w bieżącym widoku nie ma dyżurów */}
        {periodSummary.shiftCount === 0 && nearestFutureSlot && (
          <div className="pt-2 border-t border-slate-200/60 mt-2 text-xs">
            <button
              type="button"
              onClick={() => handleJumpToSlot(nearestFutureSlot)}
              className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 hover:text-emerald-900 underline"
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              <span>
                Skocz do najbliższego dyżuru ({new Date(nearestFutureSlot.start_time).toLocaleDateString('pl-PL')})
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Siatka kalendarza 09:00 – 22:00 */}
      <div className={viewMode === 'week' ? 'overflow-x-auto' : ''}>
        {/* Nagłówki bezpośrednio w kolumnach siatki godzinowej */}
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
                  isToday ? 'bg-emerald-50/60' : ''
                }`}
              >
                <div className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-500">
                  {day.shortName}
                  {isToday && (
                    <span className="ml-1 text-[10px] text-emerald-700 font-semibold lowercase">
                      (dziś)
                    </span>
                  )}
                </div>
                <div
                  className={`mt-0.5 inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-extrabold ${
                    isToday ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-900'
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
        <div className={`grid ${gridColsClass} pb-2 relative`}>
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

            {/* Czerwony badge z aktualną godziną na osi czasu */}
            {todayIsDisplayed && showNowIndicator && (
              <div
                className="absolute right-1 z-30 pointer-events-none"
                style={{ top: `${nowTopPx}px`, transform: 'translateY(-50%)' }}
              >
                <span className="bg-rose-600 text-white font-mono text-[9px] font-bold px-1 py-0.5 rounded shadow-sm">
                  {currentTimeLabel}
                </span>
              </div>
            )}
          </div>

          {/* Kolumny poszczególnych dni */}
          {displayedDays.map((day) => {
            const isToday = day.dateKey === todayDateKey;
            return (
              <div
                key={day.dateKey}
                className={`border-r last:border-r-0 border-slate-200 ${
                  isToday ? 'bg-emerald-50/15' : 'bg-white'
                }`}
              >
                {renderDayColumnEvents(day)}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
