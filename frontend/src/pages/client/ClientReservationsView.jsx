import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowUpDown, CalendarCheck, CalendarPlus, ChevronDown, Clock, Download, ExternalLink, Footprints, Info, MapPin, Pencil, Phone, Plus, Search, TrendingUp, Users } from 'lucide-react';
import { SLOT_TYPE_META, formatTime24 } from '../../core/dateUtils';
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, CARD_CLASS, INPUT_CLASS, ModalShell, Pagination, SELECT_CLASS } from '../../ui/common';

const CANCEL_DEADLINE_MS = 12 * 60 * 60 * 1000;
const PAGE_SIZE = 6;
const RECEPTION_PHONE = '519 699 795';
const RECEPTION_HREF = 'tel:+48519699795';
const VENUE = 'Centrum Wspinaczkowe Spider, ul. Świecka 8, 85-048 Bydgoszcz';
const DIRECTIONS_URL = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(VENUE)}`;

const startMsOf = (r) => (r.slot?.start_time ? new Date(r.slot.start_time).getTime() : 0);
const resStatus = (r, nowMs) => (r.status === 'cancelled' ? 'CANCELLED' : (r.slot?.end_time && new Date(r.slot.end_time).getTime() < nowMs ? 'COMPLETED' : 'ACTIVE'));
const toIcsStamp = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

function typeLabel(res) {
  const s = res.slot || {};
  const meta = SLOT_TYPE_META[s.slot_type] || SLOT_TYPE_META.INDIVIDUAL_1H;
  if (meta.group) {
    const max = s.max_capacity || meta.maxCapacity;
    return { title: meta.reservationTitle, detail: typeof res.slot_occupancy === 'number' ? `Zapełnienie ${res.slot_occupancy}/${max} os.` : `max ${max} os.`, group: true };
  }
  return { title: meta.reservationTitle, detail: `${meta.maxCapacity} os.`, group: false };
}

function relativeBadge(res, nowMs) {
  const start = startMsOf(res);
  const end = res.slot?.end_time ? new Date(res.slot.end_time).getTime() : start;
  if (start <= nowMs && end >= nowMs) return { label: 'Trwa teraz', cls: 'bg-emerald-600 text-white border-emerald-600' };
  const sDay = new Date(start); sDay.setHours(0, 0, 0, 0);
  const tDay = new Date(nowMs); tDay.setHours(0, 0, 0, 0);
  const days = Math.round((sDay - tDay) / 86400000);
  if (days === 0) return { label: start - nowMs < 7200000 ? 'Dzisiaj · wkrótce' : `Dzisiaj · za ${Math.max(1, Math.round((start - nowMs) / 3600000))} h`, cls: 'bg-amber-100 text-amber-900 border-amber-300' };
  if (days === 1) return { label: 'Jutro', cls: 'bg-sky-100 text-sky-900 border-sky-300' };
  return { label: `Za ${days} dni`, cls: 'bg-slate-100 text-slate-700 border-slate-300' };
}

const formatDeadline = (startMs) => {
  const d = new Date(startMs - CANCEL_DEADLINE_MS);
  return `${d.toLocaleDateString('pl-PL', { weekday: 'short' })}, ${d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' })}, godz. ${d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
};

const calTitle = (r) => `Trening wspinaczkowy – ${r.slot?.instructor_name || 'CW Spider'}`;
const calDesc = (r) => `${typeLabel(r).title}. Instruktor: ${r.slot?.instructor_name || '—'}. Sprzęt: ${r.needs_equipment ? 'wypożyczenie (buty + uprząż)' : 'własny'}. Rezerwacja #${r.id}.`;

function downloadIcs(res) {
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CW Spider//Rezerwacje//PL', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:reservation-${res.id}@cw-spider`, `DTSTAMP:${toIcsStamp(Date.now())}`, `DTSTART:${toIcsStamp(startMsOf(res))}`,
    `DTEND:${toIcsStamp(new Date(res.slot.end_time).getTime())}`, `SUMMARY:${calTitle(res)}`, `DESCRIPTION:${calDesc(res)}`,
    `LOCATION:${VENUE.replace(/,/g, '\\,')}`, 'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', 'DESCRIPTION:Trening za 2 godziny', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `trening-spider-${res.id}.ics` });
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

const googleCalUrl = (res) => `https://calendar.google.com/calendar/render?${new URLSearchParams({
  action: 'TEMPLATE', text: calTitle(res), dates: `${toIcsStamp(startMsOf(res))}/${toIcsStamp(new Date(res.slot.end_time).getTime())}`, details: calDesc(res), location: VENUE,
})}`;

