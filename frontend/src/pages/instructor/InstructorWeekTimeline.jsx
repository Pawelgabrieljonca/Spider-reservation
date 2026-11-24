import { useMemo, useState } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Footprints, Lock, Plus, UserCheck } from 'lucide-react';
import { addDays, formatDurationMinutes, formatTime24, toLocalDateInputValue } from '../../core/dateUtils';
import { CARD_CLASS } from '../../ui/common';

const START_HOUR = 9;
const END_HOUR = 22;
const TOTAL_HOURS = END_HOUR - START_HOUR;
const HOUR_HEIGHT = 48;
const SHORT_WEEKDAYS = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Ndz'];
const VIEW_MODES = [
  { id: '1day', short: '1 d.', full: '1 dzień', step: 1 },
  { id: '3days', short: '3 d.', full: '3 dni', step: 3 },
  { id: 'week', short: 'Tydz.', full: 'Tydzień', step: 7 },
];

const makeDay = (d) => {
  const idx = (d.getDay() + 6) % 7;
  return {
    idx,
    shortName: SHORT_WEEKDAYS[idx],
    dayNumber: d.getDate(),
    monthShort: d.toLocaleDateString('pl-PL', { month: '2-digit' }),
    dateObj: d,
    dateKey: toLocalDateInputValue(d),
  };
};

