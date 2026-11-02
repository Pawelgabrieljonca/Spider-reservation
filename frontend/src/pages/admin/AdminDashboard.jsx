import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Database,
  Mail,
  Phone,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import apiClient from '../../api/client';
import { useAuth } from '../../auth/useAuth';
import Pagination from '../../components/Pagination';
import SEO from '../../components/SEO';
import { BTN_SECONDARY, CARD_CLASS, INPUT_CLASS, SELECT_CLASS } from '../../styles/ui';
import { formatDateTime24, formatSlotRange24, slotTypeShortLabel } from '../../utils/dateUtils';
import { extractApiError } from '../../utils/grades';

function formatMinutesSummary(totalMinutes) {
  const mins = Number(totalMinutes) || 0;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

function SlotStateBadge({ state }) {
  if (state === 'PLANNED') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-900 border border-emerald-200">
        Zaplanowany
      </span>
    );
  }
  if (state === 'COMPLETED') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-300">
        Zrealizowany
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-200">
      Zablokowany
    </span>
  );
}

function UserRoleBadge({ roleKey }) {
  if (roleKey === 'INSTRUCTOR') {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-900 border border-emerald-200 shrink-0">
        Instruktor
      </span>
    );
  }
  if (roleKey === 'ADMIN') {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-violet-100 text-violet-900 border border-violet-200 shrink-0">
        Admin
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-900 border border-sky-200 shrink-0">
      Klient
    </span>
  );
}

