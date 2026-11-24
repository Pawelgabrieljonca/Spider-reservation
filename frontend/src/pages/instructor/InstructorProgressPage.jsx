import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowUpDown, Award, ClipboardList, Pencil, Plus, Save, Search, ShieldCheck, Trash2, TrendingUp } from 'lucide-react';
import apiClient, { extractApiError, useRevalidate } from '../../core/api';
import { EXPERIENCE_LEVEL_OPTIONS, experienceLevelLabel, formatDateTime24, formatShortDate } from '../../core/dateUtils';
import { AlertBanner, BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, CARD_CLASS, ExperienceLevelBadge, INPUT_CLASS, ModalShell, Pagination, SELECT_CLASS, TEXTAREA_CLASS } from '../../ui/common';
import ClientVerificationModal from './ClientVerificationModal';

const MAX_FEEDBACK_LENGTH = 500;
const GRADE_BADGE_CLASS = 'font-mono font-bold text-sm px-2.5 py-0.5 rounded-lg border bg-emerald-50 text-emerald-900 border-emerald-200';

function ProgressEntryFields({ idPrefix, grade, setGrade, routeName, setRouteName, feedback, setFeedback, routePlaceholder = '' }) {
  const remaining = MAX_FEEDBACK_LENGTH - feedback.length;
  return (
    <>
      <div>
        <label htmlFor={`${idPrefix}-grade`} className="block text-sm font-medium text-slate-700 mb-1.5">Trudność drogi / dróg *</label>
        <input id={`${idPrefix}-grade`} type="text" maxLength={10} required value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="np. VI.1+, 6b, V+" className={INPUT_CLASS} />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-route`} className="block text-sm font-medium text-slate-700 mb-1.5">Nazwa drogi / bouldera (opcjonalnie)</label>
        <input id={`${idPrefix}-route`} type="text" maxLength={100} value={routeName} onChange={(e) => setRouteName(e.target.value)} placeholder={routePlaceholder} className={INPUT_CLASS} />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-feedback`} className="block text-sm font-medium text-slate-700 mb-1.5">Uwagi techniczne i motoryczne *</label>
        <textarea id={`${idPrefix}-feedback`} rows={4} maxLength={MAX_FEEDBACK_LENGTH} value={feedback} onChange={(e) => setFeedback(e.target.value.slice(0, MAX_FEEDBACK_LENGTH))} required placeholder="Wskazówki po treningu..." className={TEXTAREA_CLASS} />
        <div className={`mt-1 text-xs text-right ${remaining <= 50 ? 'text-amber-700 font-semibold' : 'text-slate-500'}`}>Pozostało: {remaining}/{MAX_FEEDBACK_LENGTH}</div>
      </div>
    </>
  );
}

function EditEntryModal({ entry, onClose, onSaved }) {
  const [grade, setGrade] = useState(entry.grade);
  const [routeName, setRouteName] = useState(entry.route_name || '');
  const [feedback, setFeedback] = useState(entry.instructor_feedback || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!grade.trim() || feedback.trim().length < 2) { setError('Wpisz trudność drogi oraz uwagi (min. 2 znaki).'); return; }
    setSaving(true); setError(null);
    try {
      const res = await apiClient.patch(`/api/v1/instructor/progress/${entry.id}`, {
        grade: grade.trim(),
        route_name: routeName.trim() || null,
        instructor_feedback: feedback.trim(),
      });
      onSaved(res.data);
    } catch (err) {
      setError(extractApiError(err, 'Nie udało się zapisać zmian we wpisie.'));
    } finally { setSaving(false); }
  };

  return (
    <ModalShell title="Edytuj wpis" subtitle={`Klient: ${entry.client_name || `#${entry.client_id}`} • ${formatDateTime24(entry.created_at)}`} onClose={onClose} maxWidth="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <AlertBanner type="error" message={error} onClose={() => setError(null)} />
        <ProgressEntryFields idPrefix="edit" grade={grade} setGrade={setGrade} routeName={routeName} setRouteName={setRouteName} feedback={feedback} setFeedback={setFeedback} />
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} disabled={saving} className={BTN_SECONDARY}>Anuluj</button>
          <button type="submit" disabled={saving} className={BTN_PRIMARY}><Save className="w-4 h-4" /><span>{saving ? 'Zapisywanie…' : 'Zapisz zmiany'}</span></button>
        </div>
      </form>
    </ModalShell>
  );
}

