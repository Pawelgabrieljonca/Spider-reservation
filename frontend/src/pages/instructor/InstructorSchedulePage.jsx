import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  CalendarClock, CheckCheck, ClipboardList, Clock, Lock, Plus, ShieldCheck, Trash2, TrendingUp, Unlock, Users, X,
} from 'lucide-react';
import apiClient, { extractApiError, useRevalidate } from '../../core/api';
import { addDays, formatDurationMinutes, formatSlotRange24, formatTime24, slotTypeShortLabel, startOfDay, toLocalIsoWithOffset } from '../../core/dateUtils';
import { AlertBanner, BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, ExperienceLevelBadge } from '../../ui/common';
import ClientVerificationModal from './ClientVerificationModal';
import CreateShiftModal from './CreateShiftModal';
import InstructorWeekTimeline from './InstructorWeekTimeline';

const STATUS_BADGES = {
  ACTIVE: ['Aktywny', 'bg-emerald-100 text-emerald-900 border-emerald-200'],
  COMPLETED: ['Zakończony', 'bg-slate-100 text-slate-700 border-slate-300'],
  BLOCKED: ['Zablokowany', 'bg-amber-100 text-amber-900 border-amber-200'],
  CANCELLED: ['Anulowane', 'bg-red-100 text-red-900 border-red-200'],
};

function defaultCreateState() {
  const now = new Date();
  let hour = now.getHours() + 1;
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (hour > 20) {
    date.setDate(date.getDate() + 1);
    hour = 14;
  }
  return { date, hour: Math.max(9, hour) };
}

