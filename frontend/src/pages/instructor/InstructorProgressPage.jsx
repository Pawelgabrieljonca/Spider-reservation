import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowUpDown,
  CheckCircle2,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react';
import apiClient from '../../api/client';
import GradeConverterModal from '../../components/GradeConverterModal';
import GradePicker from '../../components/GradePicker';
import Pagination from '../../components/Pagination';
import SEO from '../../components/SEO';
import {
  BTN_DANGER,
  BTN_PRIMARY,
  BTN_SECONDARY,
  CARD_CLASS,
  INPUT_CLASS,
  SELECT_CLASS,
  TEXTAREA_CLASS,
} from '../../styles/ui';
import { formatDateTime24 } from '../../utils/dateUtils';
import { extractApiError, getGradeBadgeClasses } from '../../utils/grades';

const MAX_FEEDBACK_LENGTH = 500;

function formatShortDate(dateObj) {
  return dateObj.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' });
}

/** Modal edycji wpisu (poprawa literówki, wyceny, drogi). */
function EditEntryModal({ entry, onClose, onSaved, onOpenConverter }) {
  const [grade, setGrade] = useState(entry.grade);
  const [routeName, setRouteName] = useState(entry.route_name || '');
  const [feedback, setFeedback] = useState(entry.instructor_feedback || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const remaining = MAX_FEEDBACK_LENGTH - feedback.length;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!feedback.trim() || feedback.trim().length < 2) {
      setError('Uwagi muszą zawierać co najmniej 2 znaki.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await apiClient.patch(`/api/v1/instructor/progress/${entry.id}`, {
        grade,
        route_name: routeName.trim() || null,
        instructor_feedback: feedback.trim(),
      });
      onSaved(res.data);
    } catch (err) {
      setError(extractApiError(err, 'Nie udało się zapisać zmian we wpisie.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-entry-title"
    >
      <form
        onSubmit={handleSubmit}
        className="bg-white border border-slate-200 rounded-2xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-5 sm:p-6 space-y-4"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 id="edit-entry-title" className="text-lg font-bold text-slate-900">
              Edytuj wpis
            </h3>
            <p className="text-xs text-slate-500">
              Klient: <strong>{entry.client_name || `#${entry.client_id}`}</strong> •{' '}
              {formatDateTime24(entry.created_at)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zamknij"
            className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl px-3.5 py-2.5 flex items-center gap-2 text-sm">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <GradePicker value={grade} onChange={setGrade} onOpenConverter={onOpenConverter} />

        <div>
          <label htmlFor="edit-route-name" className="block text-sm font-medium text-slate-700 mb-1.5">
            Nazwa drogi / bouldera (opcjonalnie)
          </label>
          <input
            id="edit-route-name"
            type="text"
            maxLength={100}
            value={routeName}
            onChange={(e) => setRouteName(e.target.value)}
            className={INPUT_CLASS}
          />
        </div>

        <div>
          <label htmlFor="edit-feedback" className="block text-sm font-medium text-slate-700 mb-1.5">
            Uwagi techniczne i motoryczne *
          </label>
          <textarea
            id="edit-feedback"
            rows={4}
            maxLength={MAX_FEEDBACK_LENGTH}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value.slice(0, MAX_FEEDBACK_LENGTH))}
            className={TEXTAREA_CLASS}
          />
          <div
            className={`mt-1.5 text-xs font-medium text-right ${
              remaining <= 50 ? 'text-amber-700 font-semibold' : 'text-slate-500'
            }`}
          >
            Pozostało: {remaining}/{MAX_FEEDBACK_LENGTH} znaków
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} disabled={saving} className={BTN_SECONDARY}>
            Anuluj
          </button>
          <button type="submit" disabled={saving} className={BTN_PRIMARY}>
            <Save className="w-4 h-4" />
            <span>{saving ? 'Zapisywanie…' : 'Zapisz zmiany'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}

/** Modal potwierdzenia usunięcia wpisu. */
function DeleteEntryModal({ entry, onClose, onDeleted }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await apiClient.delete(`/api/v1/instructor/progress/${entry.id}`);
      onDeleted(entry);
    } catch (err) {
      setError(extractApiError(err, 'Nie udało się usunąć wpisu.'));
      setDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="delete-entry-title"
    >
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xl w-full max-w-md p-5 sm:p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-100 text-red-700 flex items-center justify-center shrink-0">
            <Trash2 className="w-5 h-5" />
          </div>
          <div>
            <h3 id="delete-entry-title" className="text-lg font-bold text-slate-900">
              Usunąć wpis z dziennika?
            </h3>
            <p className="text-sm text-slate-600 mt-1">
              Wpis dla <strong>{entry.client_name || `klienta #${entry.client_id}`}</strong> (
              <span className="font-mono font-bold">{entry.grade}</span>
              {entry.route_name ? `, ${entry.route_name}` : ''}) zniknie również z dziennika
              klienta. Tej operacji nie można cofnąć.
            </p>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl px-3.5 py-2.5 text-sm">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} disabled={deleting} className={BTN_SECONDARY}>
            Anuluj
          </button>
          <button type="button" onClick={handleDelete} disabled={deleting} className={BTN_DANGER}>
            <Trash2 className="w-4 h-4" />
            <span>{deleting ? 'Usuwanie…' : 'Usuń wpis'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function EntryActions({ entry, onEdit, onDelete }) {
  return (
    <div className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={() => onEdit(entry)}
        aria-label={`Edytuj wpis: ${entry.client_name || ''} ${entry.grade}`}
        title="Edytuj"
        className="inline-flex items-center justify-center min-h-[40px] min-w-[40px] rounded-lg text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
      >
        <Pencil className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => onDelete(entry)}
        aria-label={`Usuń wpis: ${entry.client_name || ''} ${entry.grade}`}
        title="Usuń"
        className="inline-flex items-center justify-center min-h-[40px] min-w-[40px] rounded-lg text-slate-600 hover:text-red-700 hover:bg-red-50 transition-colors"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

export default function InstructorProgressPage() {
  const [searchParams] = useSearchParams();
  const initialClientId = searchParams.get('clientId') || '';

  const [entries, setEntries] = useState([]);
  const [mySlots, setMySlots] = useState([]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [converterOpen, setConverterOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [deletingEntry, setDeletingEntry] = useState(null);

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
    try {
      const [progRes, slotsRes] = await Promise.all([
        apiClient.get('/api/v1/instructor/progress'),
        apiClient.get('/api/v1/instructor/slots'),
      ]);
      setEntries(Array.isArray(progRes.data) ? progRes.data : []);
      setMySlots(Array.isArray(slotsRes.data) ? slotsRes.data : []);
      setNowMs(Date.now());
    } catch (err) {
      setErrorMsg(extractApiError(err, 'Błąd pobierania danych Dziennika postępów.'));
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
        setNowMs(Date.now());
      })
      .catch((err) => {
        if (active) {
          setErrorMsg(extractApiError(err, 'Błąd pobierania danych Dziennika postępów.'));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  // Automatyczna rewalidacja w tle (powrót do karty) – zamiast ręcznego przycisku „Odśwież”
  useEffect(() => {
    const revalidate = () => {
      if (document.visibilityState === 'visible') fetchAllData();
    };
    window.addEventListener('focus', revalidate);
    document.addEventListener('visibilitychange', revalidate);
    return () => {
      window.removeEventListener('focus', revalidate);
      document.removeEventListener('visibilitychange', revalidate);
    };
  }, [fetchAllData]);

  // Ścisła izolacja: wyłącznie klienci z potwierdzoną rezerwacją na własnych slotach instruktora.
  // Dla każdego wyliczamy datę ostatniego (lub najbliższego) wspólnego treningu.
  const myClients = useMemo(() => {
    const map = new Map();
    for (const slot of mySlots) {
      for (const r of slot.reservations || []) {
        if (r.status !== 'confirmed' || !r.client_id) continue;
        const startMs = new Date(r.slot_start || slot.start_time).getTime();
        const endMs = new Date(r.slot_end || slot.end_time).getTime();
        const current = map.get(r.client_id) || {
          id: r.client_id,
          name: r.client_name || `Klient #${r.client_id}`,
          lastPastMs: null,
          nextMs: null,
        };
        if (endMs <= nowMs) {
          if (current.lastPastMs === null || startMs > current.lastPastMs) current.lastPastMs = startMs;
        } else if (current.nextMs === null || startMs < current.nextMs) {
          current.nextMs = startMs;
        }
        map.set(r.client_id, current);
      }
    }
    return Array.from(map.values())
      .map((c) => {
        let hint = '';
        if (c.lastPastMs !== null) hint = `ostatni trening: ${formatShortDate(new Date(c.lastPastMs))}`;
        else if (c.nextMs !== null) hint = `najbliższy trening: ${formatShortDate(new Date(c.nextMs))}`;
        return { ...c, hint };
      })
      .sort((a, b) => {
        // Najpierw klienci po odbytym treningu (najświeższy na górze), potem z nadchodzącym
        if (a.lastPastMs !== null && b.lastPastMs !== null) return b.lastPastMs - a.lastPastMs;
        if (a.lastPastMs !== null) return -1;
        if (b.lastPastMs !== null) return 1;
        return (a.nextMs || 0) - (b.nextMs || 0);
      });
  }, [mySlots, nowMs]);

  const effectiveSelectedClientId = useMemo(() => {
    if (clientId && myClients.some((c) => String(c.id) === String(clientId))) {
      return String(clientId);
    }
    return myClients[0] ? String(myClients[0].id) : '';
  }, [clientId, myClients]);

  const prefilledFromCalendar =
    Boolean(initialClientId) && String(initialClientId) === effectiveSelectedClientId;

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

  const handleEntrySaved = (updated) => {
    setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    setEditingEntry(null);
    setSuccessMsg('Wpis został zaktualizowany.');
  };

  const handleEntryDeleted = (deleted) => {
    setEntries((prev) => prev.filter((e) => e.id !== deleted.id));
    setDeletingEntry(null);
    setSuccessMsg('Wpis został usunięty z Dziennika postępów.');
  };

  const remainingChars = MAX_FEEDBACK_LENGTH - feedback.length;

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
  const paginatedEntries = filteredEntries.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <div className="space-y-6">
      <SEO
        title="Dziennik Podopiecznych | Panel Instruktora CW Spider"
        description="Rejestracja i monitoring przejść dróg wspinaczkowych klientów Centrum Wspinaczkowego Spider."
        path="/app/instructor/progress"
        robots="noindex, nofollow"
      />
      <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900">
        Dziennik postępów
      </h1>

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
              <p className="font-semibold text-slate-800">Brak uczestników na Twoich terminach</p>
              <p>
                Ze względów bezpieczeństwa wpisy w Dzienniku postępów możesz wystawiać wyłącznie
                klientom, którzy zarezerwowali u Ciebie trening.
              </p>
              <Link to="/app/instructor" className={BTN_SECONDARY}>
                Przejdź do swojego grafiku
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
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
                      {c.name}
                      {c.hint ? ` (${c.hint})` : ''}
                    </option>
                  ))}
                </select>
                {prefilledFromCalendar && (
                  <p className="text-xs text-emerald-700 mt-1.5">
                    Klient wybrany automatycznie z grafiku.
                  </p>
                )}
              </div>

              <GradePicker
                value={grade}
                onChange={setGrade}
                onOpenConverter={() => setConverterOpen(true)}
                label="Wycena drogi (skala krakowska) *"
              />

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

              <button type="submit" disabled={isSubmitting} className={`${BTN_PRIMARY} w-full`}>
                <Plus className="w-5 h-5" />
                <span>{isSubmitting ? 'Zapisywanie wpisu...' : 'Zapisz w Dzienniku postępów'}</span>
              </button>
            </form>
          )}
        </section>

        {/* Lista wystawionych wpisów zalogowanego instruktora */}
        <div className="lg:col-span-7 space-y-4">
          <div className={`${CARD_CLASS} p-5 space-y-4`}>
            <h2 className="text-lg font-bold text-slate-900">
              Moje wystawione wpisy ({entries.length})
            </h2>

            {entries.length > 1 && (
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
            )}
          </div>

          {loading && entries.length === 0 ? (
            <div className={`${CARD_CLASS} p-10 text-center text-base text-slate-500`}>
              Wczytywanie historii wpisów...
            </div>
          ) : paginatedEntries.length === 0 ? (
            <div className={`${CARD_CLASS} p-10 text-center text-base text-slate-500`}>
              {entries.length === 0
                ? 'Nie wystawiono jeszcze żadnych wpisów.'
                : 'Brak wpisów spełniających wybrane kryteria.'}
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
                      <th className="py-3.5 px-4 text-right">Akcje</th>
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
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <EntryActions
                            entry={entry}
                            onEdit={setEditingEntry}
                            onDelete={setDeletingEntry}
                          />
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

                    <div className="flex justify-end pt-1 border-t border-slate-100">
                      <EntryActions
                        entry={entry}
                        onEdit={setEditingEntry}
                        onDelete={setDeletingEntry}
                      />
                    </div>
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

      {editingEntry && (
        <EditEntryModal
          entry={editingEntry}
          onClose={() => setEditingEntry(null)}
          onSaved={handleEntrySaved}
          onOpenConverter={() => setConverterOpen(true)}
        />
      )}

      {deletingEntry && (
        <DeleteEntryModal
          entry={deletingEntry}
          onClose={() => setDeletingEntry(null)}
          onDeleted={handleEntryDeleted}
        />
      )}

      <GradeConverterModal
        isOpen={converterOpen}
        onClose={() => setConverterOpen(false)}
        initialGrade={editingEntry ? editingEntry.grade : grade}
      />
    </div>
  );
}