function DateBlock({ startIso, muted }) {
  const d = new Date(startIso);
  return (
    <div className={`w-[84px] shrink-0 rounded-xl flex flex-col items-center justify-center py-3 text-center ${muted ? 'bg-slate-100 text-slate-600' : 'bg-slate-900 text-white'}`}>
      <span className="text-xs font-semibold uppercase opacity-80">{d.toLocaleDateString('pl-PL', { weekday: 'short' }).replace('.', '')}</span>
      <span className="text-3xl font-extrabold leading-none my-0.5">{d.getDate()}</span>
      <span className="text-xs uppercase opacity-80">{d.toLocaleDateString('pl-PL', { month: 'short' }).replace('.', '')}</span>
      <span className={`mt-1.5 text-sm font-bold px-2 py-0.5 rounded-md ${muted ? 'bg-white text-slate-700' : 'bg-emerald-500 text-white'}`}>{formatTime24(startIso)}</span>
    </div>
  );
}

function ReservationSummary({ res }) {
  const s = res.slot?.start_time;
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-sm space-y-1">
      <div className="font-bold text-slate-900 capitalize">{new Date(s).toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      <div className="text-slate-700">{formatTime24(s)} – {formatTime24(res.slot?.end_time)} · {res.slot?.instructor_name}</div>
    </div>
  );
}