export default function InstructorProgressPage() {
  const [searchParams] = useSearchParams();
  const initialClientId = searchParams.get('clientId') || '';

  const [entries, setEntries] = useState([]);
  const [clientsData, setClientsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [editingEntry, setEditingEntry] = useState(null);
  const [deletingEntry, setDeletingEntry] = useState(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [verifyModalClientId, setVerifyModalClientId] = useState(null);
  const [levelOverride, setLevelOverride] = useState(null);
  const [verifyingLevel, setVerifyingLevel] = useState(false);

  const [clientId, setClientId] = useState(initialClientId);
  const [grade, setGrade] = useState('');
  const [routeName, setRouteName] = useState('');
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  const fetchAll = useCallback(async (isActive = () => true) => {
    try {
      const [p, c] = await Promise.all([apiClient.get('/api/v1/instructor/progress'), apiClient.get('/api/v1/instructor/clients')]);
      if (!isActive()) return;
      setEntries(Array.isArray(p.data) ? p.data : []);
      setClientsData(Array.isArray(c.data) ? c.data : []);
    } catch (err) {
      if (isActive()) setErrorMsg(extractApiError(err, 'Błąd pobierania danych Dziennika postępów.'));
    } finally {
      if (isActive()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => { if (active) fetchAll(() => active); });
    return () => { active = false; };
  }, [fetchAll]);

  useRevalidate(fetchAll);

  const myClients = useMemo(() => clientsData.map((c) => ({
    ...c,
    name: c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || `Klient #${c.id}`,
    hint: c.last_training_at ? `ostatni: ${formatShortDate(new Date(c.last_training_at))}` : c.next_training_at ? `najbliższy: ${formatShortDate(new Date(c.next_training_at))}` : '',
  })), [clientsData]);

  const requestedClientMissing = !loading && Boolean(clientId) && !myClients.some((c) => String(c.id) === String(clientId));
  const effectiveClientId = !clientId
    ? (myClients[0] ? String(myClients[0].id) : '')
    : requestedClientMissing
      ? ''
      : String(clientId);
  const selectedClient = myClients.find((c) => String(c.id) === String(effectiveClientId)) || null;
  const selectedLevel = levelOverride !== null ? levelOverride : selectedClient?.experience_level || '';
  const alreadySameVerified = Boolean(selectedClient?.experience_verified) && selectedLevel === selectedClient?.experience_level;

  const handleVerifyLevel = async () => {
    if (!selectedClient || !selectedLevel || verifyingLevel) return;
    setVerifyingLevel(true); setErrorMsg(null); setSuccessMsg(null);
    try {
      await apiClient.patch(`/api/v1/instructor/clients/${selectedClient.id}/experience`, { experience_level: selectedLevel, verified: true });
      setLevelOverride(null);
      setSuccessMsg(`Zatwierdzono poziom (${experienceLevelLabel(selectedLevel)}) dla ${selectedClient.name}.`);
      await fetchAll();
    } catch (err) { setErrorMsg(extractApiError(err, 'Nie udało się zatwierdzić poziomu wspinacza.')); }
    finally { setVerifyingLevel(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); setErrorMsg(null); setSuccessMsg(null);
    const parsedId = parseInt(effectiveClientId, 10);
    if (!parsedId || !grade.trim() || !feedback.trim()) { setErrorMsg('Wybierz uczestnika, wpisz trudność drogi oraz uwagi.'); return; }
    setIsSubmitting(true);
    try {
      await apiClient.post('/api/v1/instructor/progress', { client_id: parsedId, grade: grade.trim(), route_name: routeName.trim() || null, instructor_feedback: feedback.slice(0, MAX_FEEDBACK_LENGTH).trim() });
      setSuccessMsg('Nowy wpis w Dzienniku postępów został zapisany.');
      setGrade(''); setRouteName(''); setFeedback('');
      await fetchAll();
    } catch (err) { setErrorMsg(extractApiError(err, 'Nie udało się zapisać wpisu.')); }
    finally { setIsSubmitting(false); }
  };

  const handleConfirmDelete = async () => {
    if (!deletingEntry) return;
    setDeletingBusy(true);
    try {
      await apiClient.delete(`/api/v1/instructor/progress/${deletingEntry.id}`);
      setEntries((prev) => prev.filter((e) => e.id !== deletingEntry.id));
      setDeletingEntry(null);
      setSuccessMsg('Wpis został usunięty z Dziennika postępów.');
    } catch (err) { setErrorMsg(extractApiError(err, 'Nie udało się usunąć wpisu.')); }
    finally { setDeletingBusy(false); }
  };

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return entries
      .filter((e) => !q || `${e.client_name || ''} ${e.route_name || ''} ${e.grade || ''}`.toLowerCase().includes(q))
      .sort((a, b) => (sortOrder === 'asc' ? 1 : -1) * (new Date(a.created_at) - new Date(b.created_at)));
  }, [entries, searchQuery, sortOrder]);

  const safePage = Math.min(currentPage, Math.max(1, Math.ceil(filtered.length / pageSize)));
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <div className="space-y-6">
      <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900">Dziennik postępów</h1>

      <AlertBanner type="error" message={errorMsg} onClose={() => setErrorMsg(null)} />
      <AlertBanner type="success" message={successMsg} onClose={() => setSuccessMsg(null)} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <section className={`${CARD_CLASS} p-6 lg:col-span-5 space-y-5`}>
          <div className="flex items-center gap-2.5 border-b border-slate-200 pb-3">
            <TrendingUp className="w-5 h-5 text-emerald-600" />
            <h2 className="text-lg font-bold text-slate-900">Dodaj wpis postępów</h2>
          </div>

          {!loading && myClients.length === 0 ? (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 text-sm text-slate-600">
              <p className="font-semibold text-slate-800">Brak uczestników na Twoich terminach</p>
              <p>Wpisy w Dzienniku postępów możesz wystawiać wyłącznie klientom, którzy zarezerwowali u Ciebie trening.</p>
              <Link to="/app/instructor" className={BTN_SECONDARY}>Przejdź do swojego grafiku</Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="known-client-select" className="block text-sm font-medium text-slate-700 mb-1.5">Uczestnik Twojego treningu *</label>
                <select id="known-client-select" value={effectiveClientId} onChange={(e) => { setClientId(e.target.value); setLevelOverride(null); }} required className={SELECT_CLASS}>
                  {requestedClientMissing && <option value="" disabled>Wybierz uczestnika z listy...</option>}
                  {myClients.map((c) => {
                    const lvl = experienceLevelLabel(c.experience_level);
                    return <option key={c.id} value={c.id}>{c.name} • {lvl ? `${lvl}${c.experience_verified ? ' ✓' : ''}` : 'brak poziomu'}{c.hint ? ` (${c.hint})` : ''}</option>;
                  })}
                </select>
                {requestedClientMissing ? (
                  <p className="text-xs font-medium text-amber-700 mt-1">Wybrany wspinacz nie ma aktywnej rezerwacji ani wcześniejszych wpisów — wybierz innego uczestnika z listy.</p>
                ) : Boolean(initialClientId) && String(initialClientId) === effectiveClientId && (
                  <p className="text-xs text-emerald-700 mt-1">Klient wybrany automatycznie z grafiku.</p>
                )}
              </div>

              {selectedClient && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800"><Award className="w-4 h-4 text-emerald-600" />Poziom wspinacza</div>
                    <ExperienceLevelBadge level={selectedClient.experience_level} verified={selectedClient.experience_verified} verifiedByName={selectedClient.experience_verified_by_name} verifiedAt={selectedClient.experience_verified_at} />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {EXPERIENCE_LEVEL_OPTIONS.map((opt) => (
                      <button key={opt.value} type="button" onClick={() => setLevelOverride(opt.value)}
                        className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-semibold border ${selectedLevel === opt.value ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'}`}>
                        {opt.title}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <button type="button" onClick={() => setVerifyModalClientId(selectedClient.id)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-emerald-700 underline">
                      <ClipboardList className="w-3.5 h-3.5" />Notatki i historia{selectedClient.notes_count > 0 ? ` (${selectedClient.notes_count})` : ''}
                    </button>
                    <button type="button" disabled={!selectedLevel || verifyingLevel || alreadySameVerified} onClick={handleVerifyLevel}
                      className={`inline-flex items-center gap-1.5 min-h-[34px] px-3 py-1 rounded-lg text-xs font-semibold ${alreadySameVerified ? 'bg-emerald-100 text-emerald-900 border border-emerald-200' : 'bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50'}`}>
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>{verifyingLevel ? 'Zatwierdzanie...' : alreadySameVerified ? 'Zatwierdzony ✓' : selectedClient.experience_verified ? 'Zmień i zatwierdź' : 'Zatwierdź poziom'}</span>
                    </button>
                  </div>
                </div>
              )}

              <ProgressEntryFields idPrefix="new" grade={grade} setGrade={setGrade} routeName={routeName} setRouteName={setRouteName} feedback={feedback} setFeedback={setFeedback} routePlaceholder="np. Żółty filar w przewieszeniu" />

              <button type="submit" disabled={isSubmitting} className={`${BTN_PRIMARY} w-full`}><Plus className="w-5 h-5" /><span>{isSubmitting ? 'Zapisywanie wpisu...' : 'Zapisz w Dzienniku postępów'}</span></button>
            </form>
          )}
        </section>

        <div className="lg:col-span-7 space-y-4">
          <div className={`${CARD_CLASS} p-5 space-y-4`}>
            <h2 className="text-lg font-bold text-slate-900">Moje wystawione wpisy ({entries.length})</h2>
            {entries.length > 1 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="relative">
                  <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input type="search" value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }} placeholder="Szukaj klienta, trudności lub drogi..." className={`${INPUT_CLASS} pl-11`} />
                </div>
                <div className="relative">
                  <ArrowUpDown className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <select value={sortOrder} onChange={(e) => { setSortOrder(e.target.value); setCurrentPage(1); }} className={`${SELECT_CLASS} pl-10`}>
                    <option value="desc">Od najnowszych</option><option value="asc">Od najstarszych</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {loading && entries.length === 0 ? (
            <div className={`${CARD_CLASS} p-10 text-center text-slate-500`}>Wczytywanie historii wpisów...</div>
          ) : paginated.length === 0 ? (
            <div className={`${CARD_CLASS} p-10 text-center text-slate-500`}>{entries.length === 0 ? 'Nie wystawiono jeszcze żadnych wpisów.' : 'Brak wpisów spełniających wybrane kryteria.'}</div>
          ) : (
            <div className={`${CARD_CLASS} divide-y divide-slate-200 overflow-hidden`}>
              {paginated.map((entry) => (
                <div key={entry.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-3 hover:bg-slate-50/70">
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={GRADE_BADGE_CLASS}>{entry.grade}</span>
                      <span className="font-bold text-slate-900">{entry.client_name || `Klient #${entry.client_id}`}</span>
                      <ExperienceLevelBadge compact level={entry.client_experience_level} verified={entry.client_experience_verified} verifiedByName={entry.client_experience_verified_by_name} verifiedAt={entry.client_experience_verified_at} />
                      <span className="text-xs text-slate-500 ml-auto sm:ml-0">{formatDateTime24(entry.created_at)}</span>
                    </div>
                    {entry.route_name && <div className="text-sm font-semibold text-slate-800">{entry.route_name}</div>}
                    <p className="text-sm text-slate-600 leading-relaxed break-words">{entry.instructor_feedback}</p>
                  </div>
                  <div className="flex items-center justify-end gap-1 shrink-0">
                    <button type="button" onClick={() => setEditingEntry(entry)} title="Edytuj" className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center rounded-lg text-slate-600 hover:text-emerald-700 hover:bg-emerald-50"><Pencil className="w-4 h-4" /></button>
                    <button type="button" onClick={() => setDeletingEntry(entry)} title="Usuń" className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center rounded-lg text-slate-600 hover:text-red-700 hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <Pagination totalItems={filtered.length} pageSize={pageSize} currentPage={safePage} onPageChange={setCurrentPage} onPageSizeChange={setPageSize} />
        </div>
      </div>

      {editingEntry && (
        <EditEntryModal entry={editingEntry} onClose={() => setEditingEntry(null)}
          onSaved={(u) => { setEntries((p) => p.map((e) => (e.id === u.id ? u : e))); setEditingEntry(null); setSuccessMsg('Wpis został zaktualizowany.'); }} />
      )}
      {deletingEntry && (
        <ModalShell title="Usunąć wpis z dziennika?" onClose={() => !deletingBusy && setDeletingEntry(null)} maxWidth="max-w-md"
          footer={
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDeletingEntry(null)} disabled={deletingBusy} className={BTN_SECONDARY}>Anuluj</button>
              <button type="button" onClick={handleConfirmDelete} disabled={deletingBusy} className={BTN_DANGER}><Trash2 className="w-4 h-4" /><span>{deletingBusy ? 'Usuwanie…' : 'Usuń wpis'}</span></button>
            </div>
          }
        >
          <p className="text-sm text-slate-600">Wpis dla <strong>{deletingEntry.client_name || `klienta #${deletingEntry.client_id}`}</strong> (<span className="font-mono font-bold">{deletingEntry.grade}</span>{deletingEntry.route_name ? `, ${deletingEntry.route_name}` : ''}) zniknie również z dziennika klienta.</p>
        </ModalShell>
      )}
      {verifyModalClientId && <ClientVerificationModal key={verifyModalClientId} clientId={verifyModalClientId} initialTab="notes" onClose={() => setVerifyModalClientId(null)} onUpdated={() => fetchAll()} />}
    </div>
  );
}