function StatusBadge({ status }) {
  const [label, cls] = STATUS_BADGES[status] || STATUS_BADGES.CANCELLED;
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${cls}`}>{label}</span>;
}

export default function InstructorSchedulePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [slots, setSlots] = useState([]);
  const [clientsList, setClientsList] = useState([]);
  const [selectedSlotId, setSelectedSlotId] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [anchorDate, setAnchorDate] = useState(() => startOfDay(new Date()));
  const [kpiFilter, setKpiFilter] = useState(null);
  const [createState, setCreateState] = useState(() => (searchParams.get('add') ? defaultCreateState() : null));
  const [verifyModalState, setVerifyModalState] = useState(null);
  const [verifyingClientId, setVerifyingClientId] = useState(null);

  useEffect(() => {
    if (searchParams.get('add')) setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const fetchSlots = useCallback(async (silent = false) => {
    try {
      const dateFrom = toLocalIsoWithOffset(addDays(anchorDate, -14));
      const dateTo = toLocalIsoWithOffset(addDays(anchorDate, 46));
      const [slotsRes, clientsRes] = await Promise.all([
        apiClient.get('/api/v1/instructor/slots', { params: { date_from: dateFrom, date_to: dateTo } }),
        apiClient.get('/api/v1/instructor/clients').catch(() => ({ data: [] })),
      ]);
      setSlots(Array.isArray(slotsRes.data) ? slotsRes.data : []);
      if (Array.isArray(clientsRes.data)) setClientsList(clientsRes.data);
      setNowMs(Date.now());
    } catch (err) {
      if (!silent) setErrorMsg(extractApiError(err, 'Błąd pobierania grafiku instruktora.'));
    }
  }, [anchorDate]);

  useEffect(() => { Promise.resolve().then(() => fetchSlots()); }, [fetchSlots]);
  const silentFetchSlots = useCallback(() => fetchSlots(true), [fetchSlots]);
  useRevalidate(silentFetchSlots, 60000);

  const clientsById = useMemo(() => new Map(clientsList.map((c) => [c.id, c])), [clientsList]);

  const handleQuickVerifyLevel = async (res) => {
    if (!res?.client_id || !res?.client_experience_level || verifyingClientId) return;
    setVerifyingClientId(res.client_id);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await apiClient.patch(`/api/v1/instructor/clients/${res.client_id}/experience`, {
        experience_level: res.client_experience_level,
        verified: true,
      });
      setSuccessMsg(`Zatwierdzono poziom wspinaczkowy dla ${res.client_name || `klienta #${res.client_id}`}.`);
      await fetchSlots();
    } catch (err) {
      setErrorMsg(extractApiError(err, 'Nie udało się zatwierdzić poziomu wspinacza.'));
    } finally {
      setVerifyingClientId(null);
    }
  };

  const handleShiftsCreated = ({ createdCount, failedCount, start, end }) => {
    setCreateState(null);
    setErrorMsg(null);
    setSuccessMsg(
      createdCount === 1
        ? `Dodano dyżur: ${formatSlotRange24(start, end)}.`
        : `Dodano ${createdCount} dyżurów (od ${formatSlotRange24(start, end)})${failedCount > 0 ? `; pominięto ${failedCount} z powodu kolizji z grafikiem` : ''}.`
    );
    fetchSlots();
  };

  const handleToggleBlock = async (slot) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await apiClient.patch(`/api/v1/instructor/slots/${slot.id}`, { is_blocked: !slot.is_blocked });
      setSuccessMsg(`Dyżur (${formatSlotRange24(slot.start_time, slot.end_time)}) został ${!slot.is_blocked ? 'zablokowany' : 'odblokowany'}.`);
      fetchSlots();
    } catch (err) {
      setErrorMsg(extractApiError(err, 'Nie udało się zmienić statusu dyżuru.'));
    }
  };

  const handleDeleteSlot = async (slot) => {
    if (!window.confirm('Czy na pewno chcesz trwale usunąć to okno dyżuru z grafiku?')) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await apiClient.delete(`/api/v1/instructor/slots/${slot.id}`);
      setSuccessMsg('Okno dyżuru zostało usunięte z grafiku.');
      if (selectedSlotId === slot.id) setSelectedSlotId(null);
      fetchSlots();
    } catch (err) {
      setErrorMsg(extractApiError(err, 'Nie można usunąć okna dyżuru.'));
    }
  };

  const stats = useMemo(() => {
    const allRes = slots.flatMap((w) => (w.reservations || []).map((r) => ({ ...r, slot_end: r.slot_end || w.end_time })));
    return {
      upcomingSlots: slots.filter((s) => !s.is_blocked && new Date(s.end_time).getTime() >= nowMs).length,
      activeReservations: allRes.filter((r) => r.status === 'confirmed' && new Date(r.slot_end).getTime() >= nowMs).length,
      completedSlots: slots.filter((s) => new Date(s.end_time).getTime() < nowMs).length,
    };
  }, [slots, nowMs]);

  const selectedSlot = useMemo(() => slots.find((s) => s.id === selectedSlotId), [slots, selectedSlotId]);

  const kpiCards = [
    { key: 'upcoming', icon: CalendarClock, label: 'Nadchodzące dyżury', short: 'Dyżury', value: stats.upcomingSlots, tone: 'text-emerald-700 bg-emerald-100', ring: 'ring-emerald-500 border-emerald-500' },
    { key: 'booked', icon: Users, label: 'Aktywne rezerwacje', short: 'Rezerwacje', value: stats.activeReservations, tone: 'text-sky-700 bg-sky-100', ring: 'ring-sky-500 border-sky-500' },
    { key: 'completed', icon: CheckCheck, label: 'Zakończone', short: 'Zakończone', value: stats.completedSlots, tone: 'text-slate-700 bg-slate-200', ring: 'ring-slate-500 border-slate-500' },
  ];

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex items-center justify-between gap-2.5 sm:gap-3">
        <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900">Grafik dyżurów</h1>
        <button type="button" onClick={() => setCreateState(defaultCreateState())} className={`${BTN_PRIMARY} px-3 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-base shrink-0`}>
          <Plus className="w-4 h-4" />
          <span>Dodaj dyżur</span>
        </button>
      </div>

      <div className="grid grid-cols-3 gap-1.5 sm:gap-3" role="group" aria-label="Filtr kalendarza">
        {kpiCards.map(({ key, icon: Icon, label, short, value, tone, ring }) => {
          const active = kpiFilter === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => setKpiFilter(active ? null : key)}
              title={active ? 'Kliknij ponownie, aby wyłączyć podświetlenie' : 'Kliknij, aby podświetlić w kalendarzu'}
              className={`text-center sm:text-left bg-white border rounded-xl p-2 sm:p-3.5 shadow-sm transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-500 ${active ? `ring-2 ${ring}` : 'border-slate-200'}`}
            >
              <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2.5">
                <span className={`hidden sm:inline-flex w-9 h-9 rounded-lg items-center justify-center shrink-0 ${tone}`}>
                  <Icon className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                  <div className="text-lg sm:text-2xl font-extrabold text-slate-900 leading-none">{value}</div>
                  <div className="text-[10px] sm:text-xs font-semibold text-slate-600 truncate mt-1">
                    <span className="sm:hidden">{short}</span>
                    <span className="hidden sm:inline">{label}</span>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <AlertBanner type="error" message={errorMsg} onClose={() => setErrorMsg(null)} />
      <AlertBanner type="success" message={successMsg} onClose={() => setSuccessMsg(null)} />

      {selectedSlot && (
        <section className="bg-emerald-50/70 border-2 border-emerald-500 rounded-xl p-4 sm:p-5 shadow-sm space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-emerald-200 pb-2.5">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                Szczegóły dyżuru • {formatSlotRange24(selectedSlot.start_time, selectedSlot.end_time)}
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                Czas trwania dyżuru: <strong>{formatDurationMinutes(selectedSlot.duration_minutes)}</strong> • Aktywnych zapisów:{' '}
                <strong>{selectedSlot.confirmed_reservations_count || 0}</strong>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {new Date(selectedSlot.end_time).getTime() >= nowMs && (
                <>
                  <button type="button" onClick={() => handleToggleBlock(selectedSlot)} className={BTN_SECONDARY}>
                    {selectedSlot.is_blocked ? <><Unlock className="w-4 h-4" /><span>Odblokuj dyżur</span></> : <><Lock className="w-4 h-4" /><span>Zablokuj dyżur</span></>}
                  </button>
                  {(selectedSlot.confirmed_reservations_count || 0) === 0 && (
                    <button type="button" onClick={() => handleDeleteSlot(selectedSlot)} className={BTN_DANGER}>
                      <Trash2 className="w-4 h-4" />
                      <span>Usuń dyżur</span>
                    </button>
                  )}
                </>
              )}
              <button type="button" onClick={() => setSelectedSlotId(null)} aria-label="Zamknij szczegóły dyżuru" className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {selectedSlot.reservations?.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {selectedSlot.reservations.map((res) => {
                const sessionStart = res.slot_start || selectedSlot.start_time;
                const sessionEnd = res.slot_end || selectedSlot.end_time;
                const cs = clientsById.get(res.client_id);
                const level = cs?.experience_level ?? res.client_experience_level;
                const verified = cs?.experience_verified ?? Boolean(res.client_experience_verified);
                const status = res.status === 'cancelled' ? 'CANCELLED' : new Date(sessionEnd).getTime() < nowMs ? 'COMPLETED' : 'ACTIVE';

                return (
                  <div key={res.id} className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2.5 shadow-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-bold text-slate-900 text-sm sm:text-base">{res.client_name || `Klient #${res.client_id}`}</div>
                      <StatusBadge status={status} />
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <div className="inline-flex flex-wrap items-center gap-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md">
                        <Clock className="w-3.5 h-3.5 text-emerald-600" />
                        <span>{formatTime24(sessionStart)} – {formatTime24(sessionEnd)}</span>
                        {res.slot_type && <span>• {slotTypeShortLabel(res.slot_type)}</span>}
                      </div>
                      <ExperienceLevelBadge
                        level={level}
                        verified={verified}
                        verifiedByName={cs?.experience_verified_by_name ?? res.client_experience_verified_by_name}
                        verifiedAt={cs?.experience_verified_at ?? res.client_experience_verified_at}
                      />
                      {level && !verified && (
                        <button
                          type="button"
                          disabled={verifyingClientId === res.client_id}
                          onClick={() => handleQuickVerifyLevel(res)}
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm disabled:opacity-50"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>{verifyingClientId === res.client_id ? 'Zatwierdzanie...' : 'Zatwierdź poziom'}</span>
                        </button>
                      )}
                    </div>
                    <div className="text-xs sm:text-sm text-slate-600 space-y-1">
                      <div>E-mail: {res.client_email || '—'}</div>
                      {res.client_phone && <div>Telefon: {res.client_phone}</div>}
                      <div>
                        Sprzęt:{' '}
                        {res.needs_equipment ? (
                          <span className="font-semibold text-amber-900 bg-amber-100 px-2 py-0.5 rounded text-xs">
                            Wypożyczenie{res.client_shoe_size ? ` (but EU ${res.client_shoe_size})` : ' (uprząż / buty)'}
                          </span>
                        ) : (
                          <span className="text-slate-700">Własny</span>
                        )}
                        {(cs?.completed_trainings_count || 0) > 0 && (
                          <span className="ml-2 text-xs text-slate-500">• Odbyte sesje u Ciebie: <strong>{cs.completed_trainings_count}</strong></span>
                        )}
                      </div>
                    </div>
                    {cs?.latest_note && (
                      <div className="rounded-lg bg-slate-50 border border-slate-200/80 px-3 py-2 text-xs text-slate-700">
                        <span className="font-semibold text-slate-900">Notatka trenerska ({cs.notes_count || 0}):</span>{' '}
                        <span className="line-clamp-2">{cs.latest_note}</span>
                      </div>
                    )}
                    <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setVerifyModalState({ clientId: res.client_id, initialTab: 'notes' })}
                        className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs sm:text-sm font-semibold text-slate-800"
                      >
                        <ClipboardList className="w-4 h-4 text-emerald-600" />
                        <span>Weryfikuj profil, notatki{(cs?.notes_count || 0) > 0 ? ` (${cs.notes_count})` : ''} i historia</span>
                      </button>
                      <Link to={`/app/instructor/progress?clientId=${res.client_id}`} className="inline-flex items-center gap-1.5 min-h-[38px] text-xs sm:text-sm font-semibold text-emerald-700 hover:text-emerald-800">
                        <TrendingUp className="w-4 h-4" />
                        <span>Dziennik postępów &rarr;</span>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-slate-600 py-2">W tym oknie dyżuru nie zarezerwowano jeszcze żadnych treningów.</p>
          )}
        </section>
      )}

      <InstructorWeekTimeline slots={slots} nowMs={nowMs} anchorDate={anchorDate} onAnchorDateChange={setAnchorDate} selectedSlotId={selectedSlotId} onSelectSlot={setSelectedSlotId} highlightFilter={kpiFilter} onRequestCreate={({ dayDate, hour }) => setCreateState({ date: dayDate, hour })} />

      {createState && <CreateShiftModal initialDate={createState.date} initialHour={createState.hour} onClose={() => setCreateState(null)} onCreated={handleShiftsCreated} />}

      {verifyModalState && (
        <ClientVerificationModal key={verifyModalState.clientId} clientId={verifyModalState.clientId} initialTab={verifyModalState.initialTab} onClose={() => setVerifyModalState(null)} onUpdated={() => fetchSlots()} />
      )}
    </div>
  );
}
