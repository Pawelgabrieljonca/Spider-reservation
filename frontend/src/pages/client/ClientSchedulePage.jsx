import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Calendar as CalendarIcon, CalendarCheck, ChevronLeft, ChevronRight, Clock, Footprints, LogIn, Phone, Plus, User, Users, X } from 'lucide-react';
import apiClient, { extractApiError, useRevalidate } from '../../core/api';
import { useAuth } from '../../core/auth';
import { SLOT_TYPE_META, formatTime24, slotTypeFullLabel, toLocalDateInputValue, toLocalIsoWithOffset } from '../../core/dateUtils';
import { AlertBanner, BTN_PRIMARY, BTN_SECONDARY, CARD_CLASS, INPUT_CLASS, ModalShell, SELECT_CLASS } from '../../ui/common';
import ClientReservationsView from './ClientReservationsView';

const POLISH_MONTHS = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];
const WEEKDAY_HEADERS = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Ndz'];
const SERVICE_OPTIONS = [
  { id: 'INDIVIDUAL_1H', ...SLOT_TYPE_META.INDIVIDUAL_1H, icon: User },
  { id: 'GROUP_1_5H', ...SLOT_TYPE_META.GROUP_1_5H, icon: Users },
];

const formatTimeRangeExact = (s, e) => (s ? `${formatTime24(s)}${e ? ` – ${formatTime24(e)}` : ''}` : '—');
const formatLongPolishDate = (v) => (v ? new Date(v.includes('T') ? v : `${v}T12:00:00`).toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '—');
const buildMonthIsoBounds = (y, m) => ({ date_from: toLocalIsoWithOffset(new Date(y, m, 1, 0, 0, 0)), date_to: toLocalIsoWithOffset(new Date(y, m + 1, 1, 0, 0, 0)) });

function buildCalendarCells(year, month) {
  const startOffset = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const mm = String(month + 1).padStart(2, '0');
  return [...Array(startOffset).fill(null), ...Array.from({ length: days }, (_, i) => ({ day: i + 1, dateKey: `${year}-${mm}-${String(i + 1).padStart(2, '0')}` }))];
}

function InstructorAvatar({ name, sizeClass = 'w-14 h-14' }) {
  const initials = (name || 'TR').split(' ').filter(Boolean).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  return <div className={`${sizeClass} rounded-full bg-gradient-to-br from-slate-800 to-emerald-700 text-white flex items-center justify-center font-bold text-base shrink-0 shadow-sm`}>{initials}</div>;
}