function EquipmentModal({ res, busy, onSave, onClose }) {
  const [value, setValue] = useState(Boolean(res.needs_equipment));
  return (
    <ModalShell title="Sprzęt na trening" onClose={onClose} maxWidth="max-w-md"
      footer={
        <div className="flex flex-col-reverse sm:flex-row gap-2.5">
          <button type="button" onClick={onClose} disabled={busy} className={`${BTN_SECONDARY} flex-1`}>Anuluj</button>
          <button type="button" onClick={() => onSave(value)} disabled={busy || value === Boolean(res.needs_equipment)} className={`${BTN_PRIMARY} flex-1`}>{busy ? 'Zapisywanie…' : 'Zapisz zmianę'}</button>
        </div>
      }
    >
      <ReservationSummary res={res} />
      <div className="space-y-2.5">
        {[[false, 'Własny sprzęt', 'Przychodzę z własnymi butami i uprzężą.'], [true, 'Wypożyczenie: Buty + Uprząż', 'Komplet będzie przygotowany przed zajęciami.']].map(([val, title, desc]) => (
          <label key={String(val)} className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer ${value === val ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:bg-slate-50'}`}>
            <input type="radio" name="equipment" checked={value === val} onChange={() => setValue(val)} className="mt-1 accent-emerald-600" />
            <span><span className="block font-semibold text-slate-900 text-sm">{title}</span><span className="block text-xs text-slate-600 mt-0.5">{desc}</span></span>
          </label>
        ))}
      </div>
    </ModalShell>
  );
}

export default function ClientReservationsView({ reservations, loading, nowMs, Avatar, onCancel, onUpdateEquipment }) {
  const [tab, setTab] = useState('upcoming');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [sortOrder, setSortOrder] = useState('desc');
  const [cancelTarget, setCancelTarget] = useState(null);
  const [equipmentTarget, setEquipmentTarget] = useState(null);
  const [busy, setBusy] = useState(false);

  const upcoming = useMemo(() => reservations.filter((r) => r.slot && resStatus(r, nowMs) === 'ACTIVE').sort((a, b) => startMsOf(a) - startMsOf(b)), [reservations, nowMs]);
  const allHistory = useMemo(() => reservations.filter((r) => r.slot && resStatus(r, nowMs) !== 'ACTIVE'), [reservations, nowMs]);
  const history = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allHistory
      .filter((r) => (statusFilter === 'ALL' || resStatus(r, nowMs) === statusFilter) && (typeFilter === 'ALL' || r.slot.slot_type === typeFilter) && (!q || (r.slot.instructor_name || '').toLowerCase().includes(q)))
      .sort((a, b) => (sortOrder === 'asc' ? 1 : -1) * (startMsOf(a) - startMsOf(b)));
  }, [allHistory, nowMs, search, statusFilter, typeFilter, sortOrder]);

  const list = tab === 'upcoming' ? upcoming : history;
  const safePage = Math.min(page, Math.max(1, Math.ceil(list.length / PAGE_SIZE)));
  const visible = list.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const runAction = async (fn, reset) => { setBusy(true); try { await fn(); } finally { setBusy(false); reset(); } };

  return (
    <div className="space-y-5">
      <div role="tablist" className="flex border-b border-slate-200">
        {[['upcoming', 'Nadchodzące', upcoming.length], ['history', 'Historia', allHistory.length]].map(([id, label, count]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => { setTab(id); setPage(1); }}
            className={`px-4 sm:px-5 min-h-[44px] text-sm sm:text-base font-semibold border-b-2 -mb-px transition-colors ${tab === id ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {label}
            <span className={`ml-2 inline-flex min-w-[22px] justify-center px-1.5 py-0.5 rounded-full text-xs font-bold ${tab === id ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{count}</span>
          </button>
        ))}
      </div>

      {tab === 'history' && allHistory.length > 0 && (
        <section className={`${CARD_CLASS} p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3`}>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input type="search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Instruktor…" className={`${INPUT_CLASS} pl-10`} />
          </div>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className={SELECT_CLASS}>
            <option value="ALL">Zakończone i anulowane</option><option value="COMPLETED">Tylko zakończone</option><option value="CANCELLED">Tylko anulowane</option>
          </select>
          <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }} className={SELECT_CLASS}>
            <option value="ALL">Wszystkie typy</option><option value="INDIVIDUAL_1H">Indywidualne 1 h</option><option value="GROUP_1_5H">Grupowe 1,5 h</option>
          </select>
          <div className="relative">
            <ArrowUpDown className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select value={sortOrder} onChange={(e) => { setSortOrder(e.target.value); setPage(1); }} className={`${SELECT_CLASS} pl-10`}>
              <option value="desc">Od najnowszych</option><option value="asc">Od najstarszych</option>
            </select>
          </div>
        </section>
      )}

      {loading && reservations.length === 0 ? (
        <div className={`${CARD_CLASS} p-10 text-center text-slate-500 text-sm`}>Wczytywanie rezerwacji…</div>
      ) : list.length === 0 ? (
        tab === 'upcoming' ? (
          <div className={`${CARD_CLASS} px-6 py-14 text-center space-y-4`}>
            <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center"><CalendarCheck className="w-8 h-8" /></div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Nie masz jeszcze zaplanowanych treningów</h2>
              <p className="text-sm text-slate-600 mt-1">Wybierz instruktora i dogodny termin – rezerwacja zajmuje mniej niż minutę.</p>
            </div>
            <Link to="/app/client" className={BTN_PRIMARY}><Plus className="w-4 h-4" /><span>Zarezerwuj trening</span></Link>
          </div>
        ) : (
          <div className={`${CARD_CLASS} p-10 text-center space-y-2`}>
            <AlertCircle className="w-7 h-7 text-slate-300 mx-auto" />
            <p className="text-slate-700 font-semibold">{allHistory.length === 0 ? 'Historia jest jeszcze pusta' : 'Brak wyników dla wybranych filtrów'}</p>
          </div>
        )
      ) : (
        <div className="space-y-3.5">
          {visible.map((res) => {
            const type = typeLabel(res);
            if (tab !== 'upcoming') {
              const completed = resStatus(res, nowMs) === 'COMPLETED';
              return (
                <article key={res.id} className={`${CARD_CLASS} p-4 sm:p-5 flex gap-4 ${completed ? '' : 'opacity-90'}`}>
                  <DateBlock startIso={res.slot.start_time} muted />
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar name={res.slot?.instructor_name} sizeClass="w-11 h-11" />
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 truncate">{res.slot?.instructor_name || '—'}</div>
                          <div className="text-sm text-slate-600">{type.title} · {formatTime24(res.slot.start_time)}–{formatTime24(res.slot.end_time)}</div>
                        </div>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${completed ? 'bg-slate-100 text-slate-700 border-slate-300' : 'bg-red-100 text-red-900 border-red-200'}`}>{completed ? 'Zakończona' : 'Anulowana'}</span>
                    </div>
                    {completed ? (
                      <Link to={`/app/client/progress?q=${encodeURIComponent(res.slot?.instructor_name || '')}`} className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 hover:text-emerald-900">
                        <TrendingUp className="w-4 h-4" />Zobacz notatki instruktora i zaliczone drogi →
                      </Link>
                    ) : <p className="text-sm text-slate-500">Rezerwacja została odwołana.</p>}
                  </div>
                </article>
              );
            }

            const startMs = startMsOf(res);
            const badge = relativeBadge(res, nowMs);
            const started = startMs <= nowMs;
            const cancellable = !started && Boolean(res.can_cancel) && startMs - nowMs >= CANCEL_DEADLINE_MS;
            return (
              <article key={res.id} className={`${CARD_CLASS} p-4 sm:p-5 flex gap-4`}>
                <DateBlock startIso={res.slot.start_time} />
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar name={res.slot?.instructor_name} sizeClass="w-11 h-11" />
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 truncate">{res.slot?.instructor_name || '—'}</div>
                        <div className="text-sm text-slate-600 flex flex-wrap items-center gap-x-2">
                          <span className="inline-flex items-center gap-1">{type.group && <Users className="w-3.5 h-3.5 text-slate-400" />}{type.title}</span>
                          <span className="text-slate-300">•</span><span>{type.detail}</span>
                        </div>
                      </div>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${badge.cls}`}>{badge.label}</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                    <span className="inline-flex items-center gap-1.5 text-slate-700"><Clock className="w-4 h-4 text-slate-400" />{formatTime24(res.slot.start_time)} – {formatTime24(res.slot.end_time)}</span>
                    <span className="inline-flex items-center gap-1.5 text-slate-600">
                      <Footprints className={`w-4 h-4 ${res.needs_equipment ? 'text-amber-600' : 'text-slate-400'}`} />
                      {res.needs_equipment ? <span className="font-semibold text-amber-900 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-md text-xs">Buty + Uprząż</span> : 'Własny sprzęt'}
                    </span>
                    {!started && (
                      <button type="button" onClick={() => setEquipmentTarget(res)} className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-900"><Pencil className="w-3.5 h-3.5" />Zmień sprzęt</button>
                    )}
                  </div>

                  <div className={`flex items-start gap-2 text-sm rounded-lg px-3 py-2 ${cancellable ? 'bg-sky-50 text-sky-900' : 'bg-amber-50 text-amber-900'}`}>
                    <Info className="w-4 h-4 shrink-0 mt-0.5" />
                    {cancellable ? (
                      <span>Możliwość bezpłatnego odwołania do: <strong>{formatDeadline(startMs)}</strong></span>
                    ) : started ? (
                      <span>Trening jest w trakcie – nie można już zmienić sprzętu ani odwołać rezerwacji online.</span>
                    ) : (
                      <span>Mniej niż 12 h do startu – odwołanie tylko telefonicznie: <a href={RECEPTION_HREF} className="font-semibold underline">{RECEPTION_PHONE}</a></span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <details className="relative group">
                      <summary className={`${BTN_SECONDARY} list-none cursor-pointer select-none [&::-webkit-details-marker]:hidden`}>
                        <CalendarPlus className="w-4 h-4 text-emerald-600" /><span>Dodaj do kalendarza</span><ChevronDown className="w-4 h-4 text-slate-400 group-open:rotate-180 transition-transform" />
                      </summary>
                      <div className="absolute z-20 left-0 mt-1.5 w-60 bg-white border border-slate-200 rounded-xl shadow-lg p-1.5">
                        <a href={googleCalUrl(res)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-slate-800 hover:bg-slate-50"><ExternalLink className="w-4 h-4 text-slate-500" />Kalendarz Google</a>
                        <button type="button" onClick={(e) => { downloadIcs(res); e.currentTarget.closest('details')?.removeAttribute('open'); }} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-slate-800 hover:bg-slate-50 text-left"><Download className="w-4 h-4 text-slate-500" />Pobierz plik .ics (Apple, Outlook)</button>
                      </div>
                    </details>
                    <a href={DIRECTIONS_URL} target="_blank" rel="noopener noreferrer" className={BTN_SECONDARY}><MapPin className="w-4 h-4 text-emerald-600" /><span>Jak dojechać</span></a>
                    <button type="button" onClick={() => setCancelTarget(res)} disabled={!cancellable} className={`${BTN_DANGER} sm:ml-auto`}>Odwołaj wizytę</button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {list.length > PAGE_SIZE && <Pagination totalItems={list.length} pageSize={PAGE_SIZE} currentPage={safePage} onPageChange={setPage} />}

      <p className="flex items-center gap-1.5 text-xs text-slate-500">
        <Phone className="w-3.5 h-3.5" />Pilna zmiana lub odwołanie w mniej niż 12 h przed startem – recepcja: <a href={RECEPTION_HREF} className="font-semibold text-slate-700 underline">{RECEPTION_PHONE}</a>
      </p>

      {cancelTarget && (
        <ModalShell title="Odwołać wizytę?" onClose={() => !busy && setCancelTarget(null)} maxWidth="max-w-md"
          footer={
            <div className="flex flex-col-reverse sm:flex-row gap-2.5">
              <button type="button" onClick={() => setCancelTarget(null)} disabled={busy} className={`${BTN_SECONDARY} flex-1`}>Zostaw rezerwację</button>
              <button type="button" onClick={() => runAction(() => onCancel(cancelTarget.id), () => setCancelTarget(null))} disabled={busy} className="inline-flex items-center justify-center min-h-[44px] px-4 py-2.5 text-sm font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 flex-1">{busy ? 'Odwoływanie…' : 'Tak, odwołaj wizytę'}</button>
            </div>
          }
        >
          <ReservationSummary res={cancelTarget} />
          <p className="text-sm text-slate-600">Po odwołaniu zwolniony termin wróci do ogólnego grafiku. Tej operacji nie można cofnąć.</p>
        </ModalShell>
      )}
      {equipmentTarget && <EquipmentModal res={equipmentTarget} busy={busy} onSave={(v) => runAction(() => onUpdateEquipment(equipmentTarget.id, v), () => setEquipmentTarget(null))} onClose={() => !busy && setEquipmentTarget(null)} />}
    </div>
  );
}
