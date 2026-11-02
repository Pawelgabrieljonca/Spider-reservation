import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowUpDown,
  CalendarCheck,
  CalendarPlus,
  ChevronDown,
  Clock,
  Download,
  ExternalLink,
  Footprints,
  Info,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Search,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import Pagination from './Pagination';
import {
  BTN_DANGER,
  BTN_PRIMARY,
  BTN_SECONDARY,
  CARD_CLASS,
  INPUT_CLASS,
  SELECT_CLASS,
} from '../styles/ui';
import { formatTime24 } from '../utils/dateUtils';

const CANCEL_DEADLINE_MS = 12 * 60 * 60 * 1000;
const PAGE_SIZE = 6;
const RECEPTION_PHONE_LABEL = '519 699 795';
const RECEPTION_PHONE_HREF = 'tel:+48519699795';
const VENUE_NAME = 'Centrum Wspinaczkowe Spider';
const VENUE_ADDRESS = 'ul. Świecka 8, 85-048 Bydgoszcz';
const DIRECTIONS_URL =
  'https://www.google.com/maps/dir/?api=1&destination=' +
  encodeURIComponent(`${VENUE_NAME} ${VENUE_ADDRESS}`);

function reservationStatus(res, nowMs) {
  if (res.status === 'cancelled') return 'CANCELLED';
  const endMs = res.slot?.end_time ? new Date(res.slot.end_time).getTime() : 0;
  if (endMs && endMs < nowMs) return 'COMPLETED';
  return 'ACTIVE';
}

function startMsOf(res) {
  return res.slot?.start_time ? new Date(res.slot.start_time).getTime() : 0;
}

function typeLabel(res) {
  const slot = res.slot || {};
  if (slot.slot_type === 'GROUP_1_5H') {
    const max = slot.max_capacity || 3;
    const occ = res.slot_occupancy;
    return {
      title: 'Sekcja grupowa 1,5 h',
      detail: typeof occ === 'number' ? `Zapełnienie ${occ}/${max} os.` : `max ${max} os.`,
      group: true,
    };
  }
  return { title: 'Trening indywidualny 1 h', detail: '1 os.', group: false };
}

function relativeBadge(res, nowMs) {
  const start = startMsOf(res);
  const end = res.slot?.end_time ? new Date(res.slot.end_time).getTime() : start;
  if (start <= nowMs && end >= nowMs) {
    return { label: 'Trwa teraz', cls: 'bg-emerald-600 text-white border-emerald-600' };
  }
  const startDay = new Date(start);
  startDay.setHours(0, 0, 0, 0);
  const today = new Date(nowMs);
  today.setHours(0, 0, 0, 0);
  const days = Math.round((startDay.getTime() - today.getTime()) / 86400000);
  if (days === 0) {
    const hours = Math.max(1, Math.round((start - nowMs) / 3600000));
    return {
      label: start - nowMs < 3600000 * 2 ? 'Dzisiaj · wkrótce' : `Dzisiaj · za ${hours} h`,
      cls: 'bg-amber-100 text-amber-900 border-amber-300',
    };
  }
  if (days === 1) return { label: 'Jutro', cls: 'bg-sky-100 text-sky-900 border-sky-300' };
  return { label: `Za ${days} dni`, cls: 'bg-slate-100 text-slate-700 border-slate-300' };
}

function formatDeadline(startMs) {
  const d = new Date(startMs - CANCEL_DEADLINE_MS);
  const weekday = d.toLocaleDateString('pl-PL', { weekday: 'short' });
  const dm = d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' });
  const hm = d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${weekday}, ${dm}, godz. ${hm}`;
}

function toIcsStamp(ms) {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function buildCalendarTitle(res) {
  return `Trening wspinaczkowy – ${res.slot?.instructor_name || 'CW Spider'}`;
}

function buildCalendarDescription(res) {
  const t = typeLabel(res);
  return `${t.title}. Instruktor: ${res.slot?.instructor_name || '—'}. Sprzęt: ${
    res.needs_equipment ? 'wypożyczenie (buty + uprząż)' : 'własny'
  }. Rezerwacja #${res.id}.`;
}

