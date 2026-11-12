import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  Award,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock,
  Footprints,
  History,
  Mail,
  Pencil,
  Phone,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  TrendingUp,
  User,
  X,
} from 'lucide-react';
import apiClient from '../api/client';
import { BTN_PRIMARY, BTN_SECONDARY, TEXTAREA_CLASS } from '../styles/ui';
import {
  EXPERIENCE_LEVEL_OPTIONS,
  formatDate24,
  formatDateTime24,
  formatTime24,
  slotTypeShortLabel,
} from '../utils/dateUtils';
import { extractApiError, getGradeBadgeClasses, getGradeEquivalent } from '../utils/grades';
import ExperienceLevelBadge from './ExperienceLevelBadge';

/**
 * Karta weryfikacji profilu wspinacza dla instruktora:
 *  - wgląd i zatwierdzanie poziomu zaawansowania przed sesją lub po zajęciach,
 *  - prywatne notatki trenerskie (jakie drogi przygotować, wskazówki, kontuzje),
 *  - historia poprzednich i nadchodzących treningów oraz wpisów Dziennika postępów.
 */
export default function ClientVerificationModal({
  clientId,
  initialTab = 'notes',
  onClose,
  onUpdated,
}) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [errorMsg, setErrorMsg] = useState(null);
  const [feedbackMsg, setFeedbackMsg] = useState(null);
  const [activeTab, setActiveTab] = useState(initialTab);

  // Stan weryfikacji poziomu
  const [selectedLevel, setSelectedLevel] = useState('');
  const [verifying, setVerifying] = useState(false);

  // Stan notatek trenerskich
  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editingNoteText, setEditingNoteText] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  useEffect(() => {
    if (!clientId) return undefined;
    let active = true;

    apiClient
      .get(`/api/v1/instructor/clients/${clientId}`)
      .then((res) => {
        if (!active) return;
        const data = res.data;
        setDetail(data);
        setSelectedLevel(data?.experience_level || '');
        setNowMs(Date.now());
      })
      .catch((err) => {
        if (active) {
          setErrorMsg(extractApiError(err, 'Nie udało się wczytać profilu wspinacza.'));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [clientId]);

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const handleVerifyLevel = async () => {
    if (!selectedLevel || verifying) return;
    setVerifying(true);
    setErrorMsg(null);
    setFeedbackMsg(null);
    try {
      const res = await apiClient.patch(`/api/v1/instructor/clients/${clientId}/experience`, {
        experience_level: selectedLevel,
        verified: true,
      });
      setDetail(res.data);
      setSelectedLevel(res.data?.experience_level || selectedLevel);
      setFeedbackMsg('Poziom wspinaczkowy klienta został zatwierdzony.');
      onUpdated?.(res.data);
    } catch (err) {
      setErrorMsg(extractApiError(err, 'Nie udało się zatwierdzić poziomu wspinacza.'));
    } finally {
      setVerifying(false);
    }
  };

  const handleAddNote = async (e) => {
    e.preventDefault();
    const trimmed = newNote.trim();
    if (trimmed.length < 2 || savingNote) {
      setErrorMsg('Notatka musi zawierać co najmniej 2 znaki.');
      return;
    }
    setSavingNote(true);
    setErrorMsg(null);
    setFeedbackMsg(null);
    try {
      const res = await apiClient.post(`/api/v1/instructor/clients/${clientId}/notes`, {
        content: trimmed,
      });
      setDetail((prev) => {
        if (!prev) return prev;
        const nextNotes = [res.data, ...(prev.notes || [])];
        const next = {
          ...prev,
          notes: nextNotes,
          notes_count: nextNotes.length,
          latest_note: res.data.content,
        };
        onUpdated?.(next);
        return next;
      });
      setNewNote('');
      setFeedbackMsg('Dodano prywatną notatkę instruktora.');
    } catch (err) {
      setErrorMsg(extractApiError(err, 'Nie udało się zapisać notatki.'));
    } finally {
      setSavingNote(false);
    }
  };

  const handleSaveEditedNote = async (noteId) => {
    const trimmed = editingNoteText.trim();
    if (trimmed.length < 2) {
      setErrorMsg('Notatka musi zawierać co najmniej 2 znaki.');
      return;
    }
    setErrorMsg(null);
    setFeedbackMsg(null);
    try {
      const res = await apiClient.patch(
        `/api/v1/instructor/clients/${clientId}/notes/${noteId}`,
        { content: trimmed }
      );
      setDetail((prev) => {
        if (!prev) return prev;
        const nextNotes = (prev.notes || []).map((n) => (n.id === noteId ? res.data : n));
        const next = {
          ...prev,
          notes: nextNotes,
          latest_note: nextNotes[0]?.content || null,
        };
        onUpdated?.(next);
        return next;
      });
      setEditingNoteId(null);
      setEditingNoteText('');
      setFeedbackMsg('Notatka została zaktualizowana.');
    } catch (err) {
      setErrorMsg(extractApiError(err, 'Nie udało się zaktualizować notatki.'));
    }
  };

  const handleDeleteNote = async (noteId) => {
    setErrorMsg(null);
    setFeedbackMsg(null);
    try {
      await apiClient.delete(`/api/v1/instructor/clients/${clientId}/notes/${noteId}`);
      setDetail((prev) => {
        if (!prev) return prev;
        const nextNotes = (prev.notes || []).filter((n) => n.id !== noteId);
        const next = {
          ...prev,
          notes: nextNotes,
          notes_count: nextNotes.length,
          latest_note: nextNotes[0]?.content || null,
        };
        onUpdated?.(next);
        return next;
      });
      setConfirmDeleteId(null);
      setFeedbackMsg('Usunięto notatkę.');
    } catch (err) {
      setErrorMsg(extractApiError(err, 'Nie udało się usunąć notatki.'));
    }
  };

  const alreadyVerifiedSame =
    Boolean(detail?.experience_verified) && selectedLevel === detail?.experience_level;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/65 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="client-verify-modal-title"
    >
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Nagłówek karty wspinacza */}
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200 bg-slate-50/80 flex items-start justify-between gap-3 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
              <User className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2
                  id="client-verify-modal-title"
                  className="text-base sm:text-lg font-extrabold text-slate-900 truncate"
                >
                  {detail?.full_name || `Wspinacz #${clientId}`}
                </h2>
                {detail && (
                  <ExperienceLevelBadge
                    level={detail.experience_level}
                    verified={detail.experience_verified}
                    verifiedByName={detail.experience_verified_by_name}
                    verifiedAt={detail.experience_verified_at}
                  />
                )}
              </div>

              {detail && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 mt-1">
                  <span className="inline-flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    <span>{detail.email}</span>
                  </span>
                  {detail.phone_number && (
                    <a
                      href={`tel:${detail.phone_number}`}
                      className="inline-flex items-center gap-1 text-emerald-700 hover:underline font-medium"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>{detail.phone_number}</span>
                    </a>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <Footprints className="w-3.5 h-3.5 text-slate-400" />
                    <span>
                      {detail.shoe_size ? `Rozmiar buta: EU ${detail.shoe_size}` : 'Brak rozmiaru buta'}
                    </span>
                  </span>
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Zamknij kartę wspinacza"
            className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Treść przewijalna */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {errorMsg && (
            <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl px-3.5 py-2.5 flex items-center gap-2 text-sm">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span className="flex-1">{errorMsg}</span>
              <button type="button" onClick={() => setErrorMsg(null)} className="p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {feedbackMsg && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl px-3.5 py-2.5 flex items-center gap-2 text-sm">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="flex-1">{feedbackMsg}</span>
              <button type="button" onClick={() => setFeedbackMsg(null)} className="p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {loading ? (
            <div className="py-12 text-center text-slate-500 text-sm">
              Wczytywanie profilu wspinacza, notatek i historii treningów...
            </div>
          ) : detail ? (
            <>
              {/* Sekcja 1: Weryfikacja i zatwierdzenie poziomu zaawansowania */}
              <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Award className="w-4 h-4 text-emerald-600 shrink-0" />
                    <h3 className="text-sm font-bold text-slate-900">
                      Weryfikacja poziomu zaawansowania wspinacza
                    </h3>
                  </div>

                  {detail.experience_verified && detail.experience_verified_at && (
                    <span className="text-[11px] font-medium text-emerald-800 bg-emerald-100/80 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                      Zatwierdzono: {formatDate24(detail.experience_verified_at)}
                      {detail.experience_verified_by_name
                        ? ` • ${detail.experience_verified_by_name}`
                        : ''}
                    </span>
                  )}
                </div>

                {!detail.experience_verified && (
                  <p className="text-xs text-slate-600">
                    {detail.experience_level
                      ? 'Klient zadeklarował ten poziom samodzielnie. Po ocenie umiejętności podczas zajęć możesz go zatwierdzić lub skorygować.'
                      : 'Klient nie określił jeszcze swojego poziomu w profilu. Wybierz poziom po ocenie na ściance i zatwierdź.'}
                  </p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {EXPERIENCE_LEVEL_OPTIONS.map((opt) => {
                    const active = selectedLevel === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setSelectedLevel(opt.value)}
                        className={`text-left p-3 rounded-xl border-2 transition-all ${
                          active
                            ? 'border-emerald-600 bg-white shadow-sm'
                            : 'border-slate-200 bg-white/70 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs sm:text-sm font-bold text-slate-900">
                            {opt.title}
                          </span>
                          <span
                            className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                              active
                                ? 'border-emerald-600 bg-emerald-600'
                                : 'border-slate-300 bg-white'
                            }`}
                          >
                            {active && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1 leading-snug line-clamp-2">
                          {opt.description}
                        </p>
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="text-xs text-slate-500">
                    Odbyte sesje: <strong>{detail.completed_trainings_count}</strong> •
                    Nadchodzące: <strong>{detail.upcoming_trainings_count}</strong> •
                    Wpisy w dzienniku: <strong>{detail.progress_entries_count}</strong>
                  </div>

                  <button
                    type="button"
                    disabled={!selectedLevel || verifying || alreadyVerifiedSame}
                    onClick={handleVerifyLevel}
                    className={alreadyVerifiedSame ? BTN_SECONDARY : BTN_PRIMARY}
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>
                      {verifying
                        ? 'Zatwierdzanie...'
                        : alreadyVerifiedSame
                        ? 'Poziom zatwierdzony'
                        : detail.experience_verified
                        ? 'Zmień i zatwierdź poziom'
                        : 'Zatwierdź poziom wspinacza'}
                    </span>
                  </button>
                </div>
              </section>

              {/* Zakładki: Notatki | Historia treningów | Dziennik postępów */}
              <div>
                <div
                  role="tablist"
                  aria-label="Szczegóły wspinacza"
                  className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-2"
                >
                  {[
                    {
                      id: 'notes',
                      label: `Notatki instruktora (${detail.notes?.length || 0})`,
                      icon: ClipboardList,
                    },
                    {
                      id: 'history',
                      label: `Historia treningów (${detail.trainings_history?.length || 0})`,
                      icon: History,
                    },
                    {
                      id: 'progress',
                      label: `Dziennik postępów (${detail.progress_entries?.length || 0})`,
                      icon: TrendingUp,
                    },
                  ].map((tab) => {
                    const Icon = tab.icon;
                    const active = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setActiveTab(tab.id)}
                        className={`inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-colors ${
                          active
                            ? 'bg-slate-900 text-white shadow-sm'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{tab.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Zakładka: Notatki instruktora */}
                {activeTab === 'notes' && (
                  <div className="pt-4 space-y-4">
                    <form onSubmit={handleAddNote} className="space-y-2.5">
                      <label
                        htmlFor="client-coaching-note"
                        className="block text-xs sm:text-sm font-semibold text-slate-800"
                      >
                        Nowa notatka trenerska (widoczna wyłącznie dla Ciebie)
                      </label>
                      <textarea
                        id="client-coaching-note"
                        rows={3}
                        maxLength={1000}
                        value={newNote}
                        onChange={(e) => setNewNote(e.target.value)}
                        placeholder="np. Przed kolejną sesją przygotować przewieszenie V+/VI. Zwrócić uwagę na skręcanie biodra oraz pracę stóp na małych stopniach."
                        className={TEXTAREA_CLASS}
                      />
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-slate-500">
                          Pomaga dobrać drogi przed rozpoczęciem sesji.
                        </span>
                        <button
                          type="submit"
                          disabled={savingNote || newNote.trim().length < 2}
                          className={BTN_PRIMARY}
                        >
                          <Plus className="w-4 h-4" />
                          <span>{savingNote ? 'Zapisywanie...' : 'Dodaj notatkę'}</span>
                        </button>
                      </div>
                    </form>

                    {!detail.notes || detail.notes.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-xs sm:text-sm text-slate-500">
                        Brak notatek o tym wspinaczu. Dodaj pierwszą wskazówkę przed kolejnymi
                        zajęciami.
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {detail.notes.map((note) => {
                          const isEditing = editingNoteId === note.id;
                          return (
                            <div
                              key={note.id}
                              className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2 shadow-2xs"
                            >
                              {isEditing ? (
                                <div className="space-y-2">
                                  <textarea
                                    rows={3}
                                    maxLength={1000}
                                    value={editingNoteText}
                                    onChange={(e) => setEditingNoteText(e.target.value)}
                                    className={TEXTAREA_CLASS}
                                  />
                                  <div className="flex items-center justify-end gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingNoteId(null);
                                        setEditingNoteText('');
                                      }}
                                      className={BTN_SECONDARY}
                                    >
                                      Anuluj
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleSaveEditedNote(note.id)}
                                      className={BTN_PRIMARY}
                                    >
                                      <Save className="w-4 h-4" />
                                      <span>Zapisz</span>
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <p className="text-sm text-slate-800 whitespace-pre-line break-words leading-relaxed">
                                    {note.content}
                                  </p>
                                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100 text-[11px] text-slate-500">
                                    <span>{formatDateTime24(note.created_at)}</span>
                                    <div className="flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingNoteId(note.id);
                                          setEditingNoteText(note.content);
                                        }}
                                        aria-label="Edytuj notatkę"
                                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-slate-600 hover:text-emerald-700 hover:bg-emerald-50"
                                      >
                                        <Pencil className="w-3.5 h-3.5" />
                                        <span>Edytuj</span>
                                      </button>
                                      {confirmDeleteId === note.id ? (
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteNote(note.id)}
                                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-red-600 text-white font-semibold"
                                        >
                                          Potwierdź usunięcie
                                        </button>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => setConfirmDeleteId(note.id)}
                                          aria-label="Usuń notatkę"
                                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-slate-600 hover:text-red-700 hover:bg-red-50"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                          <span>Usuń</span>
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Zakładka: Historia treningów */}
                {activeTab === 'history' && (
                  <div className="pt-4 space-y-2.5">
                    {!detail.trainings_history || detail.trainings_history.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-sm text-slate-500">
                        Brak zarejestrowanych treningów tego wspinacza u Ciebie.
                      </div>
                    ) : (
                      detail.trainings_history.map((tr) => {
                        const isCancelled = tr.status === 'cancelled';
                        const isPast = !isCancelled && new Date(tr.end_time).getTime() <= nowMs;
                        return (
                          <div
                            key={tr.reservation_id}
                            className="rounded-xl border border-slate-200 bg-white p-3.5 flex flex-wrap items-center justify-between gap-2"
                          >
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                                <Calendar className="w-4 h-4 text-emerald-600 shrink-0" />
                                <span>{formatDate24(tr.start_time)}</span>
                                <span className="font-mono text-slate-700">
                                  {formatTime24(tr.start_time)} – {formatTime24(tr.end_time)}
                                </span>
                              </div>
                              <div className="text-xs text-slate-600 flex flex-wrap items-center gap-2">
                                <span>{slotTypeShortLabel(tr.slot_type)}</span>
                                <span>•</span>
                                <span>
                                  {tr.needs_equipment ? 'Wypożyczenie sprzętu' : 'Własny sprzęt'}
                                </span>
                              </div>
                            </div>

                            <div>
                              {isCancelled ? (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-900 border border-red-200">
                                  Anulowany
                                </span>
                              ) : isPast ? (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-300">
                                  Odbyty
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-900 border border-emerald-200">
                                  <Clock className="w-3 h-3" />
                                  <span>Nadchodzący</span>
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {/* Zakładka: Dziennik postępów klienta */}
                {activeTab === 'progress' && (
                  <div className="pt-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-slate-500">
                        Dotychczasowe przejścia i wskazówki zapisane dla wspinacza
                      </span>
                      <Link
                        to={`/app/instructor/progress?clientId=${clientId}`}
                        onClick={onClose}
                        className="inline-flex items-center gap-1 text-xs sm:text-sm font-semibold text-emerald-700 hover:text-emerald-900"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Dodaj nowy wpis</span>
                      </Link>
                    </div>

                    {!detail.progress_entries || detail.progress_entries.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-sm text-slate-500">
                        Ten wspinacz nie ma jeszcze wpisów w Dzienniku postępów.
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {detail.progress_entries.map((entry) => {
                          const eq = getGradeEquivalent(entry.grade);
                          return (
                            <div
                              key={entry.id}
                              className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-1.5"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`inline-flex items-center font-mono font-bold text-xs px-2.5 py-0.5 rounded-lg border ${getGradeBadgeClasses(
                                      entry.grade
                                    )}`}
                                  >
                                    {entry.grade}
                                  </span>
                                  {eq && (
                                    <span className="text-[11px] font-mono text-slate-500">
                                      (fr. {eq.french})
                                    </span>
                                  )}
                                  {entry.route_name && (
                                    <span className="text-sm font-bold text-slate-900">
                                      {entry.route_name}
                                    </span>
                                  )}
                                </div>
                                <span className="text-[11px] text-slate-500">
                                  {formatDateTime24(entry.created_at)}
                                </span>
                              </div>
                              <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                                {entry.instructor_feedback}
                              </p>
                              {entry.instructor_name && (
                                <div className="text-[11px] text-slate-400">
                                  Wystawił: {entry.instructor_name}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

