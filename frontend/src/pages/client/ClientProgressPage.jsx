import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeftRight,
  ArrowUpDown,
  Award,
  Calendar,
  RefreshCw,
  Search,
  TrendingUp,
  User,
  X,
} from 'lucide-react';
import apiClient from '../../api/client';
import GradeConverterModal from '../../components/GradeConverterModal';
import Pagination from '../../components/Pagination';
import SEO from '../../components/SEO';
import {
  BTN_SECONDARY,
  CARD_CLASS,
  INPUT_CLASS,
  SELECT_CLASS,
} from '../../styles/ui';
import { formatDateTime24 } from '../../utils/dateUtils';
import {
  extractApiError,
  getGradeBadgeClasses,
  getGradeEquivalent,
  getGradeRank,
} from '../../utils/grades';

export default function ClientProgressPage() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [converterOpen, setConverterOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState(
    () => new URLSearchParams(window.location.search).get('q') || ''
  );
  const [sortOrder, setSortOrder] = useState('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  const fetchProgress = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/api/v1/client/progress');
      setEntries(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setErrorMsg(extractApiError(err, 'Błąd pobierania Dziennika postępów.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    apiClient
      .get('/api/v1/client/progress')
      .then((res) => {
        if (active) setEntries(Array.isArray(res.data) ? res.data : []);
      })
      .catch((err) => {
        if (active) {
          setErrorMsg(extractApiError(err, 'Błąd pobierania Dziennika postępów.'));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const highestGrade = useMemo(() => {
    if (entries.length === 0) return '—';
    const sorted = [...entries].sort((a, b) => getGradeRank(b.grade) - getGradeRank(a.grade));
    return sorted[0]?.grade || '—';
  }, [entries]);

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = entries.filter((entry) => {
      if (!q) return true;
      return (
        (entry.instructor_name || '').toLowerCase().includes(q) ||
        (entry.route_name || '').toLowerCase().includes(q) ||
        (entry.grade || '').toLowerCase().includes(q) ||
        (entry.instructor_feedback || '').toLowerCase().includes(q)
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
      <SEO
        title="Dziennik Postępów Wspinaczkowych | CW Spider"
        description="Śledź swój progres na ścianie wspinaczkowej w CW Spider Bydgoszcz. Historia pokonanych dróg, statystyki trudności i poziomy zaawansowania."
        path="/app/client/progress"
        robots="noindex, nofollow"
      />
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

      {/* Podsumowanie postępów */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className={`${CARD_CLASS} p-5 flex items-center justify-between`}>
          <div>
            <p className="text-sm font-medium text-slate-500">Zarejestrowane przejścia</p>
            <p className="text-2xl font-extrabold text-slate-900 mt-1">{entries.length}</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        <div className={`${CARD_CLASS} p-5 flex items-center justify-between`}>
          <div>
            <p className="text-sm font-medium text-slate-500">Najwyższa wycena</p>
            <p className="text-2xl font-mono font-extrabold text-slate-900 mt-1">{highestGrade}</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
            <Award className="w-5 h-5" />
          </div>
        </div>

        <div className={`${CARD_CLASS} p-5 flex items-center justify-between`}>
          <div>
            <p className="text-sm font-medium text-slate-500">Ostatni wpis</p>
            <p className="text-base font-bold text-slate-900 mt-1">
              {entries[0] ? formatDateTime24(entries[0].created_at) : 'Brak wpisów'}
            </p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center">
            <Calendar className="w-5 h-5" />
          </div>
        </div>
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

      {/* Pasek wyszukiwania i sortowania */}
      <section className={`${CARD_CLASS} p-5 flex flex-col md:flex-row md:items-end gap-4`}>
        <div className="flex-1">
          <label
            htmlFor="progress-search"
            className="block text-sm font-medium text-slate-700 mb-1.5"
          >
            Szukaj po trenerze, wycenie lub nazwie drogi
          </label>
          <div className="relative">
            <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="progress-search"
              type="search"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="np. VI.1+, Kowalski, filar..."
              className={`${INPUT_CLASS} pl-11`}
            />
          </div>
        </div>

        <div className="w-full md:w-64">
          <label htmlFor="progress-sort" className="block text-sm font-medium text-slate-700 mb-1.5">
            Sortowanie po dacie
          </label>
          <div className="relative">
            <ArrowUpDown className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              id="progress-sort"
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

        <button type="button" onClick={fetchProgress} className={BTN_SECONDARY}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Odśwież</span>
        </button>
      </section>

      {/* Lista wpisów Dziennika postępów */}
      {loading && entries.length === 0 ? (
        <div className={`${CARD_CLASS} p-12 text-center text-base text-slate-500`}>
          Wczytywanie Twojego Dziennika postępów...
        </div>
      ) : paginatedEntries.length === 0 ? (
        <div className={`${CARD_CLASS} p-10 text-center space-y-2`}>
          <p className="text-lg font-semibold text-slate-800">
            Brak wpisów w Dzienniku postępów
          </p>
          <p className="text-base text-slate-500">
            Po odbytym treningu Twój instruktor doda tutaj wyceny pokonanych dróg oraz wskazówki.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {paginatedEntries.map((entry) => {
            const eq = getGradeEquivalent(entry.grade);
            return (
              <article key={entry.id} className={`${CARD_CLASS} p-5 sm:p-6 space-y-4`}>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-3.5">
                  <div className="flex items-center gap-3.5">
                    <div className="text-center">
                      <span
                        className={`inline-flex items-center justify-center min-w-[64px] px-3.5 py-1.5 rounded-xl border font-mono text-lg font-extrabold shadow-sm ${getGradeBadgeClasses(
                          entry.grade
                        )}`}
                      >
                        {entry.grade}
                      </span>
                      {eq && (
                        <div className="text-[11px] font-mono text-slate-500 mt-1">
                          fr. {eq.french}
                        </div>
                      )}
                    </div>

                    <div>
                      <h2 className="text-lg font-bold text-slate-900">
                        {entry.route_name || 'Droga treningowa CW Spider'}
                      </h2>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500 mt-0.5">
                        <span>{formatDateTime24(entry.created_at)}</span>
                        <span>&bull;</span>
                        <span className="inline-flex items-center gap-1 text-slate-700 font-medium">
                          <User className="w-3.5 h-3.5 text-emerald-600" />
                          Trener: {entry.instructor_name || 'Instruktor CW Spider'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                    Uwagi techniczne instruktora
                  </div>
                  <p className="text-base text-slate-800 leading-relaxed whitespace-pre-line break-words">
                    {entry.instructor_feedback}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Pagination
        totalItems={filteredEntries.length}
        pageSize={pageSize}
        currentPage={safePage}
        onPageChange={setCurrentPage}
        onPageSizeChange={setPageSize}
      />

      <GradeConverterModal
        isOpen={converterOpen}
        onClose={() => setConverterOpen(false)}
        initialGrade={highestGrade !== '—' ? highestGrade : 'VI+'}
      />
    </div>
  );
}
