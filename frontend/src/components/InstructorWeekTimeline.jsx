import { useMemo, useState } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
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
const HOUR_HEIGHT = 56; // px na 1 godzinę -> 728px wysokości siatki

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

function formatWeekRangeLabel(mondayDate, sundayDate) {
  const sameMonth =
    mondayDate.getMonth() === sundayDate.getMonth() &&
    mondayDate.getFullYear() === sundayDate.getFullYear();

  if (sameMonth) {
    const monthYear = sundayDate.toLocaleDateString('pl-PL', {
      month: 'long',
      year: 'numeric',
    });
    return `${mondayDate.getDate()} – ${sundayDate.getDate()} ${monthYear}`;
  }

  const startPart = mondayDate.toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'short',
  });
  const endPart = sundayDate.toLocaleDateString('pl-PL', {
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

export default function InstructorWeekTimeline({
  slots,
  nowMs,
  selectedSlotId,
  onSelectSlot,
}) {
  const baseNowDate = useMemo(() => new Date(nowMs), [nowMs]);
  const todayDateKey = useMemo(() => toLocalDateInputValue(baseNowDate), [baseNowDate]);
  const baseMonday = useMemo(() => getMondayOfDate(baseNowDate), [baseNowDate]);

  const [weekOffset, setWeekOffset] = useState(0);
  const [mobileDayIndex, setMobileDayIndex] = useState(() => (baseNowDate.getDay() + 6) % 7);

  const weekDays = useMemo(() => {
    const startMonday = addDays(baseMonday, weekOffset * 7);
    return Array.from({ length: 7 }, (_, idx) => {
      const dateObj = addDays(startMonday, idx);
      return {
        idx,
        shortName: SHORT_WEEKDAYS[idx],
        dayNumber: dateObj.getDate(),
        monthShort: dateObj.toLocaleDateString('pl-PL', { month: '2-digit' }),
        dateObj,
        dateKey: toLocalDateInputValue(dateObj),
      };
    });
  }, [baseMonday, weekOffset]);

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

  // Statystyki wyświetlanego tygodnia
  const weekSummary = useMemo(() => {
    let shiftCount = 0;
    let shiftMinutes = 0;
    let activeBookings = 0;

    for (const day of weekDays) {
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
  }, [weekDays, slotsByDateKey]);

  // Najbliższy nadchodzący dyżur (podpowiedź szybkiego skoku, gdy bieżący tydzień jest pusty)
  const nearestFutureSlot = useMemo(() => {
    const upcoming = slots
      .filter((s) => new Date(s.end_time).getTime() >= nowMs)
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
    return upcoming[0] || null;
  }, [slots, nowMs]);

  const handleJumpToSlotWeek = (slot) => {
    if (!slot) return;
    const slotDate = new Date(slot.start_time);
    const slotMonday = getMondayOfDate(slotDate);
    const diffDays = Math.round(
      (slotMonday.getTime() - baseMonday.getTime()) / (24 * 60 * 60 * 1000)
    );
    setWeekOffset(Math.round(diffDays / 7));
    setMobileDayIndex((slotDate.getDay() + 6) % 7);
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
            <span className="w-2 h-2 rounded-full bg-rose-600 -ml-1 shrink-0" />
            <div className="h-[2px] bg-rose-600 flex-1" />
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
              {/* Tło okna dyżuru pokazujące pełny zakres obecności i wolne „okienka” */}
              <button
                type="button"
                onClick={() => onSelectSlot(isSelected ? null : slot.id)}
                title={`Dyżur ${formatTime24(slot.start_time)}–${formatTime24(slot.end_time)} (kliknij, aby zarządzać)`}
                style={{
                  top: `${topPx + 1}px`,
                  height: `${Math.max(heightPx - 2, 26)}px`,
                }}
                className={`absolute inset-x-1 rounded-lg border-2 px-1.5 py-1 text-left transition-all overflow-hidden focus:outline-none ${windowStyle} ${
                  isSelected ? 'ring-2 ring-slate-900 shadow-md z-10' : 'z-[5]'
                }`}
              >
                <div className="flex items-center justify-between gap-1 text-[10px] leading-tight font-bold">
                  <span className="truncate">
                    {formatTime24(slot.start_time)}–{formatTime24(slot.end_time)}
                  </span>
                  {slot.is_blocked && <Lock className="w-3 h-3 text-amber-700 shrink-0" />}
                </div>
                <div className="text-[10px] leading-tight opacity-80 truncate">
                  {slot.is_blocked
                    ? 'Zablokowany'
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
                      height: `${Math.max(pos.heightPx - 4, 28)}px`,
                    }}
                    className={`absolute left-2 right-1.5 z-10 rounded-md px-2 py-1 text-left shadow-sm border transition-transform hover:scale-[1.01] overflow-hidden ${
                      isPast
                        ? 'bg-slate-700 text-white border-slate-800'
                        : 'bg-emerald-700 text-white border-emerald-900/30'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 text-[10px] font-bold leading-tight">
                      <span className="font-mono truncate">
                        {formatTime24(bs.start_time)}–{formatTime24(bs.end_time)}
                      </span>
                      <span className="px-1 rounded bg-white/20 text-[9px] shrink-0">
                        {bs.slot_type === 'GROUP_1_5H'
                          ? `1.5h (${bs.confirmed_reservations_count}/${bs.max_capacity})`
                          : '1h'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 text-[11px] font-semibold leading-tight mt-0.5 truncate">
                      <UserCheck className="w-3 h-3 text-emerald-200 shrink-0" />
                      <span className="truncate">{clientNames}</span>
                    </div>

                    {anyEquipment && pos.heightPx >= 48 && (
                      <div className="mt-0.5 inline-block px-1.5 py-0.2 rounded bg-amber-300 text-amber-950 text-[9px] font-bold leading-tight">
                        Sprzęt do przygotowania
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

  const activeMobileDay = weekDays[mobileDayIndex] || weekDays[0];

  return (
    <section className={`${CARD_CLASS} overflow-hidden`}>
      {/* Pasek nawigacji tygodniami + podsumowanie tygodnia */}
      <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50/70 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setWeekOffset((w) => w - 1)}
              aria-label="Poprzedni tydzień"
              className="inline-flex items-center justify-center min-h-[38px] min-w-[38px] rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                setWeekOffset(0);
                setMobileDayIndex((baseNowDate.getDay() + 6) % 7);
              }}
              disabled={weekOffset === 0}
              className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-45"
            >
              Bieżący tydzień
            </button>

            <button
              type="button"
              onClick={() => setWeekOffset((w) => w + 1)}
              aria-label="Następny tydzień"
              className="inline-flex items-center justify-center min-h-[38px] min-w-[38px] rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <h2 className="text-sm sm:text-base font-extrabold text-slate-900 ml-1 capitalize">
              {formatWeekRangeLabel(weekDays[0].dateObj, weekDays[6].dateObj)}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-full bg-white border border-slate-200 text-slate-700 font-medium">
              Dyżury w tyg.: <strong>{weekSummary.shiftCount}</strong> (
              {formatDurationMinutes(weekSummary.shiftMinutes)})
            </span>
            <span className="px-2.5 py-1 rounded-full bg-emerald-100 border border-emerald-200 text-emerald-900 font-semibold">
              Zapisani w tyg.: {weekSummary.activeBookings} os.
            </span>
          </div>
        </div>

        {/* Legenda wizualna osi czasu + szybki skok, gdy tydzień jest pusty */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <div className="flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-emerald-50 border-2 border-emerald-400 inline-block" />
              <span>Wolne okno dyżuru</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-emerald-700 inline-block" />
              <span>Zarezerwowany trening (1h / 1.5h)</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-amber-50 border-2 border-dashed border-amber-400 inline-block" />
              <span>Zablokowany</span>
            </span>
          </div>

          {weekSummary.shiftCount === 0 && nearestFutureSlot && (
            <button
              type="button"
              onClick={() => handleJumpToSlotWeek(nearestFutureSlot)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-900 underline"
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

      {/* SIATKA TYGODNIOWA DESKTOP (>= 768px): 7 kolumn dni + oś 09:00–22:00 */}
      <div className="hidden md:block overflow-x-auto">
        <div className="min-w-[780px]">
          {/* Nagłówki dni tygodnia */}
          <div className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))] border-b border-slate-200 bg-white sticky top-0 z-20">
            <div className="py-2.5 px-2 text-[11px] font-semibold text-slate-400 text-right border-r border-slate-200">
              Godz.
            </div>
            {weekDays.map((day) => {
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
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
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

          {/* Główna siatka 09:00 – 22:00 */}
          <div className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))] pb-4">
            {/* Lewa kolumna godzin */}
            <div
              className="relative border-r border-slate-200 bg-slate-50/40"
              style={{ height: `${TOTAL_HOURS * HOUR_HEIGHT}px` }}
            >
              {hoursAxis.map((hour, idx) => (
                <div
                  key={hour}
                  className="absolute right-2 -translate-y-2 text-[11px] font-mono font-medium text-slate-500"
                  style={{ top: `${idx * HOUR_HEIGHT}px` }}
                >
                  {String(hour).padStart(2, '0')}:00
                </div>
              ))}
            </div>

            {/* 7 kolumn dni tygodnia */}
            {weekDays.map((day) => {
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
      </div>

      {/* WIDOK OSI CZASU NA MOBILE (< 768px): Pasek 7 dni tygodnia + oś wybranego dnia */}
      <div className="md:hidden">
        <div className="grid grid-cols-7 gap-1 p-2 border-b border-slate-200 bg-white">
          {weekDays.map((day) => {
            const isPicked = day.idx === activeMobileDay.idx;
            const hasShifts = (slotsByDateKey.get(day.dateKey) || []).length > 0;

            return (
              <button
                key={day.dateKey}
                type="button"
                onClick={() => setMobileDayIndex(day.idx)}
                className={`py-2 rounded-xl flex flex-col items-center justify-center transition-colors ${
                  isPicked
                    ? 'bg-emerald-600 text-white font-bold shadow-sm'
                    : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <span className="text-[10px] uppercase">{day.shortName}</span>
                <span className="text-sm font-bold leading-tight mt-0.5">{day.dayNumber}</span>
                <span
                  className={`mt-1 w-1.5 h-1.5 rounded-full ${
                    hasShifts
                      ? isPicked
                        ? 'bg-white'
                        : 'bg-emerald-500'
                      : 'bg-transparent'
                  }`}
                />
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-[54px_1fr] pb-4">
          <div
            className="relative border-r border-slate-200 bg-slate-50/50"
            style={{ height: `${TOTAL_HOURS * HOUR_HEIGHT}px` }}
          >
            {hoursAxis.map((hour, idx) => (
              <div
                key={hour}
                className="absolute right-1.5 -translate-y-2 text-[10px] font-mono font-medium text-slate-500"
                style={{ top: `${idx * HOUR_HEIGHT}px` }}
              >
                {String(hour).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          <div className="bg-white">{renderDayColumnEvents(activeMobileDay.dateKey)}</div>
        </div>
      </div>
    </section>
  );
}
