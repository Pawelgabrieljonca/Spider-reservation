import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  Calendar as CalendarIcon,
  CalendarCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Footprints,
  LogIn,
  Phone,
  Plus,
  Sparkles,
  User,
  Users,
  X,
} from 'lucide-react';
import apiClient from '../../api/client';
import { useAuth } from '../../auth/useAuth';
import ClientReservationsView from '../../components/ClientReservationsView';
import SEO from '../../components/SEO';
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  CARD_CLASS,
  INPUT_CLASS,
  SELECT_CLASS,
} from '../../styles/ui';
import {
  formatTime24,
  toLocalDateInputValue,
  toLocalIsoWithOffset,
} from '../../utils/dateUtils';
import { extractApiError } from '../../utils/grades';

const POLISH_MONTHS = [
  'Styczeń',
  'Luty',
  'Marzec',
  'Kwiecień',
  'Maj',
  'Czerwiec',
  'Lipiec',
  'Sierpień',
  'Wrzesień',
  'Październik',
  'Listopad',
  'Grudzień',
];

const WEEKDAY_HEADERS = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Ndz'];

const SERVICE_OPTIONS = [
  {
    id: 'INDIVIDUAL_1H',
    title: 'Trening indywidualny',
    subtitle: 'Czas: 60 min • Limit: 1 os.',
    icon: User,
  },
  {
    id: 'GROUP_1_5H',
    title: 'Trening w małej grupie',
    subtitle: 'Czas: 90 min • Limit: 3 os.',
    icon: Users,
  },
];

const INSTRUCTOR_PROFILES = {
  'tomasz kowalski': {
    photo:
      'https://images.unsplash.com/photo-1522163182402-834f871fd851?auto=format&fit=crop&w=400&q=80',
    roleLabel: 'Instruktor wspinaczki sportowej',
  },
  'marta nowak': {
    photo:
      'https://images.unsplash.com/photo-1564769662533-4f00a87b4056?auto=format&fit=crop&w=400&q=80',
    roleLabel: 'Instruktorka boulderingu',
  },
  'piotr wiśniewski': {
    photo:
      'https://images.unsplash.com/photo-1516592673884-4a382d1124c2?auto=format&fit=crop&w=400&q=80',
    roleLabel: 'Instruktor rekreacji i sekcji młodzieżowych',
  },
  'karolina zielińska': {
    photo:
      'https://images.unsplash.com/photo-1601224748193-d24f166b5c77?auto=format&fit=crop&w=400&q=80',
    roleLabel: 'Instruktorka techniki i kursów asekuracji',
  },
  'michał lewandowski': {
    photo:
      'https://images.unsplash.com/photo-1507034589631-9433cc6bc453?auto=format&fit=crop&w=400&q=80',
    roleLabel: 'Trener przygotowania motorycznego',
  },
  'anna kaczmarek': {
    photo:
      'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=400&q=80',
    roleLabel: 'Trenerka sekcji wspinaczkowych',
  },
};

function serviceFullName(slotType) {
  if (slotType === 'INDIVIDUAL_1H') return 'Trening indywidualny (60 min)';
  if (slotType === 'GROUP_1_5H') return 'Trening w małej grupie (90 min)';
  return slotType || 'Trening wspinaczkowy';
}

function formatTimeRangeExact(startIso, endIso) {
  if (!startIso) return '—';
  const start = formatTime24(startIso);
  const end = endIso ? formatTime24(endIso) : '';
  return end ? `${start} – ${end}` : start;
}

