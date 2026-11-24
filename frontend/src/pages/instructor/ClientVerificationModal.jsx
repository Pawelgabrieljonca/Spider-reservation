import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Award, Calendar, ClipboardList, Clock, Footprints, History, Mail, Pencil, Phone, Plus, Save, ShieldCheck, Trash2, TrendingUp, User,
} from 'lucide-react';
import apiClient, { extractApiError } from '../../core/api';
import { formatDate24, formatDateTime24, formatTime24, slotTypeShortLabel } from '../../core/dateUtils';
import { AlertBanner, BTN_PRIMARY, BTN_SECONDARY, ExperienceLevelBadge, ExperienceLevelSelector, ModalShell, TEXTAREA_CLASS } from '../../ui/common';

export default function ClientVerificationModal({ clientId, initialTab = 'notes', onClose, onUpdated }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [errorMsg, setErrorMsg] = useState(null);
  const [feedbackMsg, setFeedbackMsg] = useState(null);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [selectedLevel, setSelectedLevel] = useState('');
  const [verifying, setVerifying] = useState(false);
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
        setDetail(res.data);
        setSelectedLevel(res.data?.experience_level || '');
        setNowMs(Date.now());
      })
      .catch((err) => { if (active) setErrorMsg(extractApiError(err, 'Nie udało się wczytać profilu wspinacza.')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [clientId]);

  const updateNotes = (updater) => {
    setDetail((prev) => {
      if (!prev) return prev;
      const nextNotes = updater(prev.notes || []);
      const next = { ...prev, notes: nextNotes, notes_count: nextNotes.length, latest_note: nextNotes[0]?.content || null };
      onUpdated?.(next);
      return next;
    });
  };

  const handleVerifyLevel = async () => {
    if (!selectedLevel || verifying) return;
    setVerifying(true); setErrorMsg(null); setFeedbackMsg(null);
    try {
      const res = await apiClient.patch(`/api/v1/instructor/clients/${clientId}/experience`, { experience_level: selectedLevel, verified: true });
      setDetail(res.data);
      setSelectedLevel(res.data?.experience_level || selectedLevel);
      setFeedbackMsg('Poziom wspinaczkowy klienta został zatwierdzony.');
      onUpdated?.(res.data);
    } catch (err) {
      setErrorMsg(extractApiError(err, 'Nie udało się zatwierdzić poziomu wspinacza.'));
    } finally { setVerifying(false); }
  };

  const handleAddNote = async (e) => {
    e.preventDefault();
    const content = newNote.trim();
    if (content.length < 2 || savingNote) { setErrorMsg('Notatka musi zawierać co najmniej 2 znaki.'); return; }
    setSavingNote(true); setErrorMsg(null); setFeedbackMsg(null);
    try {
      const res = await apiClient.post(`/api/v1/instructor/clients/${clientId}/notes`, { content });
      updateNotes((notes) => [res.data, ...notes]);
      setNewNote('');
      setFeedbackMsg('Dodano prywatną notatkę instruktora.');
    } catch (err) {
      setErrorMsg(extractApiError(err, 'Nie udało się zapisać notatki.'));
    } finally { setSavingNote(false); }
  };

  const handleSaveEditedNote = async (noteId) => {
    const content = editingNoteText.trim();
    if (content.length < 2) { setErrorMsg('Notatka musi zawierać co najmniej 2 znaki.'); return; }
    setErrorMsg(null); setFeedbackMsg(null);
    try {
      const res = await apiClient.patch(`/api/v1/instructor/clients/${clientId}/notes/${noteId}`, { content });
      updateNotes((notes) => notes.map((n) => (n.id === noteId ? res.data : n)));
      setEditingNoteId(null); setEditingNoteText('');
      setFeedbackMsg('Notatka została zaktualizowana.');
    } catch (err) { setErrorMsg(extractApiError(err, 'Nie udało się zaktualizować notatki.')); }
  };

  const handleDeleteNote = async (noteId) => {
    setErrorMsg(null); setFeedbackMsg(null);
    try {
      await apiClient.delete(`/api/v1/instructor/clients/${clientId}/notes/${noteId}`);
      updateNotes((notes) => notes.filter((n) => n.id !== noteId));
      setConfirmDeleteId(null);
      setFeedbackMsg('Usunięto notatkę.');
    } catch (err) { setErrorMsg(extractApiError(err, 'Nie udało się usunąć notatki.')); }
  };

  const alreadyVerifiedSame = Boolean(detail?.experience_verified) && selectedLevel === detail?.experience_level;
  const tabs = [
    { id: 'notes', label: `Notatki instruktora (${detail?.notes?.length || 0})`, icon: ClipboardList },
    { id: 'history', label: `Historia treningów (${detail?.trainings_history?.length || 0})`, icon: History },
    { id: 'progress', label: `Dziennik postępów (${detail?.progress_entries?.length || 0})`, icon: TrendingUp },
  ];

  const header = (
    <div className="flex items-start gap-3 min-w-0">
      <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0"><User className="w-5 h-5" /></div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base sm:text-lg font-extrabold text-slate-900 truncate">{detail?.full_name || `Wspinacz #${clientId}`}</h2>
          {detail && <ExperienceLevelBadge level={detail.experience_level} verified={detail.experience_verified} verifiedByName={detail.experience_verified_by_name} verifiedAt={detail.experience_verified_at} />}
        </div>
        {detail && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 mt-1">
            <span className="inline-flex items-center gap-1"><Mail className="w-3.5 h-3.5 text-slate-400" />{detail.email}</span>
            {detail.phone_number && <a href={`tel:${detail.phone_number}`} className="inline-flex items-center gap-1 text-emerald-700 hover:underline font-medium"><Phone className="w-3.5 h-3.5" />{detail.phone_number}</a>}
            <span className="inline-flex items-center gap-1"><Footprints className="w-3.5 h-3.5 text-slate-400" />{detail.shoe_size ? `Rozmiar buta: EU ${detail.shoe_size}` : 'Brak rozmiaru buta'}</span>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <ModalShell header={header} onClose={onClose} maxWidth="max-w-3xl">
      <AlertBanner type="error" message={errorMsg} onClose={() => setErrorMsg(null)} />
      <AlertBanner type="success" message={feedbackMsg} onClose={() => setFeedbackMsg(null)} />

      {loading ? (
        <div className="py-12 text-center text-slate-500 text-sm">Wczytywanie profilu wspinacza, notatek i historii treningów...</div>
      ) : detail ? (
        <>
          <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2"><Award className="w-4 h-4 text-emerald-600 shrink-0" /><h3 className="text-sm font-bold text-slate-900">Weryfikacja poziomu zaawansowania wspinacza</h3></div>
              {detail.experience_verified && detail.experience_verified_at && (
                <span className="text-[11px] font-medium text-emerald-800 bg-emerald-100/80 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                  Zatwierdzono: {formatDate24(detail.experience_verified_at)}{detail.experience_verified_by_name ? ` • ${detail.experience_verified_by_name}` : ''}
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
            <ExperienceLevelSelector value={selectedLevel} onChange={setSelectedLevel} compact />
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="text-xs text-slate-500">
                Odbyte sesje: <strong>{detail.completed_trainings_count}</strong> • Nadchodzące: <strong>{detail.upcoming_trainings_count}</strong> • Wpisy w dzienniku: <strong>{detail.progress_entries_count}</strong>
              </div>
              <button type="button" disabled={!selectedLevel || verifying || alreadyVerifiedSame} onClick={handleVerifyLevel} className={alreadyVerifiedSame ? BTN_SECONDARY : BTN_PRIMARY}>
                <ShieldCheck className="w-4 h-4" />
                <span>{verifying ? 'Zatwierdzanie...' : alreadyVerifiedSame ? 'Poziom zatwierdzony' : detail.experience_verified ? 'Zmień i zatwierdź poziom' : 'Zatwierdź poziom wspinacza'}</span>
              </button>
            </div>
          </section>

          <div>
            <div role="tablist" aria-label="Szczegóły wspinacza" className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-2">
              {tabs.map(({ id, label, icon: Icon }) => (
                <button key={id} type="button" role="tab" aria-selected={activeTab === id} onClick={() => setActiveTab(id)} className={`inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-colors ${activeTab === id ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                  <Icon className="w-4 h-4" /><span>{label}</span>
                </button>
              ))}
            </div>

            {activeTab === 'notes' && (
              <div className="pt-4 space-y-4">
                <form onSubmit={handleAddNote} className="space-y-2.5">
                  <label htmlFor="client-coaching-note" className="block text-xs sm:text-sm font-semibold text-slate-800">Nowa notatka trenerska (widoczna wyłącznie dla Ciebie)</label>
                  <textarea id="client-coaching-note" rows={3} maxLength={1000} value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="np. Przed kolejną sesją przygotować przewieszenie V+/VI..." className={TEXTAREA_CLASS} />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-500">Pomaga dobrać drogi przed rozpoczęciem sesji.</span>
                    <button type="submit" disabled={savingNote || newNote.trim().length < 2} className={BTN_PRIMARY}><Plus className="w-4 h-4" /><span>{savingNote ? 'Zapisywanie...' : 'Dodaj notatkę'}</span></button>
                  </div>
                </form>
                {!detail.notes?.length ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-xs sm:text-sm text-slate-500">Brak notatek o tym wspinaczu.</div>
                ) : (
                  <div className="space-y-2.5">
                    {detail.notes.map((note) => (
                      <div key={note.id} className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2 shadow-sm">
                        {editingNoteId === note.id ? (
                          <div className="space-y-2">
                            <textarea rows={3} maxLength={1000} value={editingNoteText} onChange={(e) => setEditingNoteText(e.target.value)} className={TEXTAREA_CLASS} />
                            <div className="flex items-center justify-end gap-2">
                              <button type="button" onClick={() => { setEditingNoteId(null); setEditingNoteText(''); }} className={BTN_SECONDARY}>Anuluj</button>
                              <button type="button" onClick={() => handleSaveEditedNote(note.id)} className={BTN_PRIMARY}><Save className="w-4 h-4" /><span>Zapisz</span></button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="text-sm text-slate-800 whitespace-pre-line break-words leading-relaxed">{note.content}</p>
                            <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100 text-[11px] text-slate-500">
                              <span>{formatDateTime24(note.created_at)}</span>
                              <div className="flex items-center gap-1">
                                <button type="button" onClick={() => { setEditingNoteId(note.id); setEditingNoteText(note.content); }} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-slate-600 hover:text-emerald-700 hover:bg-emerald-50"><Pencil className="w-3.5 h-3.5" />Edytuj</button>
                                {confirmDeleteId === note.id ? (
                                  <button type="button" onClick={() => handleDeleteNote(note.id)} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-red-600 text-white font-semibold">Potwierdź usunięcie</button>
                                ) : (
                                  <button type="button" onClick={() => setConfirmDeleteId(note.id)} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-slate-600 hover:text-red-700 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" />Usuń</button>
                                )}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'history' && (
              <div className="pt-4 space-y-2.5">
                {!detail.trainings_history?.length ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-sm text-slate-500">Brak zarejestrowanych treningów tego wspinacza u Ciebie.</div>
                ) : (
                  detail.trainings_history.map((tr) => {
                    const isCancelled = tr.status === 'cancelled';
                    const isPast = !isCancelled && new Date(tr.end_time).getTime() <= nowMs;
                    return (
                      <div key={tr.reservation_id} className="rounded-xl border border-slate-200 bg-white p-3.5 flex flex-wrap items-center justify-between gap-2">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                            <Calendar className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span>{formatDate24(tr.start_time)}</span>
                            <span className="font-mono text-slate-700">{formatTime24(tr.start_time)} – {formatTime24(tr.end_time)}</span>
                          </div>
                          <div className="text-xs text-slate-600 flex flex-wrap items-center gap-2">
                            <span>{slotTypeShortLabel(tr.slot_type)}</span><span>•</span><span>{tr.needs_equipment ? 'Wypożyczenie sprzętu' : 'Własny sprzęt'}</span>
                          </div>
                        </div>
                        {isCancelled ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-900 border border-red-200">Anulowany</span>
                        ) : isPast ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-300">Odbyty</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-900 border border-emerald-200"><Clock className="w-3 h-3" />Nadchodzący</span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {activeTab === 'progress' && (
              <div className="pt-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-500">Dotychczasowe przejścia i wskazówki zapisane dla wspinacza</span>
                  <Link to={`/app/instructor/progress?clientId=${clientId}`} onClick={onClose} className="inline-flex items-center gap-1 text-xs sm:text-sm font-semibold text-emerald-700 hover:text-emerald-900"><Plus className="w-4 h-4" />Dodaj nowy wpis</Link>
                </div>
                {!detail.progress_entries?.length ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-sm text-slate-500">Ten wspinacz nie ma jeszcze wpisów w Dzienniku postępów.</div>
                ) : (
                  <div className="space-y-2.5">
                    {detail.progress_entries.map((entry) => (
                      <div key={entry.id} className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center font-mono font-bold text-xs px-2.5 py-0.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-900">{entry.grade}</span>
                            {entry.route_name && <span className="text-sm font-bold text-slate-900">{entry.route_name}</span>}
                          </div>
                          <span className="text-[11px] text-slate-500">{formatDateTime24(entry.created_at)}</span>
                        </div>
                        <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">{entry.instructor_feedback}</p>
                        {entry.instructor_name && <div className="text-[11px] text-slate-400">Wystawił: {entry.instructor_name}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      ) : null}
    </ModalShell>
  );
}