function downloadIcs(res) {
  const start = startMsOf(res);
  const end = new Date(res.slot.end_time).getTime();
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CW Spider//Rezerwacje//PL',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:reservation-${res.id}@cw-spider`,
    `DTSTAMP:${toIcsStamp(Date.now())}`,
    `DTSTART:${toIcsStamp(start)}`,
    `DTEND:${toIcsStamp(end)}`,
    `SUMMARY:${buildCalendarTitle(res)}`,
    `DESCRIPTION:${buildCalendarDescription(res)}`,
    `LOCATION:${VENUE_NAME}\\, ${VENUE_ADDRESS.replace(',', '\\,')}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT2H',
    'ACTION:DISPLAY',
    'DESCRIPTION:Trening za 2 godziny',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `trening-spider-${res.id}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function googleCalendarUrl(res) {
  const start = toIcsStamp(startMsOf(res));
  const end = toIcsStamp(new Date(res.slot.end_time).getTime());
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: buildCalendarTitle(res),
    dates: `${start}/${end}`,
    details: buildCalendarDescription(res),
    location: `${VENUE_NAME}, ${VENUE_ADDRESS}`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function DateBlock({ startIso, muted }) {
  const d = new Date(startIso);
  const weekday = d.toLocaleDateString('pl-PL', { weekday: 'short' }).replace('.', '');
  const month = d.toLocaleDateString('pl-PL', { month: 'short' }).replace('.', '');
  return (
    <div
      className={`w-[84px] shrink-0 rounded-xl flex flex-col items-center justify-center py-3 text-center ${
        muted ? 'bg-slate-100 text-slate-600' : 'bg-slate-900 text-white'
      }`}
    >
      <span className="text-xs font-semibold uppercase tracking-wider opacity-80">{weekday}</span>
      <span className="text-3xl font-extrabold leading-none my-0.5">{d.getDate()}</span>
      <span className="text-xs uppercase tracking-wider opacity-80">{month}</span>
      <span
        className={`mt-1.5 text-sm font-bold px-2 py-0.5 rounded-md ${
          muted ? 'bg-white text-slate-700' : 'bg-emerald-500 text-white'
        }`}
      >
        {formatTime24(startIso)}
      </span>
    </div>
  );
}

function EquipmentLine({ needsEquipment }) {
  if (!needsEquipment) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-slate-600">
        <Footprints className="w-4 h-4 text-slate-400" />
        Własny sprzęt
      </span>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-sm">
      <Footprints className="w-4 h-4 text-amber-600" />
      <span className="font-semibold text-amber-900 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-md text-xs">
        Buty
      </span>
      <span className="text-slate-400 text-xs">+</span>
      <span className="font-semibold text-amber-900 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-md text-xs">
        Uprząż
      </span>
    </span>
  );
}

function CalendarMenu({ res }) {
  return (
    <details className="relative group">
      <summary
        className={`${BTN_SECONDARY} list-none cursor-pointer select-none [&::-webkit-details-marker]:hidden`}
      >
        <CalendarPlus className="w-4 h-4 text-emerald-600" />
        <span>Dodaj do kalendarza</span>
        <ChevronDown className="w-4 h-4 text-slate-400 group-open:rotate-180 transition-transform" />
      </summary>
      <div className="absolute z-20 left-0 mt-1.5 w-60 bg-white border border-slate-200 rounded-xl shadow-lg p-1.5">
        <a
          href={googleCalendarUrl(res)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-slate-800 hover:bg-slate-50"
        >
          <ExternalLink className="w-4 h-4 text-slate-500" />
          Kalendarz Google
        </a>
        <button
          type="button"
          onClick={(e) => {
            downloadIcs(res);
            e.currentTarget.closest('details')?.removeAttribute('open');
          }}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-slate-800 hover:bg-slate-50 text-left"
        >
          <Download className="w-4 h-4 text-slate-500" />
          Pobierz plik .ics (Apple, Outlook)
        </button>
      </div>
    </details>
  );
}

function ModalShell({ title, onClose, children, labelId }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelId}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xl max-w-md w-full p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <h2 id={labelId} className="text-xl font-extrabold text-slate-900">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zamknij"
            className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ReservationSummary({ res }) {
  const start = res.slot?.start_time;
  const d = new Date(start);
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-sm space-y-1">
      <div className="font-bold text-slate-900 capitalize">
        {d.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })}
      </div>
      <div className="text-slate-700">
        {formatTime24(start)} – {formatTime24(res.slot?.end_time)} · {res.slot?.instructor_name}
      </div>
    </div>
  );
}

function CancelModal({ res, busy, onConfirm, onClose }) {
  return (
    <ModalShell title="Odwołać wizytę?" onClose={onClose} labelId="cancel-title">
      <ReservationSummary res={res} />
      <p className="text-sm text-slate-600 leading-relaxed">
        Po odwołaniu zwolniony termin wróci do ogólnego grafiku i będzie mógł go zarezerwować
        inny klient. Tej operacji nie można cofnąć.
      </p>
      <div className="flex flex-col-reverse sm:flex-row gap-2.5">
        <button type="button" onClick={onClose} disabled={busy} className={`${BTN_SECONDARY} flex-1`}>
          Zostaw rezerwację
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 text-sm font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 flex-1"
        >
          {busy ? 'Odwoływanie…' : 'Tak, odwołaj wizytę'}
        </button>
      </div>
    </ModalShell>
  );
}

