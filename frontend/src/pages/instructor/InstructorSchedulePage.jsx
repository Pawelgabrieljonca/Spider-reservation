import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  CalendarClock,
  CheckCheck,
  CheckCircle2,
  Clock,
  Lock,
  Plus,
  Trash2,
  TrendingUp,
  Unlock,
  Users,
  X,
} from 'lucide-react';
import apiClient from '../../api/client';
import CreateShiftModal from '../../components/CreateShiftModal';
import InstructorWeekTimeline from '../../components/InstructorWeekTimeline';
import SEO from '../../components/SEO';
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY } from '../../styles/ui';
import {
  experienceLevelLabel,
  formatDurationMinutes,
  formatSlotRange24,
  formatTime24,
  slotTypeShortLabel,
} from '../../utils/dateUtils';
import { extractApiError } from '../../utils/grades';

// Domyślne ustawienia kreatora dyżuru otwieranego przyciskiem (najbliższa pełna godzina w godz. otwarcia)
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

function computeReservationStatus(res, slotEndTime, nowMs) {
  if (res.status === 'cancelled') return 'CANCELLED';
  const endMs = new Date(slotEndTime).getTime();
  if (endMs < nowMs) return 'COMPLETED';
  return 'ACTIVE';
}

function StatusBadge({ status }) {
  if (status === 'ACTIVE') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-900 border border-emerald-200">
        Aktywny
      </span>
    );
  }
  if (status === 'COMPLETED') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-300">
        Zakończony
      </span>
    );
  }
  if (status === 'BLOCKED') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-200">
        Zablokowany
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-900 border border-red-200">
      Anulowane
    </span>
  );
}

