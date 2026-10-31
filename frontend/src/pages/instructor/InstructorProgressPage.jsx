import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeftRight,
  ArrowUpDown,
  CheckCircle2,
  Plus,
  RefreshCw,
  Search,
  TrendingUp,
  X,
} from 'lucide-react';
import apiClient from '../../api/client';
import GradeConverterModal from '../../components/GradeConverterModal';
import Pagination from '../../components/Pagination';
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  CARD_CLASS,
  INPUT_CLASS,
  SELECT_CLASS,
  TEXTAREA_CLASS,
} from '../../styles/ui';
import { formatDateTime24 } from '../../utils/dateUtils';
import {
  KURTYKA_GRADES,
  POPULAR_KURTYKA_GRADES,
  extractApiError,
  getGradeBadgeClasses,
  getGradeEquivalent,
} from '../../utils/grades';

const MAX_FEEDBACK_LENGTH = 500;

export default function InstructorProgressPage() {
  const [searchParams] = useSearchParams();
  const initialClientId = searchParams.get('clientId') || '';

  const [entries, setEntries] = useState([]);
  const [mySlots, setMySlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [converterOpen, setConverterOpen] = useState(false);

  // Stan formularza nowego wpisu
  const [clientId, setClientId] = useState(initialClientId);
  const [grade, setGrade] = useState('VI+');
  const [routeName, setRouteName] = useState('');
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filtry i paginacja listy wpisów
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    try {
      const [progRes, slotsRes] = await Promise.all([
        apiClient.get('/api/v1/instructor/progress'),
        apiClient.get('/api/v1/instructor/slots'),
      ]);
      setEntries(Array.isArray(progRes.data) ? progRes.data : []);
      setMySlots(Array.isArray(slotsRes.data) ? slotsRes.data : []);
    } catch (err) {
      setErrorMsg(
        extractApiError(err, 'Błąd pobierania danych Dziennika postępów.')
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    Promise.all([
      apiClient.get('/api/v1/instructor/progress'),
      apiClient.get('/api/v1/instructor/slots'),
    ])
      .then(([progRes, slotsRes]) => {
        if (!active) return;
        setEntries(Array.isArray(progRes.data) ? progRes.data : []);
        setMySlots(Array.isArray(slotsRes.data) ? slotsRes.data : []);
      })
      .catch((err) => {
        if (active) {
          setErrorMsg(
            extractApiError(err, 'Błąd pobierania danych Dziennika postępów.')
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  // Ścisła izolacja: wyłącznie klienci posiadający potwierdzoną rezerwację na własnych slotach instruktora
  const myClients = useMemo(() => {
    const map = new Map();
    for (const slot of mySlots) {
      for (const r of slot.reservations || []) {
        if (r.status === 'confirmed' && r.client_id && !map.has(r.client_id)) {
          map.set(r.client_id, {
            id: r.client_id,
            name: r.client_name || `Klient #${r.client_id}`,
            email: r.client_email || '',
          });
        }
      }
    }
    return Array.from(map.values());
  }, [mySlots]);

  const effectiveSelectedClientId = useMemo(() => {
    if (clientId && myClients.some((c) => String(c.id) === String(clientId))) {
      return String(clientId);
    }
    return myClients[0] ? String(myClients[0].id) : '';
  }, [clientId, myClients]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const parsedId = parseInt(effectiveSelectedClientId, 10);
    if (!parsedId || !grade.trim() || !feedback.trim()) {
      setErrorMsg('Wybierz uczestnika swojego treningu, wycenę drogi oraz wpisz uwagi.');
      return;
    }

    setIsSubmitting(true);
    try {
      await apiClient.post('/api/v1/instructor/progress', {
        client_id: parsedId,
        grade: grade.trim(),
        route_name: routeName.trim() || null,
        instructor_feedback: feedback.slice(0, MAX_FEEDBACK_LENGTH).trim(),
      });
      setSuccessMsg('Nowy wpis w Dzienniku postępów został zapisany.');
      setRouteName('');
      setFeedback('');
      await fetchAllData();
    } catch (err) {
      setErrorMsg(extractApiError(err, 'Nie udało się zapisać wpisu w Dzienniku postępów.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const remainingChars = MAX_FEEDBACK_LENGTH - feedback.length;
  const selectedEquivalent = getGradeEquivalent(grade);

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = entries.filter((entry) => {
      if (!q) return true;
      return (
        (entry.client_name || '').toLowerCase().includes(q) ||
        (entry.route_name || '').toLowerCase().includes(q) ||
        (entry.grade || '').toLowerCase().includes(q)
      );
    });

    list.sort((a, b) => {
      const diff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return sortOrder === 'asc' ? diff : -diff;
    });

    return list;
  }, [entries, searchQuery, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedEntries = filteredEntries.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900">
          Dziennik postępów
        </h1>

        <button
          type="button"
          onClick={() => setConverterOpen(true)}
          className={BTN_SECONDARY}
        >
          <ArrowLeftRight className="w-4 h-4 text-emerald-600" />
          <span>Tabela i przelicznik skal wspinaczkowych</span>
        </button>
      </div>

      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-3.5 flex items-center justify-between gap-3 text-base">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
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
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg hover:bg-emerald-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Formularz dodawania wpisu */}
        <section className={`${CARD_CLASS} p-6 lg:col-span-5 space-y-5`}>
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2.5">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
              <h2 className="text-lg font-bold text-slate-900">Dodaj wpis postępów</h2>
            </div>
          </div>

          {!loading && myClients.length === 0 ? (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 text-sm text-slate-600">
              <p className="font-semibold text-slate-800">
                Brak uczestników na Twoich terminach
              </p>
              <p>
                Ze względów bezpieczeństwa wpisy w Dzienniku postępów możesz wystawiać wyłącznie
                klientom, którzy zarezerwowali u Ciebie trening.
              </p>
              <Link to="/app/instructor" className={BTN_SECONDARY}>
                Przejdź do swojego grafiku
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="known-client-select"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Uczestnik Twojego treningu *
                </label>
                <select
                  id="known-client-select"
                  value={effectiveSelectedClientId}
                  onChange={(e) => setClientId(e.target.value)}
                  required
                  className={SELECT_CLASS}
                >
                  {myClients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.email ? `(${c.email})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label htmlFor="grade-select" className="text-sm font-medium text-slate-700">
                    Wycena w skali krakowskiej (Kurtyki) *
                  </label>
                  <button
                    type="button"
                    onClick={() => setConverterOpen(true)}
                    className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 underline"
                  >
                    Przelicznik skal
                  </button>
                </div>

                <select
                  id="grade-select"
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                  className={`${SELECT_CLASS} font-mono font-bold`}
                >
                  {KURTYKA_GRADES.map((g) => {
                    const eq = getGradeEquivalent(g);
                    return (
                      <option key={g} value={g}>
                        {g} {eq ? `(fr. ${eq.french} / UIAA ${eq.uiaa})` : ''}
                      </option>
                    );
                  })}
                </select>

                {selectedEquivalent && (
                  <p className="text-xs text-slate-500 mt-1.5">
                    Odpowiednik: francuska <strong>{selectedEquivalent.french}</strong> • UIAA{' '}
                    <strong>{selectedEquivalent.uiaa}</strong> ({selectedEquivalent.level})
                  </p>
                )}

                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {POPULAR_KURTYKA_GRADES.map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setGrade(g)}
                      className={`min-h-[38px] px-2.5 py-1 rounded-md text-xs font-mono font-bold border transition-colors ${
                        grade === g
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label
                  htmlFor="route-name-input"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Nazwa drogi / bouldera (opcjonalnie)
                </label>
                <input
                  id="route-name-input"
                  type="text"
                  maxLength={100}
                  value={routeName}
                  onChange={(e) => setRouteName(e.target.value)}
                  placeholder="np. Żółty filar w przewieszeniu"
                  className={INPUT_CLASS}
                />
              </div>

              <div>
                <label
                  htmlFor="feedback-textarea"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Uwagi techniczne i motoryczne *
                </label>
                <textarea
                  id="feedback-textarea"
                  rows={4}
                  maxLength={MAX_FEEDBACK_LENGTH}
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value.slice(0, MAX_FEEDBACK_LENGTH))}
                  placeholder="np. Bardzo dobra praca nóg na małych stopniach. Na kolejnym treningu skupić się na skręcaniu biodra w przewieszeniu."
                  required
                  className={TEXTAREA_CLASS}
                />
                <div
                  className={`mt-1.5 text-xs font-medium text-right ${
                    remainingChars <= 50 ? 'text-amber-700 font-semibold' : 'text-slate-500'
                  }`}
                >
                  Pozostało: {remainingChars}/{MAX_FEEDBACK_LENGTH} znaków
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className={`${BTN_PRIMARY} w-full`}
              >
                <Plus className="w-5 h-5" />
                <span>{isSubmitting ? 'Zapisywanie wpisu...' : 'Zapisz w Dzienniku postępów'}</span>
              </button>
            </form>
          )}
        </section>

        {/* Lista wystawionych wpisów zalogowanego instruktora */}
        <div className="lg:col-span-7 space-y-4">
          <div className={`${CARD_CLASS} p-5 space-y-4`}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h2 className="text-lg font-bold text-slate-900">
                Moje wystawione wpisy ({entries.length})
              </h2>
              <button type="button" onClick={fetchAllData} className={BTN_SECONDARY}>
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                <span>Odśwież</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="relative">
                <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Szukaj klienta, wyceny lub drogi..."
                  className={`${INPUT_CLASS} pl-11`}
                />
              </div>

              <div className="relative">
                <ArrowUpDown className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <select
                  value={sortOrder}
                  onChange={(e) => {
                    setSortOrder(e.target.value);
                    setCurrentPage(1);
                  }}
                  className={`${SELECT_CLASS} pl-10`}
                >
                  <option value="desc">Od najnowszych</option>
                  <option value="asc">Od najstarszych</option>
                </select>
              </div>
            </div>
          </div>

          {loading && entries.length === 0 ? (
            <div className={`${CARD_CLASS} p-10 text-center text-base text-slate-500`}>
              Wczytywanie historii wpisów...
            </div>
          ) : paginatedEntries.length === 0 ? (
            <div className={`${CARD_CLASS} p-10 text-center text-base text-slate-500`}>
              Brak wpisów spełniających wybrane kryteria.
            </div>
          ) : (
            <>
              {/* Tabela Desktop */}
              <div className={`hidden md:block ${CARD_CLASS} overflow-hidden`}>
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-600">
                    <tr>
                      <th className="py-3.5 px-4">Data</th>
                      <th className="py-3.5 px-4">Klient</th>
                      <th className="py-3.5 px-4">Wycena</th>
                      <th className="py-3.5 px-4">Droga i uwagi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-sm sm:text-base">
                    {paginatedEntries.map((entry) => (
                      <tr key={entry.id} className="hover:bg-slate-50/80 align-top">
                        <td className="py-4 px-4 whitespace-nowrap text-sm text-slate-600">
                          {formatDateTime24(entry.created_at)}
                        </td>
                        <td className="py-4 px-4 font-semibold text-slate-900">
                          {entry.client_name || `Klient #${entry.client_id}`}
                        </td>
                        <td className="py-4 px-4">
                          <span
                            className={`inline-block font-mono font-bold text-sm px-3 py-1 rounded-lg border ${getGradeBadgeClasses(
                              entry.grade
                            )}`}
                          >
                            {entry.grade}
                          </span>
                        </td>
                        <td className="py-4 px-4 space-y-1">
                          {entry.route_name && (
                            <div className="font-semibold text-slate-900">{entry.route_name}</div>
                          )}
                          <p className="text-sm text-slate-600 leading-relaxed break-words">
                            {entry.instructor_feedback}
                          </p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Karty Mobile */}
              <div className="md:hidden space-y-3">
                {paginatedEntries.map((entry) => (
                  <div key={entry.id} className={`${CARD_CLASS} p-4 space-y-2.5`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-base font-bold text-slate-900">
                          {entry.client_name || `Klient #${entry.client_id}`}
                        </div>
                        <div className="text-xs text-slate-500">
                          {formatDateTime24(entry.created_at)}
                        </div>
                      </div>
                      <span
                        className={`inline-block font-mono font-bold text-sm px-3 py-1 rounded-lg border ${getGradeBadgeClasses(
                          entry.grade
                        )}`}
                      >
                        {entry.grade}
                      </span>
                    </div>

                    {entry.route_name && (
                      <div className="text-sm font-semibold text-slate-800">
                        Droga: {entry.route_name}
                      </div>
                    )}

                    <p className="text-sm text-slate-600 leading-relaxed pt-1 border-t border-slate-100 break-words">
                      {entry.instructor_feedback}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}

          <Pagination
            totalItems={filteredEntries.length}
            pageSize={pageSize}
            currentPage={safePage}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      </div>

      <GradeConverterModal
        isOpen={converterOpen}
        onClose={() => setConverterOpen(false)}
        initialGrade={grade}
      />
    </div>
  );
}