function EquipmentModal({ res, busy, onSave, onClose }) {
  const [value, setValue] = useState(Boolean(res.needs_equipment));
  const option = (val, title, desc) => (
    <label
      className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-colors ${
        value === val
          ? 'border-emerald-500 bg-emerald-50'
          : 'border-slate-200 hover:bg-slate-50'
      }`}
    >
      <input
        type="radio"
        name="equipment"
        checked={value === val}
        onChange={() => setValue(val)}
        className="mt-1 accent-emerald-600"
      />
      <span>
        <span className="block font-semibold text-slate-900 text-sm">{title}</span>
        <span className="block text-xs text-slate-600 mt-0.5">{desc}</span>
      </span>
    </label>
  );
  return (
    <ModalShell title="Sprzęt na trening" onClose={onClose} labelId="equipment-title">
      <ReservationSummary res={res} />
      <div className="space-y-2.5">
        {option(false, 'Własny sprzęt', 'Przychodzę z własnymi butami i uprzężą.')}
        {option(true, 'Wypożyczenie: Buty + Uprząż', 'Komplet będzie przygotowany przed zajęciami.')}
      </div>
      <div className="flex flex-col-reverse sm:flex-row gap-2.5">
        <button type="button" onClick={onClose} disabled={busy} className={`${BTN_SECONDARY} flex-1`}>
          Anuluj
        </button>
        <button
          type="button"
          onClick={() => onSave(value)}
          disabled={busy || value === Boolean(res.needs_equipment)}
          className={`${BTN_PRIMARY} flex-1`}
        >
          {busy ? 'Zapisywanie…' : 'Zapisz zmianę'}
        </button>
      </div>
    </ModalShell>
  );
}

function UpcomingCard({ res, nowMs, Avatar, onCancel, onEditEquipment }) {
  const startMs = startMsOf(res);
  const type = typeLabel(res);
  const badge = relativeBadge(res, nowMs);
  const cancellable = Boolean(res.can_cancel) && startMs - nowMs >= CANCEL_DEADLINE_MS;

  return (
    <article className={`${CARD_CLASS} p-4 sm:p-5`}>
      <div className="flex gap-4">
        <DateBlock startIso={res.slot.start_time} />

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <Avatar name={res.slot?.instructor_name} sizeClass="w-11 h-11" />
              <div className="min-w-0">
                <div className="font-bold text-slate-900 truncate">
                  {res.slot?.instructor_name || '—'}
                </div>
                <div className="text-sm text-slate-600 flex flex-wrap items-center gap-x-2">
                  <span className="inline-flex items-center gap-1">
                    {type.group && <Users className="w-3.5 h-3.5 text-slate-400" />}
                    {type.title}
                  </span>
                  <span className="text-slate-300">•</span>
                  <span>{type.detail}</span>
                </div>
              </div>
            </div>
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${badge.cls}`}
            >
              {badge.label}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="inline-flex items-center gap-1.5 text-sm text-slate-700">
              <Clock className="w-4 h-4 text-slate-400" />
              {formatTime24(res.slot.start_time)} – {formatTime24(res.slot.end_time)}
            </span>
            <EquipmentLine needsEquipment={res.needs_equipment} />
            <button
              type="button"
              onClick={() => onEditEquipment(res)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-900"
            >
              <Pencil className="w-3.5 h-3.5" />
              Zmień sprzęt
            </button>
          </div>

          <div
            className={`flex items-start gap-2 text-sm rounded-lg px-3 py-2 ${
              cancellable ? 'bg-sky-50 text-sky-900' : 'bg-amber-50 text-amber-900'
            }`}
          >
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            {cancellable ? (
              <span>
                Możliwość bezpłatnego odwołania do: <strong>{formatDeadline(startMs)}</strong>
              </span>
            ) : (
              <span>
                Do treningu zostało mniej niż 12 h – odwołanie online jest zablokowane. Zadzwoń do
                recepcji:{' '}
                <a href={RECEPTION_PHONE_HREF} className="font-semibold underline">
                  {RECEPTION_PHONE_LABEL}
                </a>
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <CalendarMenu res={res} />
            <a
              href={DIRECTIONS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={BTN_SECONDARY}
            >
              <MapPin className="w-4 h-4 text-emerald-600" />
              <span>Jak dojechać</span>
            </a>
            <button
              type="button"
              onClick={() => onCancel(res)}
              disabled={!cancellable}
              title={
                cancellable
                  ? 'Odwołaj wizytę'
                  : `Mniej niż 12 h do startu – skontaktuj się z recepcją: ${RECEPTION_PHONE_LABEL}`
              }
              className={`${BTN_DANGER} sm:ml-auto`}
            >
              Odwołaj wizytę
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function HistoryCard({ res, status, Avatar }) {
  const type = typeLabel(res);
  const completed = status === 'COMPLETED';
  return (
    <article className={`${CARD_CLASS} p-4 sm:p-5 ${completed ? '' : 'opacity-90'}`}>
      <div className="flex gap-4">
        <DateBlock startIso={res.slot.start_time} muted />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <Avatar name={res.slot?.instructor_name} sizeClass="w-11 h-11" />
              <div className="min-w-0">
                <div className="font-bold text-slate-900 truncate">
                  {res.slot?.instructor_name || '—'}
                </div>
                <div className="text-sm text-slate-600">
                  {type.title} · {formatTime24(res.slot.start_time)}–{formatTime24(res.slot.end_time)}
                </div>
              </div>
            </div>
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${
                completed
                  ? 'bg-slate-100 text-slate-700 border-slate-300'
                  : 'bg-red-100 text-red-900 border-red-200'
              }`}
            >
              {completed ? 'Zakończona' : 'Anulowana'}
            </span>
          </div>

          {completed ? (
            <Link
              to={`/app/client/progress?q=${encodeURIComponent(res.slot?.instructor_name || '')}`}
              className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 hover:text-emerald-900"
            >
              <TrendingUp className="w-4 h-4" />
              Zobacz notatki instruktora i zaliczone drogi z tych zajęć →
            </Link>
          ) : (
            <p className="text-sm text-slate-500">Rezerwacja została odwołana.</p>
          )}
        </div>
      </div>
    </article>
  );
}

function EmptyUpcoming() {
  return (
    <div className={`${CARD_CLASS} px-6 py-14 text-center space-y-4`}>
      <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
        <CalendarCheck className="w-8 h-8" />
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-slate-900">Nie masz jeszcze zaplanowanych treningów</h2>
        <p className="text-sm text-slate-600 max-w-sm mx-auto">
          Wybierz instruktora i dogodny termin – rezerwacja zajmuje mniej niż minutę.
        </p>
      </div>
      <Link to="/app/client" className={BTN_PRIMARY}>
        <Plus className="w-4 h-4" />
        <span>Zarezerwuj trening</span>
      </Link>
    </div>
  );
}

export default function ClientReservationsView({
  reservations,
  loading,
  nowMs,
  Avatar,
  onCancel,
  onUpdateEquipment,
}) {
  const [tab, setTab] = useState('upcoming');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [sortOrder, setSortOrder] = useState('desc');
  const [cancelTarget, setCancelTarget] = useState(null);
  const [equipmentTarget, setEquipmentTarget] = useState(null);
  const [busy, setBusy] = useState(false);

  const upcoming = useMemo(
    () =>
      reservations
        .filter((r) => r.slot && reservationStatus(r, nowMs) === 'ACTIVE')
        .sort((a, b) => startMsOf(a) - startMsOf(b)),
    [reservations, nowMs]
  );

  const history = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reservations
      .filter((r) => r.slot && reservationStatus(r, nowMs) !== 'ACTIVE')
      .filter((r) => {
        if (statusFilter !== 'ALL' && reservationStatus(r, nowMs) !== statusFilter) return false;
        if (typeFilter !== 'ALL' && r.slot.slot_type !== typeFilter) return false;
        if (q && !(r.slot.instructor_name || '').toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => (sortOrder === 'asc' ? 1 : -1) * (startMsOf(a) - startMsOf(b)));
  }, [reservations, nowMs, search, statusFilter, typeFilter, sortOrder]);

  const historyTotal = useMemo(
    () => reservations.filter((r) => r.slot && reservationStatus(r, nowMs) !== 'ACTIVE').length,
    [reservations, nowMs]
  );

  const list = tab === 'upcoming' ? upcoming : history;
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visible = list.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const switchTab = (next) => {
    setTab(next);
    setPage(1);
  };

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    setBusy(true);
    try {
      await onCancel(cancelTarget.id);
    } finally {
      setBusy(false);
      setCancelTarget(null);
    }
  };

  const saveEquipment = async (value) => {
    if (!equipmentTarget) return;
    setBusy(true);
    try {
      await onUpdateEquipment(equipmentTarget.id, value);
    } finally {
      setBusy(false);
      setEquipmentTarget(null);
    }
  };

  const tabBtn = (id, label, count) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === id}
      onClick={() => switchTab(id)}
      className={`px-4 sm:px-5 min-h-[44px] text-sm sm:text-base font-semibold border-b-2 -mb-px transition-colors ${
        tab === id
          ? 'border-emerald-600 text-emerald-700'
          : 'border-transparent text-slate-500 hover:text-slate-800'
      }`}
    >
      {label}
      <span
        className={`ml-2 inline-flex min-w-[22px] justify-center px-1.5 py-0.5 rounded-full text-xs font-bold ${
          tab === id ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
        }`}
      >
        {count}
      </span>
    </button>
  );

  return (
    <div className="space-y-5">
      <div role="tablist" className="flex border-b border-slate-200">
        {tabBtn('upcoming', 'Nadchodzące', upcoming.length)}
        {tabBtn('history', 'Historia', historyTotal)}
      </div>

      {tab === 'history' && historyTotal > 0 && (
        <section className={`${CARD_CLASS} p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3`}>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              aria-label="Szukaj instruktora"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Instruktor…"
              className={`${INPUT_CLASS} pl-10`}
            />
          </div>
          <select
            aria-label="Status"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className={SELECT_CLASS}
          >
            <option value="ALL">Zakończone i anulowane</option>
            <option value="COMPLETED">Tylko zakończone</option>
            <option value="CANCELLED">Tylko anulowane</option>
          </select>
          <select
            aria-label="Typ zajęć"
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
            className={SELECT_CLASS}
          >
            <option value="ALL">Wszystkie typy</option>
            <option value="INDIVIDUAL_1H">Indywidualne 1 h</option>
            <option value="GROUP_1_5H">Grupowe 1,5 h</option>
          </select>
          <div className="relative">
            <ArrowUpDown className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              aria-label="Sortowanie"
              value={sortOrder}
              onChange={(e) => {
                setSortOrder(e.target.value);
                setPage(1);
              }}
              className={`${SELECT_CLASS} pl-10`}
            >
              <option value="desc">Od najnowszych</option>
              <option value="asc">Od najstarszych</option>
            </select>
          </div>
        </section>
      )}

      {loading && reservations.length === 0 ? (
        <div className={`${CARD_CLASS} p-10 text-center text-slate-500 text-sm`}>
          Wczytywanie rezerwacji…
        </div>
      ) : list.length === 0 ? (
        tab === 'upcoming' ? (
          <EmptyUpcoming />
        ) : (
          <div className={`${CARD_CLASS} p-10 text-center space-y-2`}>
            <AlertCircle className="w-7 h-7 text-slate-300 mx-auto" />
            <p className="text-slate-700 font-semibold">
              {historyTotal === 0
                ? 'Historia jest jeszcze pusta'
                : 'Brak wyników dla wybranych filtrów'}
            </p>
            {historyTotal === 0 && (
              <p className="text-sm text-slate-500">
                Odbyte i anulowane treningi pojawią się tutaj.
              </p>
            )}
          </div>
        )
      ) : (
        <div className="space-y-3.5">
          {visible.map((res) =>
            tab === 'upcoming' ? (
              <UpcomingCard
                key={res.id}
                res={res}
                nowMs={nowMs}
                Avatar={Avatar}
                onCancel={setCancelTarget}
                onEditEquipment={setEquipmentTarget}
              />
            ) : (
              <HistoryCard
                key={res.id}
                res={res}
                status={reservationStatus(res, nowMs)}
                Avatar={Avatar}
              />
            )
          )}
        </div>
      )}

      {list.length > PAGE_SIZE && (
        <Pagination
          totalItems={list.length}
          pageSize={PAGE_SIZE}
          currentPage={safePage}
          onPageChange={setPage}
        />
      )}

      <p className="flex items-center gap-1.5 text-xs text-slate-500">
        <Phone className="w-3.5 h-3.5" />
        Pilna zmiana lub odwołanie wizyty w mniej niż 12 h przed startem – tylko przez recepcję:{' '}
        <a href={RECEPTION_PHONE_HREF} className="font-semibold text-slate-700 underline">
          {RECEPTION_PHONE_LABEL}
        </a>
      </p>

      {cancelTarget && (
        <CancelModal
          res={cancelTarget}
          busy={busy}
          onConfirm={confirmCancel}
          onClose={() => !busy && setCancelTarget(null)}
        />
      )}
      {equipmentTarget && (
        <EquipmentModal
          res={equipmentTarget}
          busy={busy}
          onSave={saveEquipment}
          onClose={() => !busy && setEquipmentTarget(null)}
        />
      )}
    </div>
  );
}