export default function InstructorSchedulePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [slots, setSlots] = useState([]);
  const [selectedSlotId, setSelectedSlotId] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [kpiFilter, setKpiFilter] = useState(null); // 'upcoming' | 'booked' | 'completed' | null
  const [createState, setCreateState] = useState(() =>
    searchParams.get('add') ? defaultCreateState() : null
  );

  // Parametr ?add=1 (np. ze starego linku „Dodaj dyżur”) otwiera kreator i jest od razu czyszczony
  useEffect(() => {
    if (searchParams.get('add')) setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const fetchSlots = useCallback(async () => {
    try {
      const res = await apiClient.get('/api/v1/instructor/slots');
      setSlots(Array.isArray(res.data) ? res.data : []);
      setNowMs(Date.now());
    } catch (err) {
      setErrorMsg(extractApiError(err, 'Błąd pobierania grafiku instruktora.'));
    }
  }, []);

  useEffect(() => {
    let active = true;
    apiClient
      .get('/api/v1/instructor/slots')
      .then((res) => {
        if (!active) return;
        setSlots(Array.isArray(res.data) ? res.data : []);
        setNowMs(Date.now());
      })
      .catch((err) => {
        if (!active) return;
        setErrorMsg(extractApiError(err, 'Błąd pobierania grafiku instruktora.'));
      });
    return () => {
      active = false;
    };
  }, []);

  // Automatyczna rewalidacja w tle: powrót do karty oraz cykliczne odświeżanie co 60 s
  useEffect(() => {
    const handleRevalidate = () => {
      if (document.visibilityState === 'visible') {
        apiClient
          .get('/api/v1/instructor/slots')
          .then((res) => {
            setSlots(Array.isArray(res.data) ? res.data : []);
            setNowMs(Date.now());
          })
          .catch(() => {});
      }
    };
    window.addEventListener('focus', handleRevalidate);
    document.addEventListener('visibilitychange', handleRevalidate);
    const intervalId = window.setInterval(handleRevalidate, 60000);
    return () => {
      window.removeEventListener('focus', handleRevalidate);
      document.removeEventListener('visibilitychange', handleRevalidate);
      window.clearInterval(intervalId);
    };
  }, []);

  const handleShiftsCreated = ({ createdCount, failedCount, start, end }) => {
    setCreateState(null);
    setErrorMsg(null);
    if (createdCount === 1) {
      setSuccessMsg(`Dodano dyżur: ${formatSlotRange24(start, end)}.`);
    } else {
      setSuccessMsg(
        `Dodano ${createdCount} dyżurów (od ${formatSlotRange24(start, end)})${
          failedCount > 0 ? `; pominięto ${failedCount} z powodu kolizji z grafikiem` : ''
        }.`
      );
    }
    fetchSlots();
  };

  const handleToggleBlock = async (slot) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await apiClient.patch(`/api/v1/instructor/slots/${slot.id}`, {
        is_blocked: !slot.is_blocked,
      });
      setSuccessMsg(
        `Dyżur (${formatSlotRange24(slot.start_time, slot.end_time)}) został ${
          !slot.is_blocked ? 'zablokowany' : 'odblokowany'
        }.`
      );
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

  // Spłaszczona lista rezerwacji klientów ze wszystkich dyżurów instruktora
  const allReservations = useMemo(() => {
    const list = [];
    for (const win of slots) {
      for (const r of win.reservations || []) {
        list.push({
          ...r,
          window_id: win.id,
          slot_id: r.slot_id ?? win.id,
          slot_start: r.slot_start || win.start_time,
          slot_end: r.slot_end || win.end_time,
          slot_type: r.slot_type,
        });
      }
    }
    return list;
  }, [slots]);

  const stats = useMemo(() => {
    const upcomingSlots = slots.filter(
      (s) => !s.is_blocked && new Date(s.end_time).getTime() >= nowMs
    ).length;
    const activeReservations = allReservations.filter(
      (r) => r.status === 'confirmed' && new Date(r.slot_end).getTime() >= nowMs
    ).length;
    const completedSlots = slots.filter(
      (s) => new Date(s.end_time).getTime() < nowMs
    ).length;
    return { upcomingSlots, activeReservations, completedSlots };
  }, [slots, allReservations, nowMs]);

  const selectedSlot = useMemo(
    () => slots.find((s) => s.id === selectedSlotId),
    [slots, selectedSlotId]
  );

  return (
    <div className="space-y-3 sm:space-y-4">
      <SEO
        title="Panel Instruktora - Grafik Dyżurów | CW Spider"
        description="Panel instruktora CW Spider – zarządzanie dyżurami, slotami treningowymi i uczestnikami sesji wspinaczkowych."
        path="/app/instructor"
        robots="noindex, nofollow"
      />

      {/* Pasek nagłówka z tytułem oraz główną akcją */}
      <div className="flex items-center justify-between gap-2.5 sm:gap-3">
        <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900">
          Grafik dyżurów
        </h1>

        <button
          type="button"
          onClick={() => setCreateState(defaultCreateState())}
          className={`${BTN_PRIMARY} px-3 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-base shrink-0`}
        >
          <Plus className="w-4 h-4" />
          <span>Dodaj dyżur</span>
        </button>
      </div>

      {/* Klikalne karty KPI – filtrują/podświetlają bloki w kalendarzu (responsywne dla małych ekranów) */}
      <div className="grid grid-cols-3 gap-1.5 sm:gap-3" role="group" aria-label="Filtr kalendarza">
        {[
          {
            key: 'upcoming',
            icon: CalendarClock,
            label: 'Nadchodzące dyżury',
            short: 'Dyżury',
            value: stats.upcomingSlots,
            tone: 'text-emerald-700 bg-emerald-100',
            ring: 'ring-emerald-500 border-emerald-500',
          },
          {
            key: 'booked',
            icon: Users,
            label: 'Aktywne rezerwacje',
            short: 'Rezerwacje',
            value: stats.activeReservations,
            tone: 'text-sky-700 bg-sky-100',
            ring: 'ring-sky-500 border-sky-500',
          },
          {
            key: 'completed',
            icon: CheckCheck,
            label: 'Zakończone',
            short: 'Zakończone',
            value: stats.completedSlots,
            tone: 'text-slate-700 bg-slate-200',
            ring: 'ring-slate-500 border-slate-500',
          },
        ].map((card) => {
          const Icon = card.icon;
          const active = kpiFilter === card.key;
          return (
            <button
              key={card.key}
              type="button"
              aria-pressed={active}
              onClick={() => setKpiFilter(active ? null : card.key)}
              title={
                active
                  ? 'Kliknij ponownie, aby wyłączyć podświetlenie'
                  : 'Kliknij, aby podświetlić w kalendarzu'
              }
              className={`text-center sm:text-left bg-white border rounded-xl p-2 sm:p-3.5 shadow-sm transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                active ? `ring-2 ${card.ring}` : 'border-slate-200'
              }`}
            >
              <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2.5">
                <span
                  className={`hidden sm:inline-flex w-9 h-9 rounded-lg items-center justify-center shrink-0 ${card.tone}`}
                >
                  <Icon className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                  <div className="text-lg sm:text-2xl font-extrabold text-slate-900 leading-none">
                    {card.value}
                  </div>
                  <div className="text-[10px] sm:text-xs font-semibold text-slate-600 truncate mt-1">
                    <span className="sm:hidden">{card.short}</span>
                    <span className="hidden sm:inline">{card.label}</span>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Komunikaty */}
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2 text-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg hover:bg-red-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2 text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMsg(null)}
            className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg hover:bg-emerald-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Panel szczegółów i zarządzania wybranym dyżurem (po kliknięciu w blok kalendarza) */}
      {selectedSlot && (
        <section className="bg-emerald-50/70 border-2 border-emerald-500 rounded-xl p-4 sm:p-5 shadow-sm space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-emerald-200 pb-2.5">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                Szczegóły dyżuru •{' '}
                {formatSlotRange24(selectedSlot.start_time, selectedSlot.end_time)}
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                Czas trwania dyżuru:{' '}
                <strong>{formatDurationMinutes(selectedSlot.duration_minutes)}</strong> •
                Aktywnych zapisów:{' '}
                <strong>{selectedSlot.confirmed_reservations_count || 0}</strong>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {new Date(selectedSlot.end_time).getTime() >= nowMs && (
                <>
                  <button
                    type="button"
                    onClick={() => handleToggleBlock(selectedSlot)}
                    className={BTN_SECONDARY}
                  >
                    {selectedSlot.is_blocked ? (
                      <>
                        <Unlock className="w-4 h-4" />
                        <span>Odblokuj dyżur</span>
                      </>
                    ) : (
                      <>
                        <Lock className="w-4 h-4" />
                        <span>Zablokuj dyżur</span>
                      </>
                    )}
                  </button>

                  {(selectedSlot.confirmed_reservations_count || 0) === 0 && (
                    <button
                      type="button"
                      onClick={() => handleDeleteSlot(selectedSlot)}
                      className={BTN_DANGER}
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Usuń dyżur</span>
                    </button>
                  )}
                </>
              )}

              <button
                type="button"
                onClick={() => setSelectedSlotId(null)}
                aria-label="Zamknij szczegóły dyżuru"
                className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {selectedSlot.reservations && selectedSlot.reservations.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {selectedSlot.reservations.map((res) => {
                const sessionStart = res.slot_start || selectedSlot.start_time;
                const sessionEnd = res.slot_end || selectedSlot.end_time;
                const expLabel = experienceLevelLabel(res.client_experience_level);
                return (
                  <div
                    key={res.id}
                    className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2 shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-bold text-slate-900 text-sm sm:text-base">
                        {res.client_name || `Klient #${res.client_id}`}
                      </div>
                      <StatusBadge
                        status={computeReservationStatus(res, sessionEnd, nowMs)}
                      />
                    </div>

                    <div className="inline-flex flex-wrap items-center gap-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md">
                      <Clock className="w-3.5 h-3.5 text-emerald-600" />
                      <span>
                        {formatTime24(sessionStart)} – {formatTime24(sessionEnd)}
                      </span>
                      {res.slot_type && (
                        <span>• {slotTypeShortLabel(res.slot_type)}</span>
                      )}
                    </div>

                    <div className="text-xs sm:text-sm text-slate-600 space-y-1">
                      <div>E-mail: {res.client_email || '—'}</div>
                      {res.client_phone && <div>Telefon: {res.client_phone}</div>}
                      {expLabel && (
                        <div>
                          Poziom: <strong className="text-slate-800">{expLabel}</strong>
                        </div>
                      )}
                      <div>
                        Sprzęt:{' '}
                        {res.needs_equipment ? (
                          <span className="font-semibold text-amber-900 bg-amber-100 px-2 py-0.5 rounded text-xs">
                            Wypożyczenie
                            {res.client_shoe_size ? ` (but EU ${res.client_shoe_size})` : ' (uprząż / buty)'}
                          </span>
                        ) : (
                          <span className="text-slate-700">Własny</span>
                        )}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100">
                      <Link
                        to={`/app/instructor/progress?clientId=${res.client_id}&clientName=${encodeURIComponent(
                          res.client_name || ''
                        )}`}
                        className="inline-flex items-center gap-1.5 min-h-[38px] text-xs sm:text-sm font-semibold text-emerald-700 hover:text-emerald-800"
                      >
                        <TrendingUp className="w-4 h-4" />
                        <span>Dodaj wpis w Dzienniku postępów &rarr;</span>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-slate-600 py-2">
              W tym oknie dyżuru nie zarezerwowano jeszcze żadnych treningów.
            </p>
          )}
        </section>
      )}

      {/* GŁÓWNY WIDOK KALENDARZA (Oś czasu 09:00 – 22:00) */}
      <InstructorWeekTimeline
        slots={slots}
        nowMs={nowMs}
        selectedSlotId={selectedSlotId}
        onSelectSlot={setSelectedSlotId}
        highlightFilter={kpiFilter}
        onRequestCreate={({ dayDate, hour }) => setCreateState({ date: dayDate, hour })}
      />

      {createState && (
        <CreateShiftModal
          initialDate={createState.date}
          initialHour={createState.hour}
          onClose={() => setCreateState(null)}
          onCreated={handleShiftsCreated}
        />
      )}
    </div>
  );
}