export default function ClientSchedulePage({ mode = 'slots' }) {
  const navigate = useNavigate();
  const { isAuthenticated, login, keycloak, clearSessionExpiredNotice } = useAuth();
  const section = mode === 'reservations' ? 'reservations' : 'slots';

  const [todayInfo] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth(), dateKey: toLocalDateInputValue(now), nowMs: now.getTime() };
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
  const [selectedServiceType, setSelectedServiceType] = useState('INDIVIDUAL_1H');
  const [viewMonth, setViewMonth] = useState({ year: todayInfo.year, month: todayInfo.month });
  const [selectedDateKey, setSelectedDateKey] = useState(null);
  const [selectedSlotId, setSelectedSlotId] = useState(null);
  const [needsEquipment, setNeedsEquipment] = useState(false);
  const [contactPhone, setContactPhone] = useState('');
  const [clientProfile, setClientProfile] = useState(null);
  const [confirmedModal, setConfirmedModal] = useState(null);
  const [instructorFilter, setInstructorFilter] = useState('');

  const fetchSlotsOnly = useCallback(async ({ silent = false, isActive = () => true } = {}) => {
    if (section !== 'slots') return;
    if (!silent) {
      setLoadingSlots(true);
      setErrorMsg(null);
    }
    try {
      const bounds = buildMonthIsoBounds(viewMonth.year, viewMonth.month);
      const slotsRes = await apiClient.get('/api/v1/client/slots', {
        params: { ...bounds, slot_type: selectedServiceType, only_free: true },
      });
      if (!isActive()) return;
      const fetched = Array.isArray(slotsRes?.data) ? slotsRes.data : [];
      setSlots(fetched);
      setKnownInstructors((prev) => {
        const next = new Set(prev);
        fetched.forEach((i) => { if (i.instructor_name) next.add(i.instructor_name); });
        return Array.from(next).sort((a, b) => a.localeCompare(b, 'pl'));
      });
      setNowMs(Date.now());
    } catch (err) {
      if (!silent && isActive()) setErrorMsg(extractApiError(err, 'Błąd pobierania danych kalendarza.'));
    } finally {
      if (!silent && isActive()) setLoadingSlots(false);
    }
  }, [section, viewMonth.year, viewMonth.month, selectedServiceType]);

  const fetchReservationsOnly = useCallback(async ({ silent = false, isActive = () => true } = {}) => {
    if (!isAuthenticated) return;
    if (!silent) setLoadingReservations(true);
    try {
      const myRes = await apiClient.get('/api/v1/client/reservations');
      if (!isActive()) return;
      setReservations(Array.isArray(myRes?.data) ? myRes.data : []);
      setNowMs(Date.now());
    } catch (err) {
      if (!silent && isActive()) setErrorMsg(extractApiError(err, 'Błąd pobierania listy rezerwacji.'));
    } finally {
      if (!silent && isActive()) setLoadingReservations(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => { if (active) fetchSlotsOnly({ silent: false, isActive: () => active }); });
    return () => { active = false; };
  }, [fetchSlotsOnly]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    let active = true;
    Promise.resolve().then(() => { if (active) fetchReservationsOnly({ silent: false, isActive: () => active }); });
    return () => { active = false; };
  }, [fetchReservationsOnly, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || section !== 'slots') return undefined;
    let active = true;
    apiClient.get('/api/v1/client/profile').then((res) => {
      if (!active) return;
      const prof = res.data || {};
      setClientProfile(prof);
      if (prof.phone_number) setContactPhone((p) => p || prof.phone_number);
    }).catch(() => { });
    return () => { active = false; };
  }, [isAuthenticated, section]);

  const silentRefresh = useCallback(() => {
    fetchSlotsOnly({ silent: true });
    fetchReservationsOnly({ silent: true });
  }, [fetchSlotsOnly, fetchReservationsOnly]);
  useRevalidate(silentRefresh, 30000);

  const clientBusy = useMemo(() => reservations
    .filter((r) => r.status === 'confirmed' && r.slot?.start_time && r.slot?.end_time)
    .map((r) => ({ startMs: new Date(r.slot.start_time).getTime(), endMs: new Date(r.slot.end_time).getTime() })), [reservations]);

  const availableInstructorNames = useMemo(() => {
    const set = new Set([...knownInstructors, ...slots.map((s) => s.instructor_name).filter(Boolean)]);
    if (instructorFilter) set.add(instructorFilter);
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pl'));
  }, [knownInstructors, slots, instructorFilter]);

  const bookableSlots = useMemo(() => {
    const q = instructorFilter.trim().toLowerCase();
    return slots
      .filter((s) => {
        if (s.free_places <= 0 || s.slot_type !== selectedServiceType) return false;
        if (q && !(s.instructor_name || '').toLowerCase().includes(q)) return false;
        const cs = new Date(s.start_time).getTime();
        const ce = new Date(s.end_time).getTime();
        return !clientBusy.some((iv) => cs < iv.endMs && ce > iv.startMs);
      })
      .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
  }, [slots, selectedServiceType, instructorFilter, clientBusy]);

  const slotsByDateKey = useMemo(() => {
    const map = new Map();
    for (const s of bookableSlots) {
      const k = toLocalDateInputValue(new Date(s.start_time));
      map.set(k, [...(map.get(k) || []), s]);
    }
    return map;
  }, [bookableSlots]);

  const calendarCells = useMemo(() => buildCalendarCells(viewMonth.year, viewMonth.month), [viewMonth]);
  const activeDateKey = selectedDateKey && slotsByDateKey.has(selectedDateKey) ? selectedDateKey : null;
  const slotsForDay = useMemo(() => (activeDateKey ? slotsByDateKey.get(activeDateKey) || [] : []), [activeDateKey, slotsByDateKey]);
  const dupTimes = useMemo(() => slotsForDay.reduce((acc, s) => { const t = formatTime24(s.start_time); acc[t] = (acc[t] || 0) + 1; return acc; }, {}), [slotsForDay]);
  const selectedSlot = useMemo(() => (activeDateKey && selectedSlotId ? slotsForDay.find((s) => s.id === selectedSlotId) || null : null), [activeDateKey, selectedSlotId, slotsForDay]);

  const canGoPrev = viewMonth.year > todayInfo.year || (viewMonth.year === todayInfo.year && viewMonth.month > todayInfo.month);
  const canGoNext = (viewMonth.year - todayInfo.year) * 12 + (viewMonth.month - todayInfo.month) < 12;

  const shiftMonth = (delta) => {
    if ((delta < 0 && !canGoPrev) || (delta > 0 && !canGoNext)) return;
    setLoadingSlots(true); setSelectedDateKey(null); setSelectedSlotId(null);
    setViewMonth(({ year, month }) => { const d = new Date(year, month + delta, 1); return { year: d.getFullYear(), month: d.getMonth() }; });
  };

  const triggerLogin = () => { clearSessionExpiredNotice?.(); login({ redirectUri: window.location.href }); };

  const handleBook = async () => {
    if (!isAuthenticated) { triggerLogin(); return; }
    if (!selectedSlot || isSubmitting) return;
    setErrorMsg(null); setSuccessMsg(null); setIsSubmitting(true);
    const snap = { ...selectedSlot };
    const equip = needsEquipment;
    try {
      const trimmedPhone = contactPhone.trim();
      const res = await apiClient.post('/api/v1/client/reservations', {
        availability_window_id: selectedSlot.availability_window_id,
        start_time: selectedSlot.start_time,
        slot_type: selectedSlot.slot_type,
        needs_equipment: equip,
        phone_number: trimmedPhone || null,
      });
      if (trimmedPhone) setClientProfile((p) => ({ ...(p || {}), phone_number: trimmedPhone }));
      setConfirmedModal({
        reservationId: res.data?.id,
        serviceName: slotTypeFullLabel(snap.slot_type),
        dateLabel: formatLongPolishDate(snap.start_time),
        timeRange: formatTimeRangeExact(snap.start_time, snap.end_time),
        instructorName: snap.instructor_name,
        needsEquipment: equip,
      });
      setSelectedSlotId(null); setNeedsEquipment(false);
      window.dispatchEvent(new Event('spider:notifications-refresh'));
      await Promise.all([fetchSlotsOnly({ silent: false }), fetchReservationsOnly({ silent: true })]);
    } catch (err) {
      setErrorMsg(extractApiError(err, 'Nie udało się zarezerwować wybranego terminu.'));
    } finally { setIsSubmitting(false); }
  };

  const handleCancel = async (id) => {
    setErrorMsg(null); setSuccessMsg(null);
    try {
      await apiClient.delete(`/api/v1/client/reservations/${id}`);
      setSuccessMsg('Rezerwacja odwołana. Zwolniony termin wrócił do ogólnego grafiku.');
      window.dispatchEvent(new Event('spider:notifications-refresh'));
      await fetchReservationsOnly({ silent: true });
    } catch (err) { setErrorMsg(extractApiError(err, 'Nie udało się anulować rezerwacji.')); }
  };

  const handleUpdateEquipment = async (id, val) => {
    setErrorMsg(null); setSuccessMsg(null);
    try {
      await apiClient.patch(`/api/v1/client/reservations/${id}`, { needs_equipment: val });
      setSuccessMsg(val ? 'Zapisano: wypożyczenie butów i uprzęży na ten trening.' : 'Zapisano: przychodzisz z własnym sprzętem.');
      await fetchReservationsOnly({ silent: true });
    } catch (err) { setErrorMsg(extractApiError(err, 'Nie udało się zmienić zapotrzebowania na sprzęt.')); }
  };

  return (
    <div className={`space-y-5 ${section === 'slots' ? 'pb-28 md:pb-4' : ''}`}>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900">
          {section === 'reservations' ? 'Moje rezerwacje' : 'Zarezerwuj trening'}
        </h1>
        {section === 'reservations' && (
          <Link to="/app/client" className={BTN_PRIMARY}>
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Zarezerwuj kolejny trening</span>
            <span className="sm:hidden">Zarezerwuj</span>
          </Link>
        )}
      </div>

      <AlertBanner type="error" message={errorMsg} onClose={() => setErrorMsg(null)} />
      <AlertBanner type="success" message={successMsg} onClose={() => setSuccessMsg(null)} />

      {section === 'slots' && (
        <>
          <section className={`${CARD_CLASS} p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4`}>
            <div className="flex-1 space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500">1. Wybierz rodzaj treningu</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {SERVICE_OPTIONS.map(({ id, title, subtitle, icon: Icon }) => {
                  const active = selectedServiceType === id;
                  return (
                    <button key={id} type="button" onClick={() => { if (id !== selectedServiceType) { setLoadingSlots(true); setSelectedServiceType(id); setSelectedSlotId(null); setErrorMsg(null); } }}
                      aria-pressed={active} className={`text-left p-3.5 rounded-xl border-2 transition-all flex items-start gap-3 min-h-[64px] ${active ? 'border-emerald-600 bg-emerald-50/70 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${active ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}><Icon className="w-5 h-5" /></div>
                      <div className="min-w-0">
                        <div className="text-sm sm:text-base font-bold text-slate-900">{title}</div>
                        <div className="text-xs text-slate-600 mt-0.5">{subtitle}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="lg:w-72 space-y-2">
              <label htmlFor="client-instructor-select" className="block text-xs font-bold uppercase tracking-wider text-slate-500">Prowadzący instruktor</label>
              <div className="flex items-center gap-2">
                <select id="client-instructor-select" value={instructorFilter} onChange={(e) => { setInstructorFilter(e.target.value); setSelectedSlotId(null); }} className={SELECT_CLASS}>
                  <option value="">Dowolny instruktor</option>
                  {availableInstructorNames.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
                {instructorFilter && (
                  <button type="button" onClick={() => { setInstructorFilter(''); setSelectedSlotId(null); }} title="Wyczyść filtr instruktora" className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 shrink-0"><X className="w-4 h-4" /></button>
                )}
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-7 space-y-6">
              <section className={`${CARD_CLASS} p-5 sm:p-6`}>
                <div className="flex items-center justify-between gap-4 mb-6">
                  <button type="button" onClick={() => shiftMonth(-1)} disabled={!canGoPrev || loadingSlots} className={`${BTN_SECONDARY} min-h-[40px] px-3 text-sm`}><ChevronLeft className="w-5 h-5" /><span className="hidden sm:inline">Poprzedni</span></button>
                  <div className="text-center">
                    <h2 className="text-lg sm:text-xl font-extrabold text-slate-900">{POLISH_MONTHS[viewMonth.month]} {viewMonth.year}</h2>
                    <p className="text-xs text-slate-500 mt-0.5">{loadingSlots ? 'Wyliczanie wolnych godzin...' : `Dostępne dni (${selectedServiceType === 'GROUP_1_5H' ? '90 min' : '60 min'}): ${slotsByDateKey.size}`}</p>
                  </div>
                  <button type="button" onClick={() => shiftMonth(1)} disabled={!canGoNext || loadingSlots} className={`${BTN_SECONDARY} min-h-[40px] px-3 text-sm`}><span className="hidden sm:inline">Następny</span><ChevronRight className="w-5 h-5" /></button>
                </div>

                <div className="grid grid-cols-7 gap-1 mb-2 text-center">
                  {WEEKDAY_HEADERS.map((d) => <div key={d} className="py-2 text-xs font-semibold uppercase text-slate-400">{d}</div>)}
                </div>

                <div className="grid grid-cols-7 gap-y-2 gap-x-1">
                  {calendarCells.map((cell, idx) => {
                    if (!cell) return <div key={`empty-${idx}`} className="h-12 sm:h-14" />;
                    const has = (slotsByDateKey.get(cell.dateKey) || []).length > 0;
                    const sel = activeDateKey === cell.dateKey;
                    const isToday = cell.dateKey === todayInfo.dateKey;
                    return (
                      <div key={cell.dateKey} className="flex items-center justify-center">
                        <button type="button" disabled={!has} onClick={() => { setSelectedDateKey(cell.dateKey); setSelectedSlotId(null); setErrorMsg(null); }}
                          aria-pressed={sel} className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full flex flex-col items-center justify-center transition-all ${sel ? 'bg-emerald-600 text-white font-bold shadow-md ring-4 ring-emerald-100 scale-105' : has ? 'bg-white text-slate-900 font-semibold border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/60' : 'text-slate-300 bg-slate-50/60 cursor-not-allowed'}`}>
                          <span className="text-sm sm:text-base leading-none">{cell.day}</span>
                          {has && <span className={`mt-1 w-1.5 h-1.5 rounded-full ${sel ? 'bg-white' : 'bg-emerald-500'}`} />}
                          {!has && isToday && <span className="mt-1 w-1 h-1 rounded-full bg-slate-300" />}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className={`${CARD_CLASS} p-5 sm:p-6 space-y-4`}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-slate-900">2. Wybierz godzinę rozpoczęcia</h3>
                    <p className="text-sm text-slate-500 capitalize">{activeDateKey ? formatLongPolishDate(activeDateKey) : 'Kliknij aktywny dzień w kalendarzu powyżej'}</p>
                  </div>
                  {activeDateKey && <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full shrink-0">{slotsForDay.length} {slotsForDay.length === 1 ? 'godzina' : 'godzin'}</span>}
                </div>

                {!activeDateKey ? (
                  <div className="py-6 px-4 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-center text-sm text-slate-500">Wybierz dzień oznaczony zieloną kropką w kalendarzu.</div>
                ) : (
                  <div className="flex items-center gap-2.5 overflow-x-auto pb-2 pt-1 snap-x" role="listbox">
                    {slotsForDay.map((slot) => {
                      const t = formatTime24(slot.start_time);
                      const picked = selectedSlot?.id === slot.id;
                      return (
                        <button key={slot.id} type="button" role="option" aria-selected={picked} onClick={() => { setSelectedSlotId(slot.id); setErrorMsg(null); }}
                          className={`snap-start shrink-0 min-h-[46px] px-4 sm:px-5 py-2.5 rounded-full border text-sm sm:text-base font-semibold transition-all ${picked ? 'bg-emerald-600 text-white border-emerald-600 shadow-md ring-2 ring-emerald-200' : slot.is_joining_group ? 'bg-emerald-50/70 text-emerald-950 border-emerald-300 hover:border-emerald-500' : 'bg-white text-slate-800 border-slate-300 hover:border-emerald-500'}`}>
                          <span>{t}</span>
                          {slot.is_joining_group && <span className={`ml-1.5 text-xs ${picked ? 'text-emerald-100' : 'text-emerald-700'}`}>• Dołącz ({slot.free_places} wolne)</span>}
                          {dupTimes[t] > 1 && <span className={`ml-1.5 text-xs font-normal ${picked ? 'text-emerald-100' : 'text-slate-500'}`}>• {(slot.instructor_name || '').split(' ')[0]}</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>

            <aside className="lg:col-span-5 lg:sticky lg:top-24">
              <div className={`${CARD_CLASS} p-6 space-y-5`}>
                <div className="border-b border-slate-200 pb-4">
                  <h2 className="text-lg sm:text-xl font-extrabold text-slate-900">Podsumowanie wizyty</h2>
                  <p className="text-sm text-slate-500 mt-0.5">Sprawdź szczegóły wybranego treningu przed rezerwacją.</p>
                </div>

                {selectedSlot ? (
                  <div className="space-y-4">
                    <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-base font-bold text-slate-900">{slotTypeFullLabel(selectedSlot.slot_type)}</span>
                        <span className="text-xs font-semibold bg-emerald-100 text-emerald-900 border border-emerald-200 px-2.5 py-0.5 rounded-full shrink-0">Wolne: {selectedSlot.free_places}/{selectedSlot.max_capacity}</span>
                      </div>
                      {selectedSlot.is_joining_group && (
                        <div className="text-xs font-semibold text-emerald-800 bg-white/80 border border-emerald-200 rounded-lg px-2.5 py-1.5">Dołączasz do otwartej grupy ({selectedSlot.max_capacity - selectedSlot.free_places}/{selectedSlot.max_capacity}).</div>
                      )}
                      <div className="flex items-center gap-2 text-sm text-slate-700 capitalize"><CalendarIcon className="w-4 h-4 text-emerald-600 shrink-0" /><span>{formatLongPolishDate(selectedSlot.start_time)}</span></div>
                      <div className="flex items-center gap-2 text-base font-bold text-emerald-800"><Clock className="w-4 h-4 text-emerald-600 shrink-0" /><span>{formatTimeRangeExact(selectedSlot.start_time, selectedSlot.end_time)}</span></div>
                    </div>

                    <div className="flex items-center gap-4 p-4 rounded-xl border border-slate-200 bg-slate-50/70">
                      <InstructorAvatar name={selectedSlot.instructor_name} />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold uppercase text-slate-500">Prowadzący instruktor</div>
                        <div className="text-base font-bold text-slate-900 truncate">{selectedSlot.instructor_name}</div>
                        <div className="text-xs text-slate-600 mt-0.5">Certyfikowany instruktor CW Spider</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-8 px-4 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-center space-y-2">
                    <CalendarIcon className="w-8 h-8 text-slate-400 mx-auto" />
                    <p className="text-base font-semibold text-slate-700">Nie wybrano jeszcze terminu</p>
                    <p className="text-sm text-slate-500">Wybierz rodzaj treningu, zaznacz dzień i godzinę rozpoczęcia.</p>
                  </div>
                )}

                <div className="pt-2 border-t border-slate-200 space-y-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label htmlFor="booking-contact-phone" className="flex items-center gap-1.5 text-xs font-semibold text-slate-700"><Phone className="w-3.5 h-3.5 text-emerald-600" />Telefon kontaktowy</label>
                      {isAuthenticated && <Link to="/app/client/profile" className="text-xs font-medium text-emerald-700 underline">Edytuj profil</Link>}
                    </div>
                    <input id="booking-contact-phone" type="tel" value={contactPhone} disabled={!selectedSlot || isSubmitting || !isAuthenticated} onChange={(e) => setContactPhone(e.target.value)}
                      placeholder={isAuthenticated ? 'np. +48 519 699 795' : 'Wymagane zalogowanie'} maxLength={20} className={`${INPUT_CLASS} py-2 text-sm`} />
                  </div>

                  <div className="rounded-xl border border-slate-200 overflow-hidden">
                    <label className="flex items-start gap-3 p-3.5 hover:bg-slate-50 cursor-pointer select-none">
                      <input type="checkbox" checked={needsEquipment} disabled={!selectedSlot || isSubmitting} onChange={(e) => setNeedsEquipment(e.target.checked)} className="mt-0.5 w-5 h-5 rounded border-slate-300 text-emerald-600" />
                      <span className="text-sm font-medium text-slate-800">Potrzebuję wypożyczyć sprzęt (uprząż, buty)</span>
                    </label>
                    {needsEquipment && (
                      <div className="px-3.5 py-2.5 bg-amber-50/70 border-t border-amber-100 flex items-center justify-between gap-2 text-xs text-amber-950">
                        <span className="inline-flex items-center gap-1.5 font-medium">
                          <Footprints className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                          {isAuthenticated ? (clientProfile?.shoe_size ? <>Rozmiar z profilu: <strong>EU {clientProfile.shoe_size}</strong></> : 'Nie zapisano rozmiaru buta w profilu.') : 'Sprzęt dobierzesz w recepcji.'}
                        </span>
                        {isAuthenticated && <Link to="/app/client/profile" className="font-semibold text-amber-900 underline shrink-0">{clientProfile?.shoe_size ? 'Zmień' : 'Uzupełnij'}</Link>}
                      </div>
                    )}
                  </div>
                </div>

                <div className="hidden md:block space-y-2">
                  {isAuthenticated ? (
                    <>
                      <button type="button" disabled={!selectedSlot || isSubmitting} onClick={handleBook} className={`${BTN_PRIMARY} w-full py-3.5 text-base`}>
                        <CalendarCheck className="w-5 h-5" /><span>{isSubmitting ? 'Rezerwowanie terminu...' : 'Zarezerwuj termin'}</span>
                      </button>
                      <p className="text-xs text-center text-slate-500">Bezpłatne odwołanie wizyty możliwe do 12h przed rozpoczęciem zajęć.</p>
                    </>
                  ) : (
                    <div className="space-y-2.5 bg-slate-50 border border-slate-200 rounded-xl p-4 text-center">
                      <p className="text-xs text-slate-600">Aby zarezerwować wybrany trening, zaloguj się lub zarejestruj.</p>
                      <button type="button" disabled={!selectedSlot} onClick={triggerLogin} className={`${BTN_PRIMARY} w-full py-3 text-sm`}><LogIn className="w-4 h-4" /><span>{selectedSlot ? 'Zaloguj się, aby zarezerwować' : 'Zaznacz termin'}</span></button>
                      <button type="button" onClick={() => { clearSessionExpiredNotice?.(); keycloak.register({ redirectUri: window.location.href }); }} className="text-xs text-emerald-700 font-semibold underline block mx-auto">Nie masz konta? Zarejestruj się bezpłatnie</button>
                    </div>
                  )}
                </div>
              </div>
            </aside>
          </div>

          <div className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-slate-200 px-4 py-3 shadow-lg">
            <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
              <div className="min-w-0">
                {selectedSlot ? (
                  <>
                    <div className="text-xs font-semibold text-emerald-700 truncate">{slotTypeFullLabel(selectedSlot.slot_type)}</div>
                    <div className="text-sm font-bold text-slate-900 truncate">{formatTimeRangeExact(selectedSlot.start_time, selectedSlot.end_time)} • {selectedSlot.instructor_name}</div>
                  </>
                ) : <div className="text-xs font-medium text-slate-500">Zaznacz dzień i godzinę, aby zarezerwować</div>}
              </div>
              <button type="button" disabled={!selectedSlot || isSubmitting} onClick={handleBook} className={`${BTN_PRIMARY} shrink-0 px-4 text-sm`}>
                {isAuthenticated ? (isSubmitting ? 'Zapisywanie...' : 'Zarezerwuj') : <><LogIn className="w-4 h-4" /><span>Zaloguj się</span></>}
              </button>
            </div>
          </div>
        </>
      )}

      {section === 'reservations' && (
        <ClientReservationsView reservations={reservations} loading={loadingReservations} nowMs={nowMs} Avatar={InstructorAvatar} onCancel={handleCancel} onUpdateEquipment={handleUpdateEquipment} />
      )}

      {confirmedModal && (
        <ModalShell
          title="Rezerwacja potwierdzona!"
          subtitle={confirmedModal.reservationId ? `Numer rezerwacji: #${confirmedModal.reservationId}` : null}
          onClose={() => setConfirmedModal(null)}
          maxWidth="max-w-md"
          footer={
            <div className="flex flex-col sm:flex-row gap-2.5">
              <button type="button" onClick={() => { setConfirmedModal(null); navigate('/app/client/reservations'); }} className={`${BTN_PRIMARY} flex-1`}>Moje rezerwacje</button>
              <button type="button" onClick={() => setConfirmedModal(null)} className={`${BTN_SECONDARY} sm:w-auto`}>Zamknij</button>
            </div>
          }
        >
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2.5 text-sm">
            <div className="font-bold text-slate-900 text-base">{confirmedModal.serviceName}</div>
            <div className="flex items-center gap-2 text-slate-700 capitalize"><CalendarIcon className="w-4 h-4 text-emerald-600" />{confirmedModal.dateLabel}</div>
            <div className="flex items-center gap-2 font-bold text-emerald-800"><Clock className="w-4 h-4 text-emerald-600" />{confirmedModal.timeRange}</div>
            <div className="pt-2 border-t border-slate-200 flex items-center gap-3">
              <InstructorAvatar name={confirmedModal.instructorName} sizeClass="w-10 h-10" />
              <div><div className="text-xs text-slate-500">Instruktor</div><div className="font-semibold text-slate-900">{confirmedModal.instructorName}</div></div>
            </div>
            <div className="pt-2 border-t border-slate-200 text-xs text-slate-600">Wypożyczenie sprzętu: <strong className="text-slate-900">{confirmedModal.needsEquipment ? 'Tak (uprząż, buty)' : 'Nie (własny sprzęt)'}</strong></div>
          </div>
          <p className="text-xs text-slate-500">Potwierdzenie wraz z plikiem kalendarza (.ics) zostało wysłane na Twój adres e-mail.</p>
        </ModalShell>
      )}
    </div>
  );
}