export default function AdminDashboard({ section = 'health' }) {
  const { userProfile } = useAuth();

  // Dane z API administratora
  const [healthData, setHealthData] = useState(null);
  const [usersData, setUsersData] = useState({
    clients: [],
    instructors: [],
    admins: [],
    total_count: 0,
  });
  const [availabilityData, setAvailabilityData] = useState({
    totals: null,
    instructors: [],
  });

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  // Stan widoku Baza użytkowników (filtry, sortowanie, paginacja)
  const [userGroupFilter, setUserGroupFilter] = useState('ALL'); // 'ALL' | 'CLIENTS' | 'INSTRUCTORS' | 'ADMINS'
  const [userSearch, setUserSearch] = useState('');
  const [userSort, setUserSort] = useState('alpha'); // 'alpha' | 'newest' | 'oldest'
  const [mobileUserFiltersOpen, setMobileUserFiltersOpen] = useState(false);
  const [userPage, setUserPage] = useState(1);
  const [userPageSize, setUserPageSize] = useState(10);

  // Stan widoku Godziny instruktorów (wyszukiwarka, rozwijanie grafików i paginacja slotów)
  const [instructorSearch, setInstructorSearch] = useState('');
  const [expandedInstructorId, setExpandedInstructorId] = useState(null);
  const [instSlotPage, setInstSlotPage] = useState(1);
  const [instSlotPageSize, setInstSlotPageSize] = useState(5);

  const loadAdminData = useCallback(async () => {
    try {
      const [healthRes, usersRes, availRes] = await Promise.all([
        apiClient.get('/api/v1/admin/health'),
        apiClient.get('/api/v1/admin/users'),
        apiClient.get('/api/v1/admin/instructors-availability'),
      ]);
      setHealthData(healthRes.data);
      setUsersData(
        usersRes.data || { clients: [], instructors: [], admins: [], total_count: 0 }
      );
      setAvailabilityData(availRes.data || { totals: null, instructors: [] });
      setErrorMsg(null);
    } catch (err) {
      setErrorMsg(extractApiError(err, 'Nie udało się pobrać danych administracyjnych.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiClient.get('/api/v1/admin/health'),
      apiClient.get('/api/v1/admin/users'),
      apiClient.get('/api/v1/admin/instructors-availability'),
    ])
      .then(([healthRes, usersRes, availRes]) => {
        if (!active) return;
        setHealthData(healthRes.data);
        setUsersData(
          usersRes.data || { clients: [], instructors: [], admins: [], total_count: 0 }
        );
        setAvailabilityData(availRes.data || { totals: null, instructors: [] });
        setErrorMsg(null);
      })
      .catch((err) => {
        if (!active) return;
        setErrorMsg(extractApiError(err, 'Nie udało się pobrać danych administracyjnych.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const handleManualRefresh = () => {
    setLoading(true);
    loadAdminData();
  };

  // Zintegrowana lista użytkowników z przypisaną rolą do filtrowania i paginacji
  const allUsersNormalized = useMemo(() => {
    const clients = (usersData.clients || []).map((u) => ({ ...u, _roleKey: 'CLIENT' }));
    const instructors = (usersData.instructors || []).map((u) => ({
      ...u,
      _roleKey: 'INSTRUCTOR',
    }));
    const admins = (usersData.admins || []).map((u) => ({ ...u, _roleKey: 'ADMIN' }));
    return [...instructors, ...clients, ...admins];
  }, [usersData.clients, usersData.instructors, usersData.admins]);

  const filteredAndSortedUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();

    const filtered = allUsersNormalized.filter((u) => {
      if (userGroupFilter === 'CLIENTS' && u._roleKey !== 'CLIENT') return false;
      if (userGroupFilter === 'INSTRUCTORS' && u._roleKey !== 'INSTRUCTOR') return false;
      if (userGroupFilter === 'ADMINS' && u._roleKey !== 'ADMIN') return false;

      if (!q) return true;
      const fullName = `${u.first_name || ''} ${u.last_name || ''}`.toLowerCase();
      const reverseName = `${u.last_name || ''} ${u.first_name || ''}`.toLowerCase();
      const email = (u.email || '').toLowerCase();
      const phone = (u.phone_number || '').toLowerCase();
      return (
        fullName.includes(q) ||
        reverseName.includes(q) ||
        email.includes(q) ||
        phone.includes(q)
      );
    });

    return [...filtered].sort((a, b) => {
      if (userSort === 'newest') {
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      }
      if (userSort === 'oldest') {
        return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
      }
      const lastCmp = (a.last_name || '').localeCompare(b.last_name || '', 'pl');
      if (lastCmp !== 0) return lastCmp;
      return (a.first_name || '').localeCompare(b.first_name || '', 'pl');
    });
  }, [allUsersNormalized, userGroupFilter, userSearch, userSort]);

  const totalUserPages = Math.max(1, Math.ceil(filteredAndSortedUsers.length / userPageSize));
  const safeUserPage = Math.min(userPage, totalUserPages);
  const paginatedUsers = useMemo(() => {
    const startIdx = (safeUserPage - 1) * userPageSize;
    return filteredAndSortedUsers.slice(startIdx, startIdx + userPageSize);
  }, [filteredAndSortedUsers, safeUserPage, userPageSize]);

  const filteredAvailabilityInstructors = useMemo(() => {
    const q = instructorSearch.trim().toLowerCase();
    return (availabilityData.instructors || []).filter((inst) => {
      if (!q) return true;
      const fullName = `${inst.first_name || ''} ${inst.last_name || ''}`.toLowerCase();
      return fullName.includes(q) || (inst.email || '').toLowerCase().includes(q);
    });
  }, [availabilityData.instructors, instructorSearch]);

  const sectionTitle =
    section === 'users'
      ? 'Baza użytkowników'
      : section === 'availability'
        ? 'Godziny i dostępność instruktorów'
        : 'Stan systemu';

  const activeMobileUserFiltersCount =
    (userSearch.trim() ? 1 : 0) + (userSort !== 'alpha' ? 1 : 0);

  const clientsTotal = usersData.clients?.length || 0;
  const instructorsTotal = usersData.instructors?.length || 0;
  const adminsTotal = usersData.admins?.length || 0;

  return (
    <div className="space-y-3.5 sm:space-y-5">
      <SEO
        title="Panel Administratora | System CW Spider"
        description="Panel zarządzania systemem rezerwacji, użytkownikami, rolami i infrastrukturą CW Spider."
        path="/app/admin"
        robots="noindex, nofollow"
      />
      {/* Zwięzły pasek nagłówka podstrony */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 truncate">
          {sectionTitle}
        </h1>
        <button
          type="button"
          onClick={handleManualRefresh}
          disabled={loading}
          className="inline-flex items-center justify-center gap-1.5 min-h-[40px] sm:min-h-[42px] px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 active:bg-slate-100 rounded-lg shadow-sm transition-colors disabled:opacity-50 shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Odśwież</span>
        </button>
      </div>

      {/* Komunikat o błędzie */}
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-900 rounded-xl p-3.5 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 text-sm sm:text-base">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-red-700 hover:text-red-900 p-1"
            aria-label="Zamknij komunikat"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* =====================================================================
          WIDOK 1: STAN SYSTEMU (/app/admin)
         ===================================================================== */}
      {section === 'health' && (
        <section className="space-y-4">
          {/* Kompaktowy jednowierszowy pasek liczników bazy (widoczny od razu na mobile) */}
          <div className={`${CARD_CLASS} px-2 py-2.5 sm:px-4 sm:py-3`}>
            <div className="grid grid-cols-3 divide-x divide-slate-200 text-center">
              <div className="px-1.5 flex flex-col sm:flex-row sm:items-center sm:justify-center sm:gap-2">
                <span className="text-[11px] sm:text-sm font-medium text-slate-500">Konta</span>
                <span className="text-base sm:text-lg font-extrabold text-slate-900">
                  {healthData ? healthData.users_count : '—'}
                </span>
              </div>
              <div className="px-1.5 flex flex-col sm:flex-row sm:items-center sm:justify-center sm:gap-2">
                <span className="text-[11px] sm:text-sm font-medium text-slate-500">Sloty</span>
                <span className="text-base sm:text-lg font-extrabold text-emerald-700">
                  {healthData ? healthData.slots_count : '—'}
                </span>
              </div>
              <div className="px-1.5 flex flex-col sm:flex-row sm:items-center sm:justify-center sm:gap-2">
                <span className="text-[11px] sm:text-sm font-medium text-slate-500">
                  Rezerwacje
                </span>
                <span className="text-base sm:text-lg font-extrabold text-slate-900">
                  {healthData ? healthData.reservations_count : '—'}
                </span>
              </div>
            </div>
          </div>

          <div className={`${CARD_CLASS} p-4 sm:p-6 space-y-4`}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900">
                  Diagnostyka usług systemowych
                </h2>
                <p className="text-xs sm:text-sm text-slate-500">
                  Endpoint: <span className="font-mono">GET /api/v1/admin/health</span>
                </p>
              </div>
              {healthData?.checked_at && (
                <span className="self-start sm:self-auto text-xs font-mono text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md">
                  Pomiar: {formatDateTime24(healthData.checked_at)}
                </span>
              )}
            </div>

            {loading && !healthData ? (
              <div className="py-8 text-center text-slate-500 text-sm sm:text-base">
                Sprawdzanie parametrów infrastruktury...
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 sm:gap-4">
                {/* Karta API */}
                <div className="border border-slate-200 bg-slate-50 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-800">
                      Serwer API REST (Flask)
                    </span>
                    <Server className="w-4 h-4 text-slate-400 shrink-0" />
                  </div>
                  <div>
                    {healthData?.status === 'ok' ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-900 border border-emerald-200">
                        &#10003; Działa poprawnie (200 OK)
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-900 border border-red-200">
                        &#10007; Problem ({healthData?.status || 'brak odpowiedzi'})
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    Obsługa transakcji rezerwacji, walidacji reguł i powiadomień.
                  </p>
                </div>

                {/* Karta Bazy PostgreSQL */}
                <div className="border border-slate-200 bg-slate-50 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-800">
                      Baza danych PostgreSQL
                    </span>
                    <Database className="w-4 h-4 text-slate-400 shrink-0" />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {healthData?.database === 'ok' ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-900 border border-emerald-200">
                        &#10003; Połączono
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-900 border border-red-200">
                        &#10007; Niedostępna ({healthData?.database || 'unreachable'})
                      </span>
                    )}
                    {healthData?.db_latency_ms != null && (
                      <span className="text-xs font-mono font-semibold text-slate-700 bg-white border border-slate-200 px-2 py-0.5 rounded">
                        {healthData.db_latency_ms} ms
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                     Aktywne połączenie puli SQLAlchemy (test zapytania SELECT 1).
                  </p>
                </div>

                {/* Karta SSO i polityki sesji */}
                <div className="border border-slate-200 bg-slate-50 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-800">
                      Autoryzacja SSO (Keycloak)
                    </span>
                    <ShieldCheck className="w-4 h-4 text-slate-400 shrink-0" />
                  </div>
                  <div>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-900 border border-emerald-200 max-w-full truncate">
                      &#10003; Aktywna ({userProfile?.email || 'Administrator'})
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Weryfikacja ról JWT RS256 • Limit bezczynności sesji: 15 min.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* =====================================================================
          WIDOK 2: BAZA UŻYTKOWNIKÓW Z PAGINACJĄ (/app/admin/users)
         ===================================================================== */}
      {section === 'users' && (
        <section className="space-y-3.5 sm:space-y-4">
          {/* Pasek wyboru grupy + przycisk filtrów na mobile */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 bg-slate-200/75 p-1 rounded-xl overflow-x-auto min-w-0">
              <button
                type="button"
                onClick={() => {
                  setUserGroupFilter('ALL');
                  setUserPage(1);
                }}
                className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors ${
                  userGroupFilter === 'ALL'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Wszyscy ({allUsersNormalized.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setUserGroupFilter('CLIENTS');
                  setUserPage(1);
                }}
                className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors ${
                  userGroupFilter === 'CLIENTS'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Klienci ({clientsTotal})
              </button>
              <button
                type="button"
                onClick={() => {
                  setUserGroupFilter('INSTRUCTORS');
                  setUserPage(1);
                }}
                className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors ${
                  userGroupFilter === 'INSTRUCTORS'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Instruktorzy ({instructorsTotal})
              </button>
              {adminsTotal > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setUserGroupFilter('ADMINS');
                    setUserPage(1);
                  }}
                  className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors ${
                    userGroupFilter === 'ADMINS'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Admini ({adminsTotal})
                </button>
              )}
            </div>

            {/* Zwijany przycisk wyszukiwania/sortowania na Mobile */}
            <button
              type="button"
              onClick={() => setMobileUserFiltersOpen((prev) => !prev)}
              aria-expanded={mobileUserFiltersOpen}
              className={`md:hidden inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors shrink-0 ${
                mobileUserFiltersOpen || activeMobileUserFiltersCount > 0
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : 'bg-white text-slate-700 border-slate-300'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Szukaj</span>
              {activeMobileUserFiltersCount > 0 && (
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-600 text-white text-[10px] font-bold">
                  {activeMobileUserFiltersCount}
                </span>
              )}
            </button>
          </div>

          {/* Panel wyszukiwania i sortowania (na desktopie zawsze widoczny, na mobile zwijany) */}
          <div
            className={`${
              mobileUserFiltersOpen ? 'block' : 'hidden'
            } md:block ${CARD_CLASS} p-3.5 sm:p-4`}
          >
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-8">
                <label
                  htmlFor="admin-user-search"
                  className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1"
                >
                  Szukaj użytkownika
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="admin-user-search"
                    type="search"
                    value={userSearch}
                    onChange={(e) => {
                      setUserSearch(e.target.value);
                      setUserPage(1);
                    }}
                    placeholder="Imię, nazwisko, e-mail lub telefon..."
                    className={`${INPUT_CLASS} pl-10`}
                  />
                </div>
              </div>

              <div className="md:col-span-4">
                <label
                  htmlFor="admin-user-sort"
                  className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1"
                >
                  Sortowanie
                </label>
                <div className="relative">
                  <ArrowUpDown className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <select
                    id="admin-user-sort"
                    value={userSort}
                    onChange={(e) => {
                      setUserSort(e.target.value);
                      setUserPage(1);
                    }}
                    className={`${SELECT_CLASS} pl-10`}
                  >
                    <option value="alpha">Nazwisko A–Z</option>
                    <option value="newest">Od najnowszych kont</option>
                    <option value="oldest">Od najstarszych kont</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Lista użytkowników (Tabela Desktop / Karty Mobile) */}
          <div className={`${CARD_CLASS} overflow-hidden`}>
            {loading && allUsersNormalized.length === 0 ? (
              <div className="p-8 text-center text-sm sm:text-base text-slate-500">
                Wczytywanie bazy użytkowników...
              </div>
            ) : filteredAndSortedUsers.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <p className="text-base font-medium text-slate-700">
                  Brak użytkowników spełniających kryteria.
                </p>
                {(userSearch || userGroupFilter !== 'ALL') && (
                  <button
                    type="button"
                    onClick={() => {
                      setUserSearch('');
                      setUserGroupFilter('ALL');
                      setUserPage(1);
                    }}
                    className="text-sm font-semibold text-emerald-700 hover:text-emerald-800 underline"
                  >
                    Wyczyść filtry
                  </button>
                )}
              </div>
            ) : (
              <>
                {/* Tabela Desktop (>= md) */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-500 bg-slate-50">
                        <th className="py-3.5 px-5">Imię i nazwisko</th>
                        <th className="py-3.5 px-5">Rola</th>
                        <th className="py-3.5 px-5">Kontakt</th>
                        <th className="py-3.5 px-5">Data rejestracji</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-sm lg:text-base">
                      {paginatedUsers.map((user) => (
                        <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3.5 px-5 font-semibold text-slate-900">
                            {user.first_name} {user.last_name}
                          </td>
                          <td className="py-3.5 px-5">
                            <UserRoleBadge roleKey={user._roleKey} />
                          </td>
                          <td className="py-3.5 px-5 text-slate-700">
                            <div className="break-all">{user.email}</div>
                            {user.phone_number && (
                              <div className="text-xs text-slate-500 mt-0.5 font-mono">
                                {user.phone_number}
                              </div>
                            )}
                          </td>
                          <td className="py-3.5 px-5 text-sm text-slate-500 whitespace-nowrap">
                            {formatDateTime24(user.created_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Kompaktowe, czytelne karty Mobile (< md) */}
                <div className="md:hidden divide-y divide-slate-200">
                  {paginatedUsers.map((user) => (
                    <div key={user.id} className="p-3.5 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-base font-bold text-slate-900 leading-snug">
                          {user.first_name} {user.last_name}
                        </div>
                        <UserRoleBadge roleKey={user._roleKey} />
                      </div>

                      <div className="space-y-1 text-sm text-slate-700">
                        <a
                          href={`mailto:${user.email}`}
                          className="inline-flex items-center gap-1.5 text-slate-700 hover:text-emerald-700 break-all"
                        >
                          <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{user.email}</span>
                        </a>

                        {user.phone_number && (
                          <div className="flex items-center gap-1.5 text-xs font-mono text-slate-600">
                            <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <a href={`tel:${user.phone_number}`} className="hover:text-emerald-700">
                              {user.phone_number}
                            </a>
                          </div>
                        )}
                      </div>

                      <div className="text-xs text-slate-500 pt-0.5">
                        Rejestracja: {formatDateTime24(user.created_at)}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Paginacja bazy użytkowników */}
          <Pagination
            totalItems={filteredAndSortedUsers.length}
            pageSize={userPageSize}
            currentPage={safeUserPage}
            onPageChange={setUserPage}
            onPageSizeChange={setUserPageSize}
            pageSizeOptions={[5, 10, 20]}
          />
        </section>
      )}

      {/* =====================================================================
          WIDOK 3: GODZINY I DOSTĘPNOŚĆ INSTRUKTORÓW (/app/admin/availability)
         ===================================================================== */}
      {section === 'availability' && (
        <section className="space-y-3.5 sm:space-y-5">
          {/* Kompaktowe podsumowanie KPI (2x2 na mobile, 4 kolumny na desktopie) */}
          {availabilityData.totals && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
              <div className={`${CARD_CLASS} p-3 sm:p-4`}>
                <div className="text-xs font-medium text-slate-500">Zaplanowane</div>
                <div className="mt-1 text-lg sm:text-2xl font-extrabold text-emerald-700">
                  {formatMinutesSummary(availabilityData.totals.planned_minutes)}
                </div>
                <div className="mt-1 text-[11px] sm:text-xs text-slate-600">
                  1h: <strong>{availabilityData.totals.planned_1h_count}</strong> &bull; 1.5h:{' '}
                  <strong>{availabilityData.totals.planned_1_5h_count}</strong>
                </div>
              </div>

              <div className={`${CARD_CLASS} p-3 sm:p-4`}>
                <div className="text-xs font-medium text-slate-500">Zrealizowane</div>
                <div className="mt-1 text-lg sm:text-2xl font-extrabold text-slate-900">
                  {formatMinutesSummary(availabilityData.totals.completed_minutes)}
                </div>
                <div className="mt-1 text-[11px] sm:text-xs text-slate-600">
                  1h: <strong>{availabilityData.totals.completed_1h_count}</strong> &bull; 1.5h:{' '}
                  <strong>{availabilityData.totals.completed_1_5h_count}</strong>
                </div>
              </div>

              <div className={`${CARD_CLASS} p-3 sm:p-4`}>
                <div className="text-xs font-medium text-slate-500">Łączny czas</div>
                <div className="mt-1 flex items-baseline gap-1.5 flex-wrap">
                  <span className="text-lg sm:text-2xl font-extrabold text-slate-900">
                    {formatMinutesSummary(availabilityData.totals.total_minutes)}
                  </span>
                  <span className="text-[11px] font-mono text-slate-500">
                    ({availabilityData.totals.total_hours} h)
                  </span>
                </div>
                <div className="mt-1 text-[11px] sm:text-xs text-slate-500">
                  Instruktorzy: <strong>{availabilityData.totals.instructors_count}</strong>
                </div>
              </div>

              <div className={`${CARD_CLASS} p-3 sm:p-4`}>
                <div className="text-xs font-medium text-slate-500">Zablokowane sloty</div>
                <div className="mt-1 text-lg sm:text-2xl font-extrabold text-amber-700">
                  {availabilityData.totals.blocked_slots_count}
                </div>
                <div className="mt-1 text-[11px] sm:text-xs text-slate-500">
                  Poza pulą godzin
                </div>
              </div>
            </div>
          )}

          {/* Kompaktowa wyszukiwarka instruktora */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="admin-inst-avail-search"
              type="search"
              aria-label="Filtruj zestawienie po instruktorze"
              value={instructorSearch}
              onChange={(e) => setInstructorSearch(e.target.value)}
              placeholder="Szukaj instruktora (imię, nazwisko lub e-mail)..."
              className={`${INPUT_CLASS} pl-10 bg-white`}
            />
          </div>

          {/* Lista instruktorów z rozliczeniem godzin */}
          {loading && filteredAvailabilityInstructors.length === 0 ? (
            <div className={`${CARD_CLASS} p-8 text-center text-sm sm:text-base text-slate-500`}>
              Wczytywanie zestawienia godzin...
            </div>
          ) : filteredAvailabilityInstructors.length === 0 ? (
            <div className={`${CARD_CLASS} p-8 text-center text-base text-slate-500`}>
              Brak instruktorów spełniających kryteria.
            </div>
          ) : (
            <div className="space-y-3.5">
              {filteredAvailabilityInstructors.map((inst) => {
                const isExpanded = expandedInstructorId === inst.instructor_id;
                const allSlots = inst.slots || [];
                const totalSlotPages = Math.max(
                  1,
                  Math.ceil(allSlots.length / instSlotPageSize)
                );
                const safeSlotPage = isExpanded ? Math.min(instSlotPage, totalSlotPages) : 1;
                const visibleSlots = isExpanded
                  ? allSlots.slice(
                      (safeSlotPage - 1) * instSlotPageSize,
                      safeSlotPage * instSlotPageSize
                    )
                  : [];

                return (
                  <div key={inst.instructor_id} className={`${CARD_CLASS} overflow-hidden`}>
                    <div className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3.5 lg:gap-5">
                      {/* Dane instruktora + wyróżniona suma godzin na mobile */}
                      <div className="flex items-start justify-between gap-3 lg:min-w-[220px]">
                        <div className="min-w-0">
                          <h2 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                            {inst.first_name} {inst.last_name}
                          </h2>
                          <p className="text-xs sm:text-sm text-slate-500 break-all">
                            {inst.email}
                          </p>
                          <p className="text-xs text-slate-600 mt-1">
                            Aktywne zapisy klientów:{' '}
                            <strong className="text-slate-900">
                              {inst.confirmed_reservations_count}
                            </strong>
                          </p>
                        </div>

                        <div className="lg:hidden bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5 text-right shrink-0">
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                            Łącznie
                          </div>
                          <div className="text-sm font-extrabold text-emerald-950 whitespace-nowrap">
                            {formatMinutesSummary(inst.total_minutes)}
                          </div>
                        </div>
                      </div>

                      {/* Kompaktowe kafelki rozbicia 1h / 1.5h / godzin */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 flex-1">
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                          <div className="text-[11px] font-medium text-slate-500">Sloty 1h</div>
                          <div className="mt-0.5 text-xs sm:text-sm font-semibold text-slate-900">
                            Plan: <span className="text-emerald-700">{inst.planned_1h_count}</span>
                          </div>
                          <div className="text-xs sm:text-sm font-semibold text-slate-700">
                            Real.: {inst.completed_1h_count}
                          </div>
                        </div>

                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                          <div className="text-[11px] font-medium text-slate-500">Sloty 1.5h</div>
                          <div className="mt-0.5 text-xs sm:text-sm font-semibold text-slate-900">
                            Plan:{' '}
                            <span className="text-emerald-700">{inst.planned_1_5h_count}</span>
                          </div>
                          <div className="text-xs sm:text-sm font-semibold text-slate-700">
                            Real.: {inst.completed_1_5h_count}
                          </div>
                        </div>

                        <div className="col-span-2 sm:col-span-1 bg-slate-50 border border-slate-200 rounded-lg p-2.5 flex sm:block items-center justify-between gap-2">
                          <div className="text-[11px] font-medium text-slate-500">Podział czasu</div>
                          <div className="flex sm:block items-center gap-3">
                            <div className="sm:mt-0.5 text-xs sm:text-sm text-emerald-800 font-semibold">
                              Plan: {formatMinutesSummary(inst.planned_minutes)}
                            </div>
                            <div className="text-xs sm:text-sm text-slate-700 font-semibold">
                              Real.: {formatMinutesSummary(inst.completed_minutes)}
                            </div>
                          </div>
                        </div>

                        <div className="hidden lg:block bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
                            Łączny czas
                          </div>
                          <div className="mt-0.5 text-base font-extrabold text-emerald-950">
                            {formatMinutesSummary(inst.total_minutes)}
                          </div>
                          <div className="text-xs font-mono text-emerald-800">
                            ({inst.total_hours} h)
                          </div>
                        </div>
                      </div>

                      {/* Przycisk rozwinięcia grafiku */}
                      <button
                        type="button"
                        onClick={() => {
                          if (isExpanded) {
                            setExpandedInstructorId(null);
                          } else {
                            setExpandedInstructorId(inst.instructor_id);
                            setInstSlotPage(1);
                          }
                        }}
                        className={`${BTN_SECONDARY} w-full lg:w-auto shrink-0`}
                      >
                        <span>
                          {isExpanded ? 'Ukryj grafik' : `Pokaż grafik (${allSlots.length})`}
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>
                    </div>

                    {/* Rozwijana lista slotów w grafiku instruktora + paginacja */}
                    {isExpanded && (
                      <div className="border-t border-slate-200 bg-slate-50 p-3.5 sm:p-5 space-y-3">
                        {allSlots.length === 0 ? (
                          <p className="text-sm text-slate-500 text-center py-3">
                            Instruktor nie utworzył jeszcze żadnych terminów w grafiku.
                          </p>
                        ) : (
                          <>
                            <div className="hidden md:block overflow-x-auto bg-white border border-slate-200 rounded-lg">
                              <table className="w-full text-left border-collapse">
                                <thead>
                                  <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-500">
                                    <th className="py-3 px-4">Okno dyżuru (24h)</th>
                                    <th className="py-3 px-4">Wymiar</th>
                                    <th className="py-3 px-4">Zapisani uczestnicy</th>
                                    <th className="py-3 px-4">Status dyżuru</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200 text-sm">
                                  {visibleSlots.map((slot) => (
                                    <tr key={slot.id} className="hover:bg-slate-50">
                                      <td className="py-3 px-4 font-medium text-slate-900">
                                        {formatSlotRange24(slot.start_time, slot.end_time)}
                                      </td>
                                      <td className="py-3 px-4 text-slate-700">
                                        {slot.slot_type === 'AVAILABILITY_WINDOW'
                                          ? `Dyżur (${formatMinutesSummary(slot.free_places)})`
                                          : slotTypeShortLabel(slot.slot_type)}
                                      </td>
                                      <td className="py-3 px-4 text-slate-700 font-mono">
                                        {slot.slot_type === 'AVAILABILITY_WINDOW'
                                          ? `${slot.confirmed_reservations_count} os. (${slot.max_capacity} sesje)`
                                          : `${slot.confirmed_reservations_count} / ${slot.max_capacity}`}
                                      </td>
                                      <td className="py-3 px-4">
                                        <SlotStateBadge state={slot.state} />
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>

                            <div className="md:hidden space-y-2">
                              {visibleSlots.map((slot) => (
                                <div
                                  key={slot.id}
                                  className="bg-white border border-slate-200 rounded-lg p-3 space-y-1"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-sm font-bold text-slate-900">
                                      {formatSlotRange24(slot.start_time, slot.end_time)}
                                    </span>
                                    <SlotStateBadge state={slot.state} />
                                  </div>
                                  <div className="flex items-center justify-between text-xs text-slate-600">
                                    <span>
                                      {slot.slot_type === 'AVAILABILITY_WINDOW'
                                        ? `Dyżur (${formatMinutesSummary(slot.free_places)})`
                                        : slotTypeShortLabel(slot.slot_type)}
                                    </span>
                                    <span className="font-mono font-semibold text-slate-800">
                                      {slot.slot_type === 'AVAILABILITY_WINDOW'
                                        ? `Zapisani: ${slot.confirmed_reservations_count} os.`
                                        : `Zapisy: ${slot.confirmed_reservations_count}/${slot.max_capacity}`}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>

                            {allSlots.length > 5 && (
                              <Pagination
                                totalItems={allSlots.length}
                                pageSize={instSlotPageSize}
                                currentPage={safeSlotPage}
                                onPageChange={setInstSlotPage}
                                onPageSizeChange={setInstSlotPageSize}
                                pageSizeOptions={[5, 10, 20]}
                              />
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
