import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Lock,
  RefreshCw,
  Trash2,
  TrendingUp,
  Unlock,
  X,
} from 'lucide-react';
import apiClient from '../../api/client';
import InstructorWeekTimeline from '../../components/InstructorWeekTimeline';
import SEO from '../../components/SEO';
import { BTN_DANGER, BTN_SECONDARY } from '../../styles/ui';
import {
  experienceLevelLabel,
  formatDurationMinutes,
  formatSlotRange24,
  formatTime24,
  slotTypeShortLabel,
} from '../../utils/dateUtils';
import { extractApiError } from '../../utils/grades';

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
  const [slots, setSlots] = useState([]);
  const [selectedSlotId, setSelectedSlotId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const fetchSlots = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/api/v1/instructor/slots');
      setSlots(Array.isArray(res.data) ? res.data : []);
      setNowMs(Date.now());
    } catch (err) {
      setErrorMsg(extractApiError(err, 'Błąd pobierania grafiku instruktora.'));
    } finally {
      setLoading(false);
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
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Automatyczna rewalidacja w tle przy powrocie do karty
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
    return () => {
      window.removeEventListener('focus', handleRevalidate);
      document.removeEventListener('visibilitychange', handleRevalidate);
    };
  }, []);

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

      {/* Pasek nagłówka z tytułem oraz przyciskiem Odśwież */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900">
          Grafik dyżurów
        </h1>

        <button
          type="button"
          onClick={fetchSlots}
          disabled={loading}
          aria-label="Odśwież grafik"
          className="inline-flex items-center justify-center gap-1.5 min-h-[38px] px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs sm:text-sm font-medium hover:bg-slate-50 active:bg-slate-100 transition-colors shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Odśwież</span>
        </button>
      </div>

      {/* Zwarty, jednolinijkowy pasek statystyk */}
      <div className="grid grid-cols-3 divide-x divide-slate-200 bg-white border border-slate-200 rounded-lg py-2 px-1 shadow-sm text-center">
        <div className="px-1.5 text-[11px] sm:text-sm text-slate-600 truncate">
          <span className="sm:hidden">Dyżury: </span>
          <span className="hidden sm:inline">Nadchodzące dyżury: </span>
          <strong className="font-bold text-emerald-700">{stats.upcomingSlots}</strong>
        </div>
        <div className="px-1.5 text-[11px] sm:text-sm text-slate-600 truncate">
          <span className="sm:hidden">Rezerwacje: </span>
          <span className="hidden sm:inline">Aktywne rezerwacje: </span>
          <strong className="font-bold text-sky-700">{stats.activeReservations}</strong>
        </div>
        <div className="px-1.5 text-[11px] sm:text-sm text-slate-600 truncate">
          <span>Zakończone: </span>
          <strong className="font-bold text-slate-900">{stats.completedSlots}</strong>
        </div>
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
      />
    </div>
  );
}
