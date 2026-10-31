import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowUpDown,
  CalendarRange,
  CheckCircle2,
  Clock,
  LayoutList,
  Lock,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Trash2,
  TrendingUp,
  Unlock,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import apiClient from '../../api/client';
import InstructorWeekTimeline from '../../components/InstructorWeekTimeline';
import Pagination from '../../components/Pagination';
import {
  BTN_DANGER,
  BTN_SECONDARY,
  CARD_CLASS,
  INPUT_CLASS,
  SELECT_CLASS,
} from '../../styles/ui';
import {
  experienceLevelLabel,
  formatDateTime24,
  formatDurationMinutes,
  formatSlotRange24,
  formatTime24,
  slotTypeShortLabel,
} from '../../utils/dateUtils';
import { extractApiError } from '../../utils/grades';

function computeSlotStatus(slot, nowMs) {
  const endMs = new Date(slot.end_time).getTime();
  if (slot.is_blocked) return 'BLOCKED';
  if (endMs < nowMs) return 'COMPLETED';
  return 'ACTIVE';
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
  // Przełącznik głównego układu grafiku: 'list' (Lista) | 'week' (Siatka tygodniowa 09:00–22:00)
  const [displayLayout, setDisplayLayout] = useState('list');
  // 'upcoming' (domyślny – najbliższe nadchodzące dyżury) | 'reservations' | 'archive' (przeszłe)
  const [viewMode, setViewMode] = useState('upcoming');
  const [slots, setSlots] = useState([]);
  const [selectedSlotId, setSelectedSlotId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Mobilny akordeon filtrów (domyślnie zwinięty, aby nie spychać grafiku poza ekran)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // Filtry, wyszukiwarka, sortowanie (domyślnie 'asc' = od najbliższych nadchodzących) i paginacja
  const [occupancyFilter, setOccupancyFilter] = useState('ALL'); // 'ALL' | 'BOOKED' | 'FREE' | 'BLOCKED'
  const [resStatusFilter, setResStatusFilter] = useState('ACTIVE'); // 'ACTIVE' | 'ALL' | 'COMPLETED' | 'CANCELLED'
  const [typeFilter, setTypeFilter] = useState('ALL'); // 'ALL' | 'INDIVIDUAL_1H' | 'GROUP_1_5H'
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState('asc'); // 'asc' | 'desc'
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

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
      (s) => !s.is_blocked && new Date(s.end_time).getTime() < nowMs
    ).length;
    return { upcomingSlots, activeReservations, completedSlots };
  }, [slots, allReservations, nowMs]);

  // Filtrowanie i sortowanie okien dyżurów (osobno nadchodzące vs archiwalne)
  const filteredSlots = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const isArchive = viewMode === 'archive';

    const list = slots.filter((slot) => {
      const endMs = new Date(slot.end_time).getTime();
      const isPast = endMs < nowMs;

      if (isArchive && !isPast) return false;
      if (!isArchive && isPast) return false;

      const confirmedCount = slot.confirmed_reservations_count || 0;
      if (occupancyFilter === 'BOOKED' && confirmedCount <= 0) return false;
      if (occupancyFilter === 'FREE' && (confirmedCount > 0 || slot.is_blocked)) return false;
      if (occupancyFilter === 'BLOCKED' && !slot.is_blocked) return false;

      if (typeFilter !== 'ALL') {
        const hasSessionType =
          (slot.booked_sessions || []).some((bs) => bs.slot_type === typeFilter) ||
          (slot.reservations || []).some((r) => r.slot_type === typeFilter);
        if (!hasSessionType) return false;
      }

      if (q) {
        const matchesClient = (slot.reservations || []).some(
          (r) =>
            (r.client_name || '').toLowerCase().includes(q) ||
            (r.client_email || '').toLowerCase().includes(q)
        );
        if (!matchesClient) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      const diff = new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
      return sortOrder === 'asc' ? diff : -diff;
    });

    return list;
  }, [slots, viewMode, occupancyFilter, typeFilter, searchQuery, sortOrder, nowMs]);

  // Filtrowanie i sortowanie rezerwacji
  const filteredReservations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const list = allReservations.filter((res) => {
      const resStatus = computeReservationStatus(res, res.slot_end, nowMs);

      if (resStatusFilter !== 'ALL' && resStatus !== resStatusFilter) return false;
      if (typeFilter !== 'ALL' && res.slot_type !== typeFilter) return false;

      if (q) {
        const matches =
          (res.client_name || '').toLowerCase().includes(q) ||
          (res.client_email || '').toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      const diff = new Date(a.slot_start).getTime() - new Date(b.slot_start).getTime();
      return sortOrder === 'asc' ? diff : -diff;
    });

    return list;
  }, [allReservations, resStatusFilter, typeFilter, searchQuery, sortOrder, nowMs]);

  const activeItems = viewMode === 'reservations' ? filteredReservations : filteredSlots;
  const totalPages = Math.max(1, Math.ceil(activeItems.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedItems = activeItems.slice((safePage - 1) * pageSize, safePage * pageSize);

  const selectedSlot = useMemo(
    () => slots.find((s) => s.id === selectedSlotId) || null,
    [slots, selectedSlotId]
  );

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchQuery.trim()) count += 1;
    if (typeFilter !== 'ALL') count += 1;
    if (viewMode === 'reservations') {
      if (resStatusFilter !== 'ACTIVE') count += 1;
    } else if (occupancyFilter !== 'ALL') {
      count += 1;
    }
    return count;
  }, [searchQuery, typeFilter, viewMode, resStatusFilter, occupancyFilter]);

  const resetFilters = () => {
    setOccupancyFilter('ALL');
    setResStatusFilter('ACTIVE');
    setTypeFilter('ALL');
    setSearchQuery('');
    setSortOrder(viewMode === 'archive' ? 'desc' : 'asc');
    setCurrentPage(1);
  };

  const handleSwitchViewMode = (nextMode) => {
    setViewMode(nextMode);
    setSelectedSlotId(null);
    setCurrentPage(1);
    setSortOrder(nextMode === 'archive' ? 'desc' : 'asc');
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Zwięzły pasek nagłówka z przełącznikiem Lista vs Tydzień (09:00–22:00) */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900">
          Grafik dyżurów
        </h1>

        <div className="flex items-center gap-2">
          <div
            role="group"
            aria-label="Przełącznik widoku grafiku"
            className="inline-flex bg-slate-200/80 p-1 rounded-lg border border-slate-200"
          >
            <button
              type="button"
              onClick={() => setDisplayLayout('list')}
              className={`inline-flex items-center gap-1.5 min-h-[36px] px-2.5 sm:px-3.5 py-1 rounded-md text-xs sm:text-sm font-semibold transition-colors ${
                displayLayout === 'list'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutList className="w-3.5 h-3.5" />
              <span>Lista</span>
            </button>
            <button
              type="button"
              onClick={() => setDisplayLayout('week')}
              className={`inline-flex items-center gap-1.5 min-h-[36px] px-2.5 sm:px-3.5 py-1 rounded-md text-xs sm:text-sm font-semibold transition-colors ${
                displayLayout === 'week'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CalendarRange className="w-3.5 h-3.5" />
              <span>Tydzień (09:00–22:00)</span>
            </button>
          </div>

          <button
            type="button"
            onClick={fetchSlots}
            disabled={loading}
            aria-label="Odśwież grafik"
            className="inline-flex items-center justify-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs sm:text-sm font-medium hover:bg-slate-50 active:bg-slate-100 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Odśwież</span>
          </button>
        </div>
      </div>

      {/* Zwarty, jednolinijkowy pasek statystyk (grid 3-kolumnowy) */}
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

      {/* Panel szczegółów i zarządzania wybranym dyżurem (wspólny dla widoku Tygodnia oraz Listy) */}
      {selectedSlot && (displayLayout === 'week' || viewMode !== 'reservations') && (
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

      {/* WIDOK OSI CZASU: SIATKA TYGODNIOWA 09:00 – 22:00 */}
      {displayLayout === 'week' && (
        <InstructorWeekTimeline
          slots={slots}
          nowMs={nowMs}
          selectedSlotId={selectedSlotId}
          onSelectSlot={setSelectedSlotId}
        />
      )}

      {/* WIDOK LISTY: ZAKŁADKI + FILTRY + TABELA/KARTY */}
      {displayLayout === 'list' && (
        <>
      {/* Pasek zakładek (Nadchodzące / Rezerwacje / Archiwum) + przycisk akordeonu „Filtruj listę” na mobile */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex bg-slate-200/80 p-1 rounded-lg border border-slate-200 overflow-x-auto max-w-full">
            <button
              type="button"
              onClick={() => handleSwitchViewMode('upcoming')}
              className={`min-h-[38px] px-3 sm:px-4 py-1.5 rounded-md text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors ${
                viewMode === 'upcoming'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Nadchodzące
            </button>
            <button
              type="button"
              onClick={() => handleSwitchViewMode('reservations')}
              className={`min-h-[38px] px-3 sm:px-4 py-1.5 rounded-md text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors ${
                viewMode === 'reservations'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Rezerwacje ({stats.activeReservations})
            </button>
            <button
              type="button"
              onClick={() => handleSwitchViewMode('archive')}
              className={`min-h-[38px] px-3 sm:px-4 py-1.5 rounded-md text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors ${
                viewMode === 'archive'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Archiwum
            </button>
          </div>

          {/* Przycisk akordeonu filtrów na mobile (< 768px) */}
          <button
            type="button"
            onClick={() => setMobileFiltersOpen((prev) => !prev)}
            aria-expanded={mobileFiltersOpen}
            className={`md:hidden inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-lg border text-xs font-semibold shrink-0 transition-colors ${
              mobileFiltersOpen || activeFilterCount > 0
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-300'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Filtruj listę</span>
            {activeFilterCount > 0 && (
              <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-emerald-500 text-white text-[10px] font-bold">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Panel filtrów (zawsze widoczny na desktopie >= 768px, rozwijany akordeon na mobile) */}
        <section
          className={`${
            mobileFiltersOpen ? 'block' : 'hidden'
          } md:block ${CARD_CLASS} p-4`}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label
                htmlFor="inst-search"
                className="block text-xs font-semibold text-slate-600 mb-1"
              >
                Szukaj uczestnika
              </label>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="inst-search"
                  type="search"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Imię, nazwisko lub e-mail..."
                  className={`${INPUT_CLASS} pl-10 py-2 text-sm`}
                />
              </div>
            </div>

            {viewMode === 'reservations' ? (
              <div>
                <label
                  htmlFor="inst-res-status"
                  className="block text-xs font-semibold text-slate-600 mb-1"
                >
                  Status rezerwacji
                </label>
                <select
                  id="inst-res-status"
                  value={resStatusFilter}
                  onChange={(e) => {
                    setResStatusFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className={`${SELECT_CLASS} py-2 text-sm`}
                >
                  <option value="ACTIVE">Nadchodzące aktywne</option>
                  <option value="ALL">Wszystkie statusy</option>
                  <option value="COMPLETED">Zakończone</option>
                  <option value="CANCELLED">Anulowane</option>
                </select>
              </div>
            ) : (
              <div>
                <label
                  htmlFor="inst-occupancy"
                  className="block text-xs font-semibold text-slate-600 mb-1"
                >
                  Obłożenie dyżuru
                </label>
                <select
                  id="inst-occupancy"
                  value={occupancyFilter}
                  onChange={(e) => {
                    setOccupancyFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className={`${SELECT_CLASS} py-2 text-sm`}
                >
                  <option value="ALL">Wszystkie dyżury</option>
                  <option value="BOOKED">Tylko z zapisanym klientem</option>
                  <option value="FREE">Tylko wolne (bez zapisów)</option>
                  <option value="BLOCKED">Zablokowane</option>
                </select>
              </div>
            )}

            <div>
              <label
                htmlFor="inst-type"
                className="block text-xs font-semibold text-slate-600 mb-1"
              >
                Zarezerwowana usługa
              </label>
              <select
                id="inst-type"
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className={`${SELECT_CLASS} py-2 text-sm`}
              >
                <option value="ALL">Wszystkie usługi</option>
                <option value="INDIVIDUAL_1H">1h – Personalny</option>
                <option value="GROUP_1_5H">1.5h – Mała grupa</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="inst-sort"
                className="block text-xs font-semibold text-slate-600 mb-1"
              >
                Kolejność
              </label>
              <div className="relative">
                <ArrowUpDown className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <select
                  id="inst-sort"
                  value={sortOrder}
                  onChange={(e) => {
                    setSortOrder(e.target.value);
                    setCurrentPage(1);
                  }}
                  className={`${SELECT_CLASS} pl-10 py-2 text-sm`}
                >
                  <option value="asc">Od najbliższych nadchodzących</option>
                  <option value="desc">Od najpóźniejszych</option>
                </select>
              </div>
            </div>
          </div>

          {activeFilterCount > 0 && (
            <div className="mt-3 pt-2.5 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={resetFilters}
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 underline"
              >
                Wyczyść aktywne filtry
              </button>
            </div>
          )}
        </section>
      </div>

      {/* WIDOK 1 & ARCHIWUM: GRAFIK DYŻURÓW */}
      {(viewMode === 'upcoming' || viewMode === 'archive') && (
        <>
          {loading && slots.length === 0 ? (
            <div className={`${CARD_CLASS} p-10 text-center text-sm sm:text-base text-slate-500`}>
              Wczytywanie Twojego grafiku dyżurów...
            </div>
          ) : paginatedItems.length === 0 ? (
            <div className={`${CARD_CLASS} p-8 text-center space-y-3`}>
              <p className="text-base sm:text-lg font-semibold text-slate-800">
                {viewMode === 'archive'
                  ? 'Brak zakończonych dyżurów w archiwum'
                  : 'Brak nadchodzących dyżurów spełniających kryteria'}
              </p>
              {activeFilterCount > 0 && (
                <button type="button" onClick={resetFilters} className={BTN_SECONDARY}>
                  Wyczyść filtry
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Tabela Desktop (>= 768px) */}
              <div className={`hidden md:block ${CARD_CLASS} overflow-hidden`}>
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-600">
                    <tr>
                      <th className="py-3 px-5">Okno dyżuru (24h)</th>
                      <th className="py-3 px-4">Zarezerwowane treningi</th>
                      <th className="py-3 px-4">Zapisani</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-5 text-right">Zarządzanie</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-sm">
                    {paginatedItems.map((slot) => {
                      const status = computeSlotStatus(slot, nowMs);
                      const activeSessions = (slot.booked_sessions || []).filter(
                        (bs) => (bs.confirmed_reservations_count || 0) > 0
                      );
                      const confirmedCount = slot.confirmed_reservations_count || 0;
                      const hasActiveRes = confirmedCount > 0;
                      const isSelected = selectedSlotId === slot.id;

                      return (
                        <tr
                          key={slot.id}
                          className={`transition-colors ${
                            isSelected
                              ? 'bg-emerald-100/50'
                              : hasActiveRes
                                ? 'bg-emerald-50/40 hover:bg-emerald-50/70'
                                : 'hover:bg-slate-50/80'
                          }`}
                        >
                          <td className="py-3.5 px-5 whitespace-nowrap align-top">
                            <div className="font-semibold text-slate-900">
                              {formatSlotRange24(slot.start_time, slot.end_time)}
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              Dyżur • {formatDurationMinutes(slot.duration_minutes)}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 align-top">
                            {activeSessions.length > 0 ? (
                              <div className="space-y-1.5">
                                {activeSessions.map((bs) => {
                                  const names = (bs.reservations || [])
                                    .filter((r) => r.status === 'confirmed')
                                    .map((r) => r.client_name)
                                    .filter(Boolean)
                                    .join(', ');
                                  return (
                                    <div
                                      key={bs.id}
                                      className="flex flex-wrap items-center gap-1.5 text-xs bg-white border border-emerald-200 rounded-lg px-2.5 py-1.5 shadow-2xs"
                                    >
                                      <span className="font-mono font-bold text-emerald-800">
                                        {formatTime24(bs.start_time)}–{formatTime24(bs.end_time)}
                                      </span>
                                      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">
                                        {bs.slot_type === 'GROUP_1_5H'
                                          ? `Grupa 1.5h (${bs.confirmed_reservations_count}/${bs.max_capacity})`
                                          : 'Indywidualny 1h'}
                                      </span>
                                      {names && (
                                        <span className="font-medium text-slate-800 truncate max-w-[220px]">
                                          • {names}
                                        </span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400 italic">
                                Wolne okno (brak zapisów)
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 align-top whitespace-nowrap">
                            <span
                              className={`font-mono font-bold ${
                                hasActiveRes ? 'text-emerald-700' : 'text-slate-400'
                              }`}
                            >
                              {confirmedCount} os.
                            </span>
                          </td>
                          <td className="py-3.5 px-4 align-top">
                            <StatusBadge status={status} />
                          </td>
                          <td className="py-3.5 px-5 align-top">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setSelectedSlotId(isSelected ? null : slot.id)}
                                className={BTN_SECONDARY}
                              >
                                <Users className="w-4 h-4" />
                                <span>Szczegóły ({slot.reservations?.length || 0})</span>
                              </button>

                              {viewMode !== 'archive' && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleToggleBlock(slot)}
                                    className={BTN_SECONDARY}
                                  >
                                    {slot.is_blocked ? (
                                      <>
                                        <Unlock className="w-4 h-4" />
                                        <span>Odblokuj</span>
                                      </>
                                    ) : (
                                      <>
                                        <Lock className="w-4 h-4" />
                                        <span>Zablokuj</span>
                                      </>
                                    )}
                                  </button>

                                  <button
                                    type="button"
                                    disabled={hasActiveRes}
                                    title={
                                      hasActiveRes
                                        ? 'Nie można usunąć dyżuru z aktywną rezerwacją'
                                        : 'Usuń okno dyżuru'
                                    }
                                    onClick={() => handleDeleteSlot(slot)}
                                    className={BTN_DANGER}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                    <span>Usuń</span>
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Karty Mobile (< 768px) – wyraźne wyróżnienie kolorystyczne obsadzonych dyżurów */}
              <div className="md:hidden space-y-2.5">
                {paginatedItems.map((slot) => {
                  const activeSessions = (slot.booked_sessions || []).filter(
                    (bs) => (bs.confirmed_reservations_count || 0) > 0
                  );
                  const confirmedCount = slot.confirmed_reservations_count || 0;
                  const hasActiveRes = confirmedCount > 0;
                  const isSelected = selectedSlotId === slot.id;

                  const cardStyle = slot.is_blocked
                    ? 'bg-slate-50 border border-slate-300 opacity-85'
                    : hasActiveRes
                      ? 'bg-emerald-50/80 border border-emerald-300 border-l-4 border-l-emerald-600 shadow-sm'
                      : 'bg-white border border-slate-200 shadow-sm';

                  return (
                    <div key={slot.id} className={`rounded-xl p-3.5 space-y-2.5 ${cardStyle}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm sm:text-base font-bold text-slate-900 leading-tight">
                            {formatSlotRange24(slot.start_time, slot.end_time)}
                          </div>
                          <div className="text-xs text-slate-600 mt-0.5">
                            Dyżur • {formatDurationMinutes(slot.duration_minutes)}
                          </div>
                        </div>

                        {slot.is_blocked ? (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-900 border border-amber-200 shrink-0">
                            Zablokowany
                          </span>
                        ) : hasActiveRes ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-600 text-white shadow-sm shrink-0">
                            Zapisani: {confirmedCount} os.
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
                            Wolny dyżur
                          </span>
                        )}
                      </div>

                      {/* Zarezerwowane treningi wewnątrz okna dyżuru */}
                      {activeSessions.length > 0 && (
                        <div className="bg-white/95 border border-emerald-200 rounded-lg p-2.5 space-y-2">
                          {activeSessions.map((bs) => {
                            const sessionConfirmed = (bs.reservations || []).filter(
                              (r) => r.status === 'confirmed'
                            );
                            return (
                              <div
                                key={bs.id}
                                className="space-y-1 pb-2 last:pb-0 border-b last:border-b-0 border-emerald-100"
                              >
                                <div className="flex items-center justify-between gap-2 text-xs">
                                  <span className="font-mono font-bold text-emerald-800">
                                    {formatTime24(bs.start_time)} – {formatTime24(bs.end_time)}
                                  </span>
                                  <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold text-[11px]">
                                    {bs.slot_type === 'GROUP_1_5H'
                                      ? `Grupa 1.5h (${bs.confirmed_reservations_count}/${bs.max_capacity})`
                                      : 'Indywidualny 1h'}
                                  </span>
                                </div>

                                {sessionConfirmed.map((r) => (
                                  <div
                                    key={r.id}
                                    className="flex items-center justify-between gap-2 text-xs sm:text-sm"
                                  >
                                    <div className="flex items-center gap-1.5 font-semibold text-emerald-950 min-w-0">
                                      <UserCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                      <span className="truncate">
                                        {r.client_name || `Klient #${r.client_id}`}
                                      </span>
                                    </div>
                                    {r.needs_equipment && (
                                      <span className="text-[10px] font-semibold bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded shrink-0">
                                        Sprzęt
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setSelectedSlotId(isSelected ? null : slot.id)}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 active:bg-slate-100"
                        >
                          <Users className="w-3.5 h-3.5" />
                          <span>{isSelected ? 'Ukryj' : 'Uczestnicy'}</span>
                        </button>

                        {viewMode !== 'archive' && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleToggleBlock(slot)}
                              className="inline-flex items-center justify-center min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 active:bg-slate-100"
                            >
                              {slot.is_blocked ? 'Odblokuj' : 'Zablokuj'}
                            </button>

                            {!hasActiveRes && (
                              <button
                                type="button"
                                onClick={() => handleDeleteSlot(slot)}
                                aria-label="Usuń pusty dyżur"
                                className="inline-flex items-center justify-center min-h-[40px] px-3 py-1.5 rounded-lg border border-red-200 bg-white text-red-700 text-xs font-semibold hover:bg-red-50 active:bg-red-100"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      {/* WIDOK 2: LISTA REZERWACJI KLIENTÓW */}
      {viewMode === 'reservations' && (
        <>
          {paginatedItems.length === 0 ? (
            <div className={`${CARD_CLASS} p-8 text-center space-y-3`}>
              <p className="text-base sm:text-lg font-semibold text-slate-800">
                Brak rezerwacji spełniających wybrane kryteria
              </p>
              {activeFilterCount > 0 && (
                <button type="button" onClick={resetFilters} className={BTN_SECONDARY}>
                  Wyczyść filtry
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Tabela Desktop */}
              <div className={`hidden md:block ${CARD_CLASS} overflow-hidden`}>
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-600">
                    <tr>
                      <th className="py-3 px-5">Termin zajęć</th>
                      <th className="py-3 px-4">Klient</th>
                      <th className="py-3 px-4">Typ</th>
                      <th className="py-3 px-4">Sprzęt</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-5 text-right">Dziennik postępów</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-sm">
                    {paginatedItems.map((res) => {
                      const status = computeReservationStatus(res, res.slot_end, nowMs);
                      return (
                        <tr key={res.id} className="hover:bg-slate-50/80">
                          <td className="py-3.5 px-5 font-semibold text-slate-900 whitespace-nowrap">
                            <div>{formatSlotRange24(res.slot_start, res.slot_end)}</div>
                            <div className="text-xs text-slate-500 font-normal">
                              Złożono: {formatDateTime24(res.created_at)}
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-slate-900">
                              {res.client_name || `Klient #${res.client_id}`}
                            </div>
                            <div className="text-xs text-slate-500">
                              {res.client_email || `ID: #${res.client_id}`}
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="inline-block bg-slate-100 border border-slate-200 text-slate-800 text-xs font-semibold px-2.5 py-1 rounded-md">
                              {slotTypeShortLabel(res.slot_type)}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-sm">
                            {res.needs_equipment ? (
                              <span className="font-semibold text-amber-900 bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-md text-xs">
                                Wypożyczenie{res.client_shoe_size ? ` (EU ${res.client_shoe_size})` : ''}
                              </span>
                            ) : (
                              <span className="text-slate-600">Własny</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4">
                            <StatusBadge status={status} />
                          </td>
                          <td className="py-3.5 px-5 text-right">
                            <Link
                              to={`/app/instructor/progress?clientId=${res.client_id}&clientName=${encodeURIComponent(
                                res.client_name || ''
                              )}`}
                              className={BTN_SECONDARY}
                            >
                              <TrendingUp className="w-4 h-4 text-emerald-600" />
                              <span>Dodaj wpis</span>
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Karty Mobile */}
              <div className="md:hidden space-y-2.5">
                {paginatedItems.map((res) => {
                  const status = computeReservationStatus(res, res.slot_end, nowMs);
                  return (
                    <div
                      key={res.id}
                      className="rounded-xl p-3.5 space-y-2.5 bg-emerald-50/70 border border-emerald-300 border-l-4 border-l-emerald-600 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-slate-900 truncate">
                            {res.client_name || `Klient #${res.client_id}`}
                          </div>
                          <div className="text-xs text-slate-600 truncate">{res.client_email}</div>
                        </div>
                        <StatusBadge status={status} />
                      </div>

                      <div className="text-xs sm:text-sm text-slate-700 space-y-1 pt-2 border-t border-emerald-200/70">
                        <div className="font-semibold text-slate-900">
                          {formatSlotRange24(res.slot_start, res.slot_end)}
                        </div>
                        <div className="flex items-center justify-between">
                          <span>{slotTypeShortLabel(res.slot_type)}</span>
                          <span>
                            Sprzęt:{' '}
                            <strong>{res.needs_equipment ? 'Wypożyczenie' : 'Własny'}</strong>
                          </span>
                        </div>
                      </div>

                      <Link
                        to={`/app/instructor/progress?clientId=${res.client_id}&clientName=${encodeURIComponent(
                          res.client_name || ''
                        )}`}
                        className="w-full inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 py-1.5 rounded-lg border border-emerald-300 bg-white text-emerald-800 text-xs font-semibold hover:bg-emerald-50"
                      >
                        <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Dodaj wpis w Dzienniku postępów</span>
                      </Link>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      <Pagination
        totalItems={activeItems.length}
        pageSize={pageSize}
        currentPage={safePage}
        onPageChange={setCurrentPage}
        onPageSizeChange={setPageSize}
      />
        </>
      )}
    </div>
  );
}