function formatLongPolishDate(isoOrDateKey) {
  if (!isoOrDateKey) return '—';
  const d = isoOrDateKey.includes('T')
    ? new Date(isoOrDateKey)
    : new Date(`${isoOrDateKey}T12:00:00`);
  return d.toLocaleDateString('pl-PL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function buildMonthIsoBounds(year, monthIndex) {
  const startLocal = new Date(year, monthIndex, 1, 0, 0, 0);
  const endExclusiveLocal = new Date(year, monthIndex + 1, 1, 0, 0, 0);
  return {
    date_from: toLocalIsoWithOffset(startLocal),
    date_to: toLocalIsoWithOffset(endExclusiveLocal),
  };
}

function buildCalendarCells(year, monthIndex) {
  const firstDay = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  // Konwersja z niedzieli=0..soboty=6 na poniedziałek=0..niedziela=6
  const startOffset = (firstDay.getDay() + 6) % 7;

  const cells = [];
  for (let i = 0; i < startOffset; i += 1) {
    cells.push(null);
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const mm = String(monthIndex + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    cells.push({
      day,
      dateKey: `${year}-${mm}-${dd}`,
    });
  }
  return cells;
}

function InstructorSummaryAvatar({ name, sizeClass = 'w-14 h-14' }) {
  const [failedSrc, setFailedSrc] = useState(null);
  const normalized = (name || '').trim().toLowerCase();
  const profile = INSTRUCTOR_PROFILES[normalized];
  const photoSrc = profile?.photo || null;

  const initials = (name || 'TR')
    .split(' ')
    .filter(Boolean)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  if (!photoSrc || failedSrc === photoSrc) {
    return (
      <div
        className={`${sizeClass} rounded-full bg-gradient-to-br from-slate-800 to-emerald-700 text-white flex items-center justify-center font-bold text-base tracking-wide shrink-0 shadow-sm`}
      >
        {initials}
      </div>
    );
  }

  return (
    <img
      src={photoSrc}
      alt={`Instruktor ${name}`}
      onError={() => setFailedSrc(photoSrc)}
      className={`${sizeClass} rounded-full object-cover border-2 border-emerald-100 shrink-0 shadow-sm`}
    />
  );
}

export default function ClientSchedulePage({ mode = 'slots' }) {
  const navigate = useNavigate();
  const { isAuthenticated, login, keycloak, clearSessionExpiredNotice } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const instructorFromUrl = searchParams.get('instructor') || '';
  const section = mode === 'reservations' ? 'reservations' : 'slots';

  const [todayInfo] = useState(() => {
    const now = new Date();
    return {
      year: now.getFullYear(),
      month: now.getMonth(),
      dateKey: toLocalDateInputValue(now),
      nowMs: now.getTime(),
    };
  });

  const [slots, setSlots] = useState([]);
  const [knownInstructors, setKnownInstructors] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [loadingReservations, setLoadingReservations] = useState(isAuthenticated);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [nowMs, setNowMs] = useState(todayInfo.nowMs);

  // Krok 1 rezerwacji (Booksy/Calendly): wybór typu usługi determinujący czas trwania (60 lub 90 min)
  const [selectedServiceType, setSelectedServiceType] = useState('INDIVIDUAL_1H');

  // Stan kalendarza miesięcznego i wyboru godziny
  const [viewMonth, setViewMonth] = useState(() => ({
    year: todayInfo.year,
    month: todayInfo.month,
  }));
  const [selectedDateKey, setSelectedDateKey] = useState(null);
  const [selectedSlotId, setSelectedSlotId] = useState(null);
  const [needsEquipment, setNeedsEquipment] = useState(false);
  const [contactPhone, setContactPhone] = useState('');
  const [clientProfile, setClientProfile] = useState(null);
  const [confirmedReservationModal, setConfirmedReservationModal] = useState(null);

  // Filtr instruktora w kalendarzu oraz filtry w zakładce „Moje rezerwacje”
  const [prevInstructorUrl, setPrevInstructorUrl] = useState(instructorFromUrl);
  const [instructorFilter, setInstructorFilter] = useState(instructorFromUrl);

  if (instructorFromUrl !== prevInstructorUrl) {
    setPrevInstructorUrl(instructorFromUrl);
    setInstructorFilter(instructorFromUrl);
    setSelectedSlotId(null);
  }

  // Pobieranie rezerwacji oraz profilu wspinacza zalogowanego klienta
  useEffect(() => {
    if (!isAuthenticated) return undefined;

    let active = true;
    apiClient
      .get('/api/v1/client/reservations')
      .then((res) => {
        if (!active) return;
        setReservations(Array.isArray(res.data) ? res.data : []);
        setNowMs(Date.now());
      })
      .catch((err) => {
        if (active) setErrorMsg(extractApiError(err, 'Błąd pobierania Twoich rezerwacji.'));
      })
      .finally(() => {
        if (active) setLoadingReservations(false);
      });

    apiClient
      .get('/api/v1/client/profile')
      .then((res) => {
        if (!active) return;
        const prof = res.data || {};
        setClientProfile(prof);
        if (prof.phone_number) {
          setContactPhone((prev) => prev || prof.phone_number);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [isAuthenticated]);

  // Dynamiczne pobieranie dostępnych godzin startu dla wybranego miesiąca i wybranej usługi (60 min / 90 min)
  useEffect(() => {
    let active = true;
    const bounds = buildMonthIsoBounds(viewMonth.year, viewMonth.month);

    apiClient
      .get('/api/v1/client/slots', {
        params: {
          date_from: bounds.date_from,
          date_to: bounds.date_to,
          slot_type: selectedServiceType,
          only_free: true,
        },
      })
      .then((res) => {
        if (!active) return;
        const fetched = Array.isArray(res.data) ? res.data : [];
        setSlots(fetched);
        setKnownInstructors((prev) => {
          const next = new Set(prev);
          for (const item of fetched) {
            if (item.instructor_name) next.add(item.instructor_name);
          }
          return Array.from(next).sort((a, b) => a.localeCompare(b, 'pl'));
        });
        setNowMs(Date.now());
      })
      .catch((err) => {
        if (active) setErrorMsg(extractApiError(err, 'Błąd pobierania dostępnych terminów.'));
      })
      .finally(() => {
        if (active) setLoadingSlots(false);
      });

    return () => {
      active = false;
    };
  }, [viewMonth.year, viewMonth.month, selectedServiceType]);

  const handleManualRefresh = useCallback(async () => {
    setLoadingSlots(true);
    if (isAuthenticated) {
      setLoadingReservations(true);
    }
    setErrorMsg(null);
    try {
      const bounds = buildMonthIsoBounds(viewMonth.year, viewMonth.month);
      const slotPromise = apiClient.get('/api/v1/client/slots', {
        params: {
          date_from: bounds.date_from,
          date_to: bounds.date_to,
          slot_type: selectedServiceType,
          only_free: true,
        },
      });
      const resPromise = isAuthenticated
        ? apiClient.get('/api/v1/client/reservations')
        : Promise.resolve(null);

      const [slotsRes, myRes] = await Promise.all([slotPromise, resPromise]);
      const fetched = Array.isArray(slotsRes?.data) ? slotsRes.data : [];
      setSlots(fetched);
      setKnownInstructors((prev) => {
        const next = new Set(prev);
        for (const item of fetched) {
          if (item.instructor_name) next.add(item.instructor_name);
        }
        return Array.from(next).sort((a, b) => a.localeCompare(b, 'pl'));
      });
      if (myRes?.data) {
        setReservations(Array.isArray(myRes.data) ? myRes.data : []);
      }
      setNowMs(Date.now());
    } catch (err) {
      setErrorMsg(extractApiError(err, 'Błąd odświeżania kalendarza rezerwacji.'));
    } finally {
      setLoadingSlots(false);
      setLoadingReservations(false);
    }
  }, [viewMonth.year, viewMonth.month, selectedServiceType, isAuthenticated]);

  // Rewalidacja w tle (bez spinnerów): rezerwacje klienta i wolne terminy bieżącego miesiąca
  const silentRefresh = useCallback(async () => {
    try {
      const bounds = buildMonthIsoBounds(viewMonth.year, viewMonth.month);
      const [slotsRes, myRes] = await Promise.all([
        apiClient.get('/api/v1/client/slots', {
          params: {
            date_from: bounds.date_from,
            date_to: bounds.date_to,
            slot_type: selectedServiceType,
            only_free: true,
          },
        }),
        isAuthenticated ? apiClient.get('/api/v1/client/reservations') : Promise.resolve(null),
      ]);
      setSlots(Array.isArray(slotsRes?.data) ? slotsRes.data : []);
      if (myRes?.data) {
        setReservations(Array.isArray(myRes.data) ? myRes.data : []);
      }
      setNowMs(Date.now());
    } catch {
      // Ciche pominięcie błędu tła – kolejna próba przy następnym cyklu
    }
  }, [viewMonth.year, viewMonth.month, selectedServiceType, isAuthenticated]);

  useEffect(() => {
    const revalidate = () => {
      if (document.visibilityState === 'visible') silentRefresh();
    };
    const intervalId = window.setInterval(revalidate, 30000);
    window.addEventListener('focus', revalidate);
    document.addEventListener('visibilitychange', revalidate);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', revalidate);
      document.removeEventListener('visibilitychange', revalidate);
    };
  }, [silentRefresh]);

  // Przedziały czasowe już potwierdzonych wizyt zalogowanego klienta (wykluczenie kolizji własnych)
  const clientReservedIntervals = useMemo(() => {
    const intervals = [];
    for (const r of reservations) {
      if (r.status === 'confirmed' && r.slot?.start_time && r.slot?.end_time) {
        intervals.push({
          startMs: new Date(r.slot.start_time).getTime(),
          endMs: new Date(r.slot.end_time).getTime(),
        });
      }
    }
    return intervals;
  }, [reservations]);

  // Lista unikalnych instruktorów dostępnych w wyborze
  const availableInstructorNames = useMemo(() => {
    const set = new Set(knownInstructors);
    for (const s of slots) {
      if (s.instructor_name) set.add(s.instructor_name);
    }
    if (instructorFilter) set.add(instructorFilter);
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pl'));
  }, [knownInstructors, slots, instructorFilter]);

  // Wolne opcje startu dla wybranej usługi po uwzględnieniu filtra instruktora i kolizji klienta
  const bookableSlots = useMemo(() => {
    const q = instructorFilter.trim().toLowerCase();
    return slots
      .filter((slot) => {
        if (slot.free_places <= 0) return false;
        if (slot.slot_type !== selectedServiceType) return false;
        if (q && !(slot.instructor_name || '').toLowerCase().includes(q)) return false;

        const candStart = new Date(slot.start_time).getTime();
        const candEnd = new Date(slot.end_time).getTime();
        const overlapsOwn = clientReservedIntervals.some(
          (iv) => candStart < iv.endMs && candEnd > iv.startMs
        );
        if (overlapsOwn) return false;

        return true;
      })
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  }, [slots, selectedServiceType, instructorFilter, clientReservedIntervals]);

  // Mapa: YYYY-MM-DD -> posortowana tablica dostępnych godzin startu tego dnia
  const slotsByDateKey = useMemo(() => {
    const map = new Map();
    for (const slot of bookableSlots) {
      const localDateKey = toLocalDateInputValue(new Date(slot.start_time));
      const arr = map.get(localDateKey) || [];
      arr.push(slot);
      map.set(localDateKey, arr);
    }
    return map;
  }, [bookableSlots]);

  const calendarCells = useMemo(
    () => buildCalendarCells(viewMonth.year, viewMonth.month),
    [viewMonth.year, viewMonth.month]
  );

  // Efektywnie zaznaczony dzień (tylko jeśli ma wolne terminy dla wybranej usługi)
  const activeSelectedDateKey = useMemo(() => {
    if (selectedDateKey && slotsByDateKey.has(selectedDateKey)) {
      return selectedDateKey;
    }
    return null;
  }, [selectedDateKey, slotsByDateKey]);

  // Lista dostępnych godzin startu dla wybranego dnia
  const slotsForSelectedDay = useMemo(() => {
    if (!activeSelectedDateKey) return [];
    return slotsByDateKey.get(activeSelectedDateKey) || [];
  }, [activeSelectedDateKey, slotsByDateKey]);

  // Sprawdzenie, czy w wybranym dniu kilku instruktorów ma tę samą godzinę startu
  const duplicateStartTimesInDay = useMemo(() => {
    const counts = {};
    for (const s of slotsForSelectedDay) {
      const t = formatTime24(s.start_time);
      counts[t] = (counts[t] || 0) + 1;
    }
    return counts;
  }, [slotsForSelectedDay]);

  // Zaznaczony wariant terminu
  const selectedSlot = useMemo(() => {
    if (!activeSelectedDateKey || !selectedSlotId) return null;
    return slotsForSelectedDay.find((s) => s.id === selectedSlotId) || null;
  }, [activeSelectedDateKey, selectedSlotId, slotsForSelectedDay]);

  const canGoPrevMonth =
    viewMonth.year > todayInfo.year ||
    (viewMonth.year === todayInfo.year && viewMonth.month > todayInfo.month);

  // Maksymalne wyprzedzenie nawigacji miesięcznej (12 miesięcy w przód)
  const canGoNextMonth =
    (viewMonth.year - todayInfo.year) * 12 + (viewMonth.month - todayInfo.month) < 12;

  const handleSelectServiceType = (nextType) => {
    if (nextType === selectedServiceType) return;
    setLoadingSlots(true);
    setSelectedServiceType(nextType);
    setSelectedSlotId(null);
    setErrorMsg(null);
  };

  const handlePrevMonth = () => {
    if (!canGoPrevMonth) return;
    setLoadingSlots(true);
    setSelectedDateKey(null);
    setSelectedSlotId(null);
    setViewMonth((prev) => {
      if (prev.month === 0) return { year: prev.year - 1, month: 11 };
      return { year: prev.year, month: prev.month - 1 };
    });
  };

  const handleNextMonth = () => {
    if (!canGoNextMonth) return;
    setLoadingSlots(true);
    setSelectedDateKey(null);
    setSelectedSlotId(null);
    setViewMonth((prev) => {
      if (prev.month === 11) return { year: prev.year + 1, month: 0 };
      return { year: prev.year, month: prev.month + 1 };
    });
  };

  const handleSelectDay = (dateKey) => {
    if (!slotsByDateKey.has(dateKey)) return;
    setSelectedDateKey(dateKey);
    setSelectedSlotId(null);
    setErrorMsg(null);
  };

  const handleSelectTimeSlot = (slotId) => {
    setSelectedSlotId(slotId);
    setErrorMsg(null);
  };

  const handleClearInstructorFilter = () => {
    setInstructorFilter('');
    setSelectedSlotId(null);
    if (instructorFromUrl) {
      const next = new URLSearchParams(searchParams);
      next.delete('instructor');
      setSearchParams(next, { replace: true });
    }
  };

  const handleBookSelectedSlot = async () => {
    if (!isAuthenticated) {
      clearSessionExpiredNotice?.();
      login({ redirectUri: window.location.href });
      return;
    }
    if (!selectedSlot || isSubmitting) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsSubmitting(true);

    const slotSnapshot = { ...selectedSlot };
    const equipmentSnapshot = needsEquipment;

    try {
      const trimmedPhone = contactPhone.trim();
      const res = await apiClient.post('/api/v1/client/reservations', {
        availability_window_id: selectedSlot.availability_window_id,
        start_time: selectedSlot.start_time,
        slot_type: selectedSlot.slot_type,
        needs_equipment: equipmentSnapshot,
        phone_number: trimmedPhone || null,
      });

      if (trimmedPhone) {
        setClientProfile((prev) => ({ ...(prev || {}), phone_number: trimmedPhone }));
      }

      setConfirmedReservationModal({
        reservationId: res.data?.id,
        serviceName: serviceFullName(slotSnapshot.slot_type),
        dateLabel: formatLongPolishDate(slotSnapshot.start_time),
        timeRange: formatTimeRangeExact(slotSnapshot.start_time, slotSnapshot.end_time),
        instructorName: slotSnapshot.instructor_name,
        needsEquipment: equipmentSnapshot,
      });

      setSelectedSlotId(null);
      setNeedsEquipment(false);
      window.dispatchEvent(new Event('spider:notifications-refresh'));
      await handleManualRefresh();
    } catch (err) {
      setErrorMsg(extractApiError(err, 'Nie udało się zarezerwować wybranego terminu.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Potwierdzenie anulowania odbywa się w modalu widoku rezerwacji (ClientReservationsView).
  const handleCancelReservation = async (reservationId) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await apiClient.delete(`/api/v1/client/reservations/${reservationId}`);
      setSuccessMsg('Rezerwacja odwołana. Zwolniony termin wrócił do ogólnego grafiku.');
      window.dispatchEvent(new Event('spider:notifications-refresh'));
      await silentRefresh();
    } catch (err) {
      setErrorMsg(extractApiError(err, 'Nie udało się anulować rezerwacji.'));
    }
  };

  const handleUpdateEquipment = async (reservationId, needsEquipmentValue) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await apiClient.patch(`/api/v1/client/reservations/${reservationId}`, {
        needs_equipment: needsEquipmentValue,
      });
      setSuccessMsg(
        needsEquipmentValue
          ? 'Zapisano: wypożyczenie butów i uprzęży na ten trening.'
          : 'Zapisano: przychodzisz z własnym sprzętem.'
      );
      await silentRefresh();
    } catch (err) {
      setErrorMsg(extractApiError(err, 'Nie udało się zmienić zapotrzebowania na sprzęt.'));
    }
  };

  const selectedInstructorMeta = selectedSlot
    ? INSTRUCTOR_PROFILES[(selectedSlot.instructor_name || '').trim().toLowerCase()]
    : null;

  return (
    <div className={`space-y-5 ${section === 'slots' ? 'pb-28 md:pb-4' : ''}`}>
      <SEO
        title={
          section === 'reservations'
            ? 'Moje Rezerwacje | Panel Klienta CW Spider'
            : 'Grafik Treningów i Terminy | CW Spider Bydgoszcz'
        }
        description={
          section === 'reservations'
            ? 'Zarządzaj swoimi rezerwacjami treningów wspinaczkowych w Centrum Wspinaczkowym Spider. Podgląd nadchodzących terminów i historia sesji.'
            : 'Sprawdź aktualny grafik i wolne terminy treningów wspinaczkowych w Centrum Wspinaczkowym Spider Bydgoszcz. Wybierz datę i zarezerwuj sesję z instruktorem.'
        }
        path={section === 'reservations' ? '/app/client/reservations' : '/terminy'}
        robots={section === 'reservations' ? 'noindex, nofollow' : 'index, follow'}
      />
      {/* Zwięzły nagłówek widoku */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900">
          {section === 'reservations'
            ? 'Moje rezerwacje'
            : 'Zarezerwuj trening'}
        </h1>

        {section === 'reservations' && (
          <Link to="/app/client" className={BTN_PRIMARY}>
            <Plus className="w-4 h-4" />
            <span>
              <span className="hidden sm:inline">Zarezerwuj kolejny trening</span>
              <span className="sm:hidden">Zarezerwuj</span>
            </span>
          </Link>
        )}
      </div>

      {/* Komunikaty błędów / sukcesu */}
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-3.5 flex items-center justify-between gap-3 text-base">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            aria-label="Zamknij komunikat błędu"
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg hover:bg-red-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl px-4 py-3.5 flex items-center justify-between gap-3 text-base">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMsg(null)}
            aria-label="Zamknij komunikat"
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg hover:bg-emerald-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* =======================================================================
          WIDOK 1: KALENDARZ REZERWACYJNY (STANDARD BOOKSY / CALENDLY)
         ======================================================================= */}
      {section === 'slots' && (
        <>
          {/* Krok 1: Wybór rodzaju usługi (1h vs 1.5h) + opcjonalny wybór instruktora */}
          <section className={`${CARD_CLASS} p-4 sm:p-5 space-y-4`}>
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex-1 space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  1. Wybierz rodzaj treningu
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {SERVICE_OPTIONS.map((service) => {
                    const Icon = service.icon;
                    const isActive = selectedServiceType === service.id;
                    return (
                      <button
                        key={service.id}
                        type="button"
                        onClick={() => handleSelectServiceType(service.id)}
                        aria-pressed={isActive}
                        className={`text-left p-3.5 rounded-xl border-2 transition-all flex items-start gap-3 min-h-[64px] ${
                          isActive
                            ? 'border-emerald-600 bg-emerald-50/70 shadow-sm'
                            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60'
                        }`}
                      >
                        <div
                          className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                            isActive
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm sm:text-base font-bold text-slate-900 leading-snug">
                            {service.title}
                          </div>
                          <div className="text-xs text-slate-600 mt-0.5">{service.subtitle}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="lg:w-72 space-y-2">
                <label
                  htmlFor="client-instructor-select"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-500"
                >
                  Prowadzący instruktor
                </label>
                <div className="flex items-center gap-2">
                  <select
                    id="client-instructor-select"
                    value={instructorFilter}
                    onChange={(e) => {
                      setInstructorFilter(e.target.value);
                      setSelectedSlotId(null);
                    }}
                    className={SELECT_CLASS}
                  >
                    <option value="">Dowolny instruktor</option>
                    {availableInstructorNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                  {instructorFilter && (
                    <button
                      type="button"
                      onClick={handleClearInstructorFilter}
                      title="Wyczyść filtr instruktora"
                      className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Główny układ 2-kolumnowy na desktopie, 1 pionowy ciąg na mobile */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* LEWA KOLUMNA (GÓRA + ŚRODEK): Miesięczny kalendarz + Poziomy pasek godzin */}
            <div className="lg:col-span-7 space-y-6">
              {/* 2. Miesięczny kalendarz */}
              <section className={`${CARD_CLASS} p-5 sm:p-6`}>
                {/* Nawigacja miesiącami */}
                <div className="flex items-center justify-between gap-4 mb-6">
                  <button
                    type="button"
                    onClick={handlePrevMonth}
                    disabled={!canGoPrevMonth || loadingSlots}
                    aria-label="Poprzedni miesiąc"
                    className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3.5 rounded-xl border border-slate-200 bg-white text-slate-700 font-medium text-sm hover:bg-slate-50 active:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5" />
                    <span className="hidden sm:inline">Poprzedni</span>
                  </button>

                  <div className="text-center">
                    <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
                      {POLISH_MONTHS[viewMonth.month]} {viewMonth.year}
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {loadingSlots
                        ? 'Wyliczanie wolnych godzin...'
                        : `Dostępne dni (${selectedServiceType === 'GROUP_1_5H' ? '90 min' : '60 min'}): ${slotsByDateKey.size}`}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleNextMonth}
                    disabled={!canGoNextMonth || loadingSlots}
                    aria-label="Następny miesiąc"
                    className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3.5 rounded-xl border border-slate-200 bg-white text-slate-700 font-medium text-sm hover:bg-slate-50 active:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <span className="hidden sm:inline">Następny</span>
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>

                {/* Nagłówki dni tygodnia */}
                <div className="grid grid-cols-7 gap-1 mb-2 text-center">
                  {WEEKDAY_HEADERS.map((dayName) => (
                    <div
                      key={dayName}
                      className="py-2 text-xs font-semibold uppercase tracking-wider text-slate-400"
                    >
                      {dayName}
                    </div>
                  ))}
                </div>

                {/* Siatka dni miesiąca */}
                <div className="grid grid-cols-7 gap-y-2 gap-x-1">
                  {calendarCells.map((cell, idx) => {
                    if (!cell) {
                      return <div key={`empty-${idx}`} className="h-12 sm:h-14" />;
                    }

                    const daySlots = slotsByDateKey.get(cell.dateKey) || [];
                    const hasFreeSlots = daySlots.length > 0;
                    const isSelected = activeSelectedDateKey === cell.dateKey;
                    const isToday = cell.dateKey === todayInfo.dateKey;

                    return (
                      <div key={cell.dateKey} className="flex items-center justify-center">
                        <button
                          type="button"
                          disabled={!hasFreeSlots}
                          onClick={() => handleSelectDay(cell.dateKey)}
                          aria-label={`${cell.day} ${POLISH_MONTHS[viewMonth.month]} ${viewMonth.year}${
                            hasFreeSlots
                              ? `, dostępnych godzin startu: ${daySlots.length}`
                              : ', brak wolnych terminów'
                          }`}
                          aria-pressed={isSelected}
                          className={`relative w-11 h-11 sm:w-12 sm:h-12 rounded-full flex flex-col items-center justify-center transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                            isSelected
                              ? 'bg-emerald-600 text-white font-bold shadow-md ring-4 ring-emerald-100 scale-105'
                              : hasFreeSlots
                                ? 'bg-white text-slate-900 font-semibold border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/60 cursor-pointer'
                                : 'text-slate-300 bg-slate-50/60 cursor-not-allowed font-normal'
                          }`}
                        >
                          <span className="text-sm sm:text-base leading-none">{cell.day}</span>

                          {/* Wskaźnik (kropka) pod numerem dnia mającego wolne terminy */}
                          {hasFreeSlots && (
                            <span
                              className={`mt-1 w-1.5 h-1.5 rounded-full ${
                                isSelected ? 'bg-white' : 'bg-emerald-500'
                              }`}
                            />
                          )}

                          {!hasFreeSlots && isToday && (
                            <span className="mt-1 w-1 h-1 rounded-full bg-slate-300" />
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Legenda pod siatką */}
                <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-center sm:justify-start gap-5 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>Dostępne godziny</span>
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <span className="w-3.5 h-3.5 rounded-full bg-emerald-600 inline-block" />
                    <span>Wybrany dzień</span>
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <span className="w-3.5 h-3.5 rounded-full bg-slate-100 border border-slate-200 inline-block" />
                    <span>Brak wolnych miejsc</span>
                  </span>
                </div>
              </section>

              {/* 3. Pasek wyboru godziny rozpoczęcia */}
              <section className={`${CARD_CLASS} p-5 sm:p-6 space-y-4`}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-slate-900">
                      2. Wybierz godzinę rozpoczęcia
                    </h3>
                    <p className="text-sm text-slate-500 capitalize">
                      {activeSelectedDateKey
                        ? formatLongPolishDate(activeSelectedDateKey)
                        : 'Kliknij aktywny dzień w kalendarzu powyżej'}
                    </p>
                  </div>
                  {activeSelectedDateKey && (
                    <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full shrink-0">
                      {slotsForSelectedDay.length}{' '}
                      {slotsForSelectedDay.length === 1 ? 'godzina' : 'godzin'}
                    </span>
                  )}
                </div>

                {!activeSelectedDateKey ? (
                  <div className="py-6 px-4 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-center text-sm sm:text-base text-slate-500">
                    Wybierz dzień oznaczony zieloną kropką w kalendarzu, aby zobaczyć dostępne
                    godziny rozpoczęcia.
                  </div>
                ) : (
                  <div
                    className="flex items-center gap-2.5 overflow-x-auto pb-2 pt-1 snap-x"
                    role="listbox"
                    aria-label="Dostępne godziny rozpoczęcia"
                  >
                    {slotsForSelectedDay.map((slot) => {
                      const timeStr = formatTime24(slot.start_time);
                      const isPicked = selectedSlot?.id === slot.id;
                      const showInstructorName = duplicateStartTimesInDay[timeStr] > 1;
                      const shortInstructor = (slot.instructor_name || '').split(' ')[0];

                      return (
                        <button
                          key={slot.id}
                          type="button"
                          role="option"
                          aria-selected={isPicked}
                          onClick={() => handleSelectTimeSlot(slot.id)}
                          className={`snap-start shrink-0 min-h-[46px] px-4 sm:px-5 py-2.5 rounded-full border text-sm sm:text-base font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                            isPicked
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-md ring-2 ring-emerald-200'
                              : slot.is_joining_group
                                ? 'bg-emerald-50/70 text-emerald-950 border-emerald-300 hover:border-emerald-500'
                                : 'bg-white text-slate-800 border-slate-300 hover:border-emerald-500 hover:bg-emerald-50/50'
                          }`}
                        >
                          <span>{timeStr}</span>
                          {slot.is_joining_group && (
                            <span
                              className={`ml-1.5 text-xs font-semibold ${
                                isPicked ? 'text-emerald-100' : 'text-emerald-700'
                              }`}
                            >
                              • Dołącz ({slot.free_places} wolne)
                            </span>
                          )}
                          {showInstructorName && (
                            <span
                              className={`ml-1.5 text-xs font-normal ${
                                isPicked ? 'text-emerald-100' : 'text-slate-500'
                              }`}
                            >
                              • {shortInstructor}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>

            {/* PRAWA KOLUMNA (DÓŁ / PRAWA STRONA): Karta podsumowania i akcji */}
            <aside className="lg:col-span-5 lg:sticky lg:top-24">
              <div className={`${CARD_CLASS} p-6 space-y-6`}>
                <div className="border-b border-slate-200 pb-4">
                  <h2 className="text-lg sm:text-xl font-extrabold text-slate-900">
                    Podsumowanie wizyty
                  </h2>
                  <p className="text-sm text-slate-500 mt-0.5">
                    Sprawdź szczegóły wybranego treningu przed rezerwacją.
                  </p>
                </div>

                {selectedSlot ? (
                  <div className="space-y-5">
                    {/* Usługa i dokładny przedział godzinowy */}
                    <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-4 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-base sm:text-lg font-bold text-slate-900">
                          {serviceFullName(selectedSlot.slot_type)}
                        </span>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-900 border border-emerald-200 shrink-0">
                          Wolne: {selectedSlot.free_places}/{selectedSlot.max_capacity}
                        </span>
                      </div>

                      {selectedSlot.is_joining_group && (
                        <div className="text-xs font-semibold text-emerald-800 bg-white/80 border border-emerald-200 rounded-lg px-2.5 py-1.5">
                          Dołączasz do otwartej grupy treningowej (zapisanych:{' '}
                          {selectedSlot.max_capacity - selectedSlot.free_places}/
                          {selectedSlot.max_capacity}).
                        </div>
                      )}

                      <div className="flex items-center gap-2 text-sm text-slate-700 capitalize">
                        <CalendarIcon className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>{formatLongPolishDate(selectedSlot.start_time)}</span>
                      </div>

                      <div className="flex items-center gap-2 text-base font-bold text-emerald-800">
                        <Clock className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>
                          {formatTimeRangeExact(selectedSlot.start_time, selectedSlot.end_time)}
                        </span>
                      </div>
                    </div>

                    {/* Instruktor (avatar/zdjęcie + imię i nazwisko) */}
                    <div className="flex items-center gap-4 p-4 rounded-xl border border-slate-200 bg-slate-50/70">
                      <InstructorSummaryAvatar name={selectedSlot.instructor_name} />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                          Prowadzący instruktor
                        </div>
                        <div className="text-base sm:text-lg font-bold text-slate-900 truncate">
                          {selectedSlot.instructor_name}
                        </div>
                        <div className="text-xs text-slate-600 mt-0.5">
                          {selectedInstructorMeta?.roleLabel || 'Certyfikowany instruktor CW Spider'}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-8 px-4 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-center space-y-2">
                    <CalendarIcon className="w-8 h-8 text-slate-400 mx-auto" />
                    <p className="text-base font-semibold text-slate-700">
                      Nie wybrano jeszcze terminu
                    </p>
                    <p className="text-sm text-slate-500">
                      Wybierz rodzaj treningu, zaznacz dzień w kalendarzu i kliknij godzinę
                      rozpoczęcia, aby aktywować rezerwację.
                    </p>
                  </div>
                )}

                {/* Telefon z profilu oraz opcja wypożyczenia sprzętu z rozmiarem buta */}
                <div className="pt-2 border-t border-slate-200 space-y-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <label
                        htmlFor="booking-contact-phone"
                        className="flex items-center gap-1.5 text-xs font-semibold text-slate-700"
                      >
                        <Phone className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Telefon kontaktowy</span>
                      </label>
                      {isAuthenticated && (
                        <Link
                          to="/app/client/profile"
                          className="text-xs font-medium text-emerald-700 hover:text-emerald-900 underline"
                        >
                          Edytuj profil
                        </Link>
                      )}
                    </div>
                    <input
                      id="booking-contact-phone"
                      type="tel"
                      value={contactPhone}
                      disabled={!selectedSlot || isSubmitting || !isAuthenticated}
                      onChange={(e) => setContactPhone(e.target.value)}
                      placeholder={
                        isAuthenticated
                          ? 'np. +48 519 699 795'
                          : 'Wymagane zalogowanie'
                      }
                      maxLength={20}
                      className={`${INPUT_CLASS} py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400`}
                    />
                  </div>

                  <div className="rounded-xl border border-slate-200 overflow-hidden">
                    <label className="flex items-start gap-3 p-3.5 hover:bg-slate-50 cursor-pointer select-none transition-colors">
                      <input
                        type="checkbox"
                        checked={needsEquipment}
                        disabled={!selectedSlot || isSubmitting}
                        onChange={(e) => setNeedsEquipment(e.target.checked)}
                        className="mt-0.5 w-5 h-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 disabled:opacity-50"
                      />
                      <span className="text-sm sm:text-base font-medium text-slate-800 leading-snug">
                        Potrzebuję wypożyczyć sprzęt (uprząż, buty)
                      </span>
                    </label>

                    {needsEquipment && (
                      <div className="px-3.5 py-2.5 bg-amber-50/70 border-t border-amber-100 flex items-center justify-between gap-2 text-xs text-amber-950">
                        <span className="inline-flex items-center gap-1.5 font-medium">
                          <Footprints className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                          {isAuthenticated ? (
                            clientProfile?.shoe_size ? (
                              <span>
                                Rozmiar buta z Twojego profilu:{' '}
                                <strong>EU {clientProfile.shoe_size}</strong>
                              </span>
                            ) : (
                              <span>Nie zapisano jeszcze rozmiaru buta w profilu.</span>
                            )
                          ) : (
                            <span>Sprzęt dobierzesz na miejscu w recepcji obiektu.</span>
                          )}
                        </span>
                        {isAuthenticated && (
                          <Link
                            to="/app/client/profile"
                            className="font-semibold text-amber-900 underline shrink-0"
                          >
                            {clientProfile?.shoe_size ? 'Zmień' : 'Uzupełnij'}
                          </Link>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Przycisk CTA na desktopie (>= 768px) */}
                <div className="hidden md:block space-y-2">
                  {isAuthenticated ? (
                    <>
                      <button
                        type="button"
                        disabled={!selectedSlot || isSubmitting}
                        onClick={handleBookSelectedSlot}
                        className={`${BTN_PRIMARY} w-full py-3.5 text-base`}
                      >
                        <CalendarCheck className="w-5 h-5" />
                        <span>{isSubmitting ? 'Rezerwowanie terminu...' : 'Zarezerwuj termin'}</span>
                      </button>
                      <p className="text-xs text-center text-slate-500">
                        Bezpłatne odwołanie wizyty możliwe do 12h przed rozpoczęciem zajęć.
                      </p>
                    </>
                  ) : (
                    <div className="space-y-2.5 bg-slate-50 border border-slate-200 rounded-xl p-4 text-center">
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Przeglądasz terminy jako gość. Aby zarezerwować wybrany trening, zaloguj
                        się do swojego konta lub zarejestruj się.
                      </p>
                      <button
                        type="button"
                        disabled={!selectedSlot}
                        onClick={() => {
                          clearSessionExpiredNotice?.();
                          login({ redirectUri: window.location.href });
                        }}
                        className={`${BTN_PRIMARY} w-full py-3 text-sm flex items-center justify-center gap-2 disabled:opacity-50`}
                      >
                        <LogIn className="w-4 h-4" />
                        <span>
                          {selectedSlot
                            ? 'Zaloguj się, aby zarezerwować'
                            : 'Zaznacz termin, aby zarezerwować'}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          clearSessionExpiredNotice?.();
                          keycloak.register({ redirectUri: window.location.href });
                        }}
                        className="text-xs text-emerald-700 hover:text-emerald-800 font-semibold underline block mx-auto"
                      >
                        Nie masz konta? Zarejestruj się bezpłatnie
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </aside>
          </div>

          {/* Sticky Bottom Bar CTA na urządzeniach mobilnych (< 768px) */}
          <div className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-slate-200 px-4 py-3 shadow-[0_-4px_16px_rgba(15,23,42,0.08)]">
            <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
              <div className="min-w-0">
                {selectedSlot ? (
                  <>
                    <div className="text-xs font-semibold text-emerald-700 truncate">
                      {serviceFullName(selectedSlot.slot_type)}
                    </div>
                    <div className="text-sm font-bold text-slate-900 truncate">
                      {formatTimeRangeExact(selectedSlot.start_time, selectedSlot.end_time)} •{' '}
                      {selectedSlot.instructor_name}
                    </div>
                  </>
                ) : (
                  <div className="text-xs font-medium text-slate-500">
                    Zaznacz dzień i godzinę, aby zarezerwować
                  </div>
                )}
              </div>

              {isAuthenticated ? (
                <button
                  type="button"
                  disabled={!selectedSlot || isSubmitting}
                  onClick={handleBookSelectedSlot}
                  className={`${BTN_PRIMARY} shrink-0 px-5`}
                >
                  {isSubmitting ? 'Zapisywanie...' : 'Zarezerwuj termin'}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!selectedSlot}
                  onClick={() => {
                    clearSessionExpiredNotice?.();
                    login({ redirectUri: window.location.href });
                  }}
                  className={`${BTN_PRIMARY} shrink-0 px-4 text-xs sm:text-sm flex items-center gap-1.5 disabled:opacity-50`}
                >
                  <LogIn className="w-4 h-4" />
                  <span>Zaloguj się</span>
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* =======================================================================
          WIDOK 2: MOJE REZERWACJE
         ======================================================================= */}
      {section === 'reservations' && (
        <ClientReservationsView
          reservations={reservations}
          loading={loadingReservations}
          nowMs={nowMs}
          Avatar={InstructorSummaryAvatar}
          onCancel={handleCancelReservation}
          onUpdateEquipment={handleUpdateEquipment}
        />
      )}

      {/* =======================================================================
          MODAL POTWIERDZENIA REZERWACJI
         ======================================================================= */}
      {confirmedReservationModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="booking-confirm-title"
        >
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xl max-w-md w-full p-6 sm:p-7 space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div>
                  <h2
                    id="booking-confirm-title"
                    className="text-xl font-extrabold text-slate-900"
                  >
                    Rezerwacja potwierdzona!
                  </h2>
                  {confirmedReservationModal.reservationId && (
                    <p className="text-xs font-mono text-slate-500">
                      Numer rezerwacji: #{confirmedReservationModal.reservationId}
                    </p>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setConfirmedReservationModal(null)}
                aria-label="Zamknij okno potwierdzenia"
                className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 text-sm sm:text-base">
              <div className="font-bold text-slate-900 text-base">
                {confirmedReservationModal.serviceName}
              </div>

              <div className="flex items-center gap-2 text-slate-700 capitalize">
                <CalendarIcon className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{confirmedReservationModal.dateLabel}</span>
              </div>

              <div className="flex items-center gap-2 font-bold text-emerald-800">
                <Clock className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{confirmedReservationModal.timeRange}</span>
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center gap-3">
                <InstructorSummaryAvatar
                  name={confirmedReservationModal.instructorName}
                  sizeClass="w-10 h-10"
                />
                <div>
                  <div className="text-xs text-slate-500">Instruktor</div>
                  <div className="font-semibold text-slate-900">
                    {confirmedReservationModal.instructorName}
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200 text-xs sm:text-sm text-slate-600">
                Wypożyczenie sprzętu:{' '}
                <strong className="text-slate-900">
                  {confirmedReservationModal.needsEquipment
                    ? 'Tak (uprząż, buty)'
                    : 'Nie (własny sprzęt)'}
                </strong>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
              Potwierdzenie wraz z plikiem kalendarza (`.ics`) zostało wysłane na Twój adres e-mail.
            </p>

            <div className="flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setConfirmedReservationModal(null);
                  navigate('/app/client/reservations');
                }}
                className={`${BTN_PRIMARY} flex-1`}
              >
                Moje rezerwacje
              </button>
              <button
                type="button"
                onClick={() => setConfirmedReservationModal(null)}
                className={`${BTN_SECONDARY} sm:w-auto`}
              >
                Zamknij
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