function formatDateRangeLabel(first, last) {
  if (first.toDateString() === last.toDateString()) {
    return first.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
  const sameYear = first.getFullYear() === last.getFullYear();
  if (sameYear && first.getMonth() === last.getMonth()) {
    return `${first.getDate()} – ${last.getDate()} ${last.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' })}`;
  }
  const startPart = first.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
  const endPart = last.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${startPart} – ${endPart}`;
}

function computeVerticalPosition(startIso, endIso) {
  const toMin = (iso) => {
    const d = new Date(iso);
    return d.getHours() * 60 + d.getMinutes();
  };
  const startMin = Math.max(START_HOUR * 60, toMin(startIso));
  const endMin = Math.min(END_HOUR * 60, toMin(endIso));
  return {
    topPx: ((startMin - START_HOUR * 60) / 60) * HOUR_HEIGHT,
    heightPx: (Math.max(25, endMin - startMin) / 60) * HOUR_HEIGHT,
  };
}

function computeFreeSegments(slot, sessions) {
  const winStart = new Date(slot.start_time).getTime();
  const winEnd = new Date(slot.end_time).getTime();
  const busy = sessions
    .map((bs) => [Math.max(winStart, new Date(bs.start_time).getTime()), Math.min(winEnd, new Date(bs.end_time).getTime())])
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);

  const free = [];
  let cursor = winStart;
  for (const [s, e] of busy) {
    if (s > cursor) free.push({ start: cursor, end: s });
    cursor = Math.max(cursor, e);
  }
  if (cursor < winEnd) free.push({ start: cursor, end: winEnd });
  return free.filter((seg) => seg.end - seg.start >= 30 * 60000);
}

export default function InstructorWeekTimeline({
  slots,
  nowMs,
  anchorDate: controlledAnchorDate,
  onAnchorDateChange,
  selectedSlotId,
  onSelectSlot,
  onRequestCreate,
  highlightFilter = null,
}) {
  const baseNowDate = useMemo(() => new Date(nowMs), [nowMs]);
  const todayDateKey = useMemo(() => toLocalDateInputValue(baseNowDate), [baseNowDate]);
  const [viewMode, setViewMode] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 768 ? '1day' : '3days'));
  const [internalAnchorDate, setInternalAnchorDate] = useState(() => new Date(baseNowDate.getFullYear(), baseNowDate.getMonth(), baseNowDate.getDate()));
  const anchorDate = controlledAnchorDate ?? internalAnchorDate;
  const setAnchorDate = (updater) => {
    const next = typeof updater === 'function' ? updater(anchorDate) : updater;
    if (onAnchorDateChange) onAnchorDateChange(next);
    else setInternalAnchorDate(next);
  };

  const displayedDays = useMemo(() => {
    if (viewMode === '1day') return [makeDay(anchorDate)];
    if (viewMode === '3days') return Array.from({ length: 3 }, (_, i) => makeDay(addDays(anchorDate, i)));
    const monday = addDays(anchorDate, -((anchorDate.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => makeDay(addDays(monday, i)));
  }, [anchorDate, viewMode]);

  const slotsByDateKey = useMemo(() => {
    const map = new Map();
    for (const slot of slots) {
      const key = toLocalDateInputValue(new Date(slot.start_time));
      const arr = map.get(key) || [];
      arr.push(slot);
      map.set(key, arr);
    }
    for (const arr of map.values()) arr.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
    return map;
  }, [slots]);

  const periodSummary = useMemo(() => {
    let shiftCount = 0;
    let shiftMinutes = 0;
    let activeBookings = 0;
    for (const day of displayedDays) {
      for (const s of slotsByDateKey.get(day.dateKey) || []) {
        if (!s.is_blocked) {
          shiftCount += 1;
          shiftMinutes += Number(s.duration_minutes) || 0;
        }
        activeBookings += Number(s.confirmed_reservations_count) || 0;
      }
    }
    return { shiftCount, shiftMinutes, activeBookings };
  }, [displayedDays, slotsByDateKey]);

  const nearestFutureSlot = useMemo(
    () => slots.filter((s) => new Date(s.end_time).getTime() >= nowMs).sort((a, b) => new Date(a.start_time) - new Date(b.start_time))[0] || null,
    [slots, nowMs]
  );

  const shiftAnchor = (dir) => {
    const step = VIEW_MODES.find((m) => m.id === viewMode)?.step || 7;
    setAnchorDate((prev) => addDays(prev, dir * step));
  };

  const handleToday = () => setAnchorDate(new Date(baseNowDate.getFullYear(), baseNowDate.getMonth(), baseNowDate.getDate()));
  const hoursAxis = useMemo(() => Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => START_HOUR + i), []);
  const nowMin = baseNowDate.getHours() * 60 + baseNowDate.getMinutes();
  const showNowIndicator = nowMin >= START_HOUR * 60 && nowMin <= END_HOUR * 60;
  const nowTopPx = ((nowMin - START_HOUR * 60) / 60) * HOUR_HEIGHT;
  const todayIsDisplayed = displayedDays.some((d) => d.dateKey === todayDateKey);
  const currentTimeLabel = baseNowDate.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', hour12: false });
  const rangeLabel = formatDateRangeLabel(displayedDays[0].dateObj, displayedDays[displayedDays.length - 1].dateObj);

  const gridColsClass =
    viewMode === '1day'
      ? 'grid-cols-[56px_1fr]'
      : viewMode === '3days'
        ? 'grid-cols-[56px_repeat(3,minmax(0,1fr))]'
        : 'grid-cols-[56px_repeat(7,minmax(0,1fr))] min-w-[760px]';

  const renderDayColumnEvents = (day) => {
    const daySlots = slotsByDateKey.get(day.dateKey) || [];
    const isToday = day.dateKey === todayDateKey;

    return (
      <div className="relative w-full select-none" style={{ height: `${TOTAL_HOURS * HOUR_HEIGHT}px` }}>
        {hoursAxis.slice(0, TOTAL_HOURS).map((hour, idx) => (
          <div
            key={hour}
            onClick={() => onRequestCreate?.({ dayDate: day.dateObj, hour })}
            title={`Kliknij, aby dodać dyżur o ${String(hour).padStart(2, '0')}:00`}
            className="absolute inset-x-0 group cursor-pointer hover:bg-emerald-50/60 transition-colors"
            style={{ top: `${idx * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}
          >
            <div className="border-t border-dashed border-slate-100 group-hover:border-emerald-200 w-full" style={{ marginTop: `${HOUR_HEIGHT / 2}px` }} />
            <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute right-1.5 top-1 z-10 flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-emerald-100 border border-emerald-300 px-1.5 py-0.5 rounded shadow-sm pointer-events-none">
              <Plus className="w-3 h-3 text-emerald-600" />
              <span>Dodaj {String(hour).padStart(2, '0')}:00</span>
            </div>
          </div>
        ))}

        <div className="absolute inset-x-0 border-t border-slate-200 pointer-events-none" style={{ top: `${TOTAL_HOURS * HOUR_HEIGHT}px` }} />

        {isToday && showNowIndicator && (
          <div className="absolute inset-x-0 z-20 flex items-center pointer-events-none" style={{ top: `${nowTopPx}px`, transform: 'translateY(-50%)' }}>
            <span className="w-2.5 h-2.5 rounded-full bg-rose-600 -ml-1 shrink-0 shadow-sm" />
            <div className="h-[2px] bg-rose-600 flex-1 shadow-sm" />
            <span className="bg-rose-600 text-white font-mono text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm mr-1">Teraz</span>
          </div>
        )}

        {daySlots.map((slot) => {
          const { topPx, heightPx } = computeVerticalPosition(slot.start_time, slot.end_time);
          const isPast = new Date(slot.end_time).getTime() < nowMs;
          const isSelected = selectedSlotId === slot.id;
          const activeSessions = (slot.booked_sessions || []).filter((bs) => (bs.confirmed_reservations_count || 0) > 0);
          const hasBookings = activeSessions.length > 0;
          const freeSegments = slot.is_blocked ? [] : computeFreeSegments(slot, activeSessions);

          const dimmed =
            (highlightFilter === 'booked' && !hasBookings) ||
            (highlightFilter === 'upcoming' && (slot.is_blocked || isPast)) ||
            (highlightFilter === 'completed' && !isPast);

          const windowStyle = slot.is_blocked
            ? 'bg-amber-50/90 border-dashed border-amber-400 text-amber-950 hover:border-amber-600'
            : isPast
              ? 'bg-slate-100/90 border-slate-300 text-slate-600 hover:border-slate-400'
              : hasBookings
                ? 'bg-white/40 border-emerald-500 text-emerald-950 hover:border-emerald-700'
                : 'bg-emerald-50/85 border-emerald-400 text-emerald-950 hover:border-emerald-600';

          return (
            <div key={slot.id} className={`transition-opacity ${dimmed ? 'opacity-25' : ''}`}>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onSelectSlot(isSelected ? null : slot.id); }}
                title={`Dyżur ${formatTime24(slot.start_time)}–${formatTime24(slot.end_time)} (kliknij, aby zarządzać)`}
                style={{ top: `${topPx + 1}px`, height: `${Math.max(heightPx - 2, 24)}px` }}
                className={`absolute inset-x-1 rounded-lg border-2 px-2 py-1 text-left transition-all overflow-hidden focus:outline-none ${windowStyle} ${isSelected ? 'ring-2 ring-slate-900 shadow-md z-10' : 'z-[5]'}`}
              >
                {!hasBookings && (
                  <>
                    <div className="flex items-center justify-between gap-1 text-[11px] leading-tight font-bold">
                      <span className="truncate">{formatTime24(slot.start_time)} – {formatTime24(slot.end_time)}</span>
                      {slot.is_blocked && <Lock className="w-3.5 h-3.5 text-amber-700 shrink-0" />}
                    </div>
                    <div className="text-[10px] leading-tight opacity-80 truncate mt-0.5">
                      {slot.is_blocked ? 'Zablokowany dla zapisów' : `Wolny dyżur (${formatDurationMinutes(slot.duration_minutes)})`}
                    </div>
                  </>
                )}
              </button>

              {freeSegments.map((seg) => {
                const startIso = new Date(seg.start).toISOString();
                const endIso = new Date(seg.end).toISOString();
                const pos = computeVerticalPosition(startIso, endIso);
                return (
                  <div
                    key={`free-${seg.start}`}
                    aria-hidden="true"
                    style={{ top: `${pos.topPx + 2}px`, height: `${Math.max(pos.heightPx - 4, 20)}px` }}
                    className={`absolute left-2 right-1.5 z-[6] pointer-events-none rounded-md border border-dashed px-1.5 py-0.5 overflow-hidden text-[10px] leading-tight font-semibold ${isPast ? 'border-slate-300 bg-slate-50 text-slate-500' : 'border-emerald-400 bg-emerald-50 text-emerald-800'}`}
                  >
                    <span className="font-mono">{formatTime24(startIso)}–{formatTime24(endIso)}</span>{' '}
                    <span className="font-bold">Wolne</span>
                    {pos.heightPx >= 40 && (
                      <span className="block font-normal opacity-80">{formatDurationMinutes(Math.round((seg.end - seg.start) / 60000))} do zarezerwowania</span>
                    )}
                  </div>
                );
              })}

              {activeSessions.map((bs) => {
                const pos = computeVerticalPosition(bs.start_time, bs.end_time);
                const confirmedRes = (bs.reservations || []).filter((r) => r.status === 'confirmed');
                const clientNames = confirmedRes.map((r) => r.client_name || `#${r.client_id}`).join(', ');
                const eqRes = confirmedRes.filter((r) => r.needs_equipment);
                const anyEquipment = eqRes.length > 0;
                const typeLabel = bs.slot_type === 'GROUP_1_5H' ? `Grupa ${bs.confirmed_reservations_count}/${bs.max_capacity}` : 'Indyw. 1h';
                const equipmentLabel = !anyEquipment
                  ? 'Własny sprzęt'
                  : confirmedRes.length === 1
                    ? eqRes[0].client_shoe_size ? `Wypożyczenie • but EU ${eqRes[0].client_shoe_size}` : 'Wypożyczenie sprzętu'
                    : `Wypożyczenie: ${eqRes.length} z ${confirmedRes.length} os.`;
                const roomForThirdLine = pos.heightPx >= 60;

                return (
                  <button
                    key={bs.id}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onSelectSlot(isSelected ? null : slot.id); }}
                    title={`${formatTime24(bs.start_time)}–${formatTime24(bs.end_time)} • ${typeLabel} • ${clientNames} • ${equipmentLabel}`}
                    style={{ top: `${pos.topPx + 2}px`, height: `${Math.max(pos.heightPx - 4, 28)}px` }}
                    className={`absolute left-2 right-1.5 z-10 rounded-lg p-1.5 text-left shadow-sm border transition-transform hover:scale-[1.01] overflow-hidden ${isPast ? 'bg-slate-700 text-white border-slate-800' : 'bg-emerald-700 text-white border-emerald-900/30'}`}
                  >
                    <div className="flex items-center justify-between gap-1 text-[10px] font-bold leading-tight">
                      <span className="font-mono truncate">{formatTime24(bs.start_time)} – {formatTime24(bs.end_time)}</span>
                      <span className="px-1 rounded bg-white/20 text-[9px] font-bold shrink-0">{typeLabel}</span>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] font-semibold leading-tight mt-0.5">
                      <UserCheck className="w-3 h-3 text-emerald-200 shrink-0" />
                      <span className="truncate flex-1">{clientNames}</span>
                      {anyEquipment && !roomForThirdLine && <Footprints className="w-3 h-3 text-amber-300 shrink-0" aria-label={equipmentLabel} />}
                    </div>
                    {roomForThirdLine && (
                      <div className={`mt-1 inline-flex max-w-full items-center gap-1 px-1.5 rounded text-[9px] font-bold leading-tight ${anyEquipment ? 'bg-amber-300 text-amber-950' : 'bg-white/15 text-white/90'}`}>
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

  return (
    <section className={`${CARD_CLASS} overflow-hidden shadow-sm`}>
      <div className="p-3 sm:p-4 border-b border-slate-200 bg-slate-50/80">
        <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
          <div className="inline-flex items-center gap-1 shrink-0 order-2 sm:order-1">
            <button type="button" onClick={() => shiftAnchor(-1)} aria-label="Wstecz" className="inline-flex items-center justify-center min-h-[38px] min-w-[38px] rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 shadow-sm">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button type="button" onClick={handleToday} className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-50 shadow-sm">
              Dzisiaj
            </button>
            <button type="button" onClick={() => shiftAnchor(1)} aria-label="Dalej" className="inline-flex items-center justify-center min-h-[38px] min-w-[38px] rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 shadow-sm">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="w-full sm:w-auto sm:flex-1 min-w-0 order-1 sm:order-2">
            <h2 className="text-sm sm:text-base font-extrabold text-slate-900 capitalize truncate">{rangeLabel}</h2>
            <p className="text-[11px] sm:text-xs text-slate-500 font-medium truncate mt-0.5">
              {periodSummary.shiftCount > 0 ? (
                <>
                  <span className="text-slate-800 font-semibold">{formatDurationMinutes(periodSummary.shiftMinutes)} dyżurów</span>
                  <span className="mx-1.5 text-slate-400">•</span>
                  <span className={periodSummary.activeBookings > 0 ? 'text-emerald-700 font-semibold' : 'text-slate-500'}>
                    {periodSummary.activeBookings} {periodSummary.activeBookings === 1 ? 'zapisany' : 'zapisanych'}
                  </span>
                </>
              ) : (
                <span className="text-slate-400">Brak zaplanowanych dyżurów w tym okresie</span>
              )}
            </p>
          </div>

          <div role="group" aria-label="Tryb widoku kalendarza" className="inline-flex bg-slate-200/90 p-0.5 sm:p-1 rounded-lg border border-slate-300/80 shadow-inner order-3">
            {VIEW_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setViewMode(m.id)}
                className={`min-h-[34px] px-2.5 sm:px-3 py-1 rounded-md text-xs sm:text-sm font-semibold transition-colors ${viewMode === m.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
              >
                <span className="sm:hidden">{m.short}</span>
                <span className="hidden sm:inline">{m.full}</span>
              </button>
            ))}
          </div>
        </div>

        {periodSummary.shiftCount === 0 && nearestFutureSlot && (
          <div className="pt-2 border-t border-slate-200/60 mt-2 text-xs">
            <button
              type="button"
              onClick={() => {
                const d = new Date(nearestFutureSlot.start_time);
                setAnchorDate(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
              }}
              className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 hover:text-emerald-900 underline"
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              <span>Skocz do najbliższego dyżuru ({new Date(nearestFutureSlot.start_time).toLocaleDateString('pl-PL')})</span>
            </button>
          </div>
        )}
      </div>

      <div className={viewMode === 'week' ? 'overflow-x-auto' : ''}>
        <div className={`grid ${gridColsClass} border-b border-slate-200 bg-white sticky top-0 z-20`}>
          <div className="py-2.5 px-2 text-[11px] font-semibold text-slate-400 text-right border-r border-slate-200">Godz.</div>
          {displayedDays.map((day) => {
            const isToday = day.dateKey === todayDateKey;
            const dayMins = (slotsByDateKey.get(day.dateKey) || []).reduce((acc, s) => acc + (s.is_blocked ? 0 : Number(s.duration_minutes) || 0), 0);
            return (
              <div key={day.dateKey} className={`py-2 px-2 text-center border-r last:border-r-0 border-slate-200 ${isToday ? 'bg-emerald-50/60' : ''}`}>
                <div className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-500">
                  {day.shortName}
                  {isToday && <span className="ml-1 text-[10px] text-emerald-700 font-semibold lowercase">(dziś)</span>}
                </div>
                <div className={`mt-0.5 inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-extrabold ${isToday ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-900'}`}>
                  {day.dayNumber}
                </div>
                <div className="text-[10px] text-slate-500 h-3.5">{dayMins > 0 ? formatDurationMinutes(dayMins) : '—'}</div>
              </div>
            );
          })}
        </div>

        <div className={`grid ${gridColsClass} pb-2 relative`}>
          <div className="relative border-r border-slate-200 bg-slate-50/40" style={{ height: `${TOTAL_HOURS * HOUR_HEIGHT}px` }}>
            {hoursAxis.map((hour, idx) => (
              <div key={hour} className="absolute right-2 -translate-y-2 text-[10px] sm:text-[11px] font-mono font-medium text-slate-500" style={{ top: `${idx * HOUR_HEIGHT}px` }}>
                {String(hour).padStart(2, '0')}:00
              </div>
            ))}
            {todayIsDisplayed && showNowIndicator && (
              <div className="absolute right-1 z-30 pointer-events-none" style={{ top: `${nowTopPx}px`, transform: 'translateY(-50%)' }}>
                <span className="bg-rose-600 text-white font-mono text-[9px] font-bold px-1 py-0.5 rounded shadow-sm">{currentTimeLabel}</span>
              </div>
            )}
          </div>

          {displayedDays.map((day) => (
            <div key={day.dateKey} className={`border-r last:border-r-0 border-slate-200 ${day.dateKey === todayDateKey ? 'bg-emerald-50/15' : 'bg-white'}`}>
              {renderDayColumnEvents(day)}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
