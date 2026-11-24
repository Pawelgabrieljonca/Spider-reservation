import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpDown, Award, Calendar, RefreshCw, Search, ShieldCheck, TrendingUp, User } from 'lucide-react';
import apiClient, { extractApiError } from '../../core/api';
import { experienceLevelLabel, formatDateTime24 } from '../../core/dateUtils';
import { AlertBanner, BTN_SECONDARY, CARD_CLASS, ExperienceLevelBadge, INPUT_CLASS, Pagination, SELECT_CLASS } from '../../ui/common';

export default function ClientProgressPage() {
  const [entries, setEntries] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [searchQuery, setSearchQuery] = useState(() => new URLSearchParams(window.location.search).get('q') || '');
  const [sortOrder, setSortOrder] = useState('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  const fetchProgress = useCallback(async () => {
    setLoading(true);
    try {
      const [progRes, profRes] = await Promise.all([
        apiClient.get('/api/v1/client/progress'),
        apiClient.get('/api/v1/client/profile').catch(() => ({ data: null })),
      ]);
      setEntries(Array.isArray(progRes.data) ? progRes.data : []);
      if (profRes.data) setProfile(profRes.data);
    } catch (err) {
      setErrorMsg(extractApiError(err, 'Błąd pobierania Dziennika postępów.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { Promise.resolve().then(() => fetchProgress()); }, [fetchProgress]);

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return entries
      .filter((e) => !q || [e.instructor_name, e.route_name, e.grade, e.instructor_feedback].some((v) => (v || '').toLowerCase().includes(q)))
      .sort((a, b) => (sortOrder === 'asc' ? 1 : -1) * (new Date(a.created_at) - new Date(b.created_at)));
  }, [entries, searchQuery, sortOrder]);

  const safePage = Math.min(currentPage, Math.max(1, Math.ceil(filteredEntries.length / pageSize)));
  const paginatedEntries = filteredEntries.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <div className="space-y-6">
      <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900">Dziennik postępów</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={`${CARD_CLASS} p-5 flex items-center justify-between gap-3`}>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-500">Poziom wspinacza</p>
            <div className="mt-1.5">
              {profile?.experience_level ? (
                <div className="space-y-1">
                  <div className="text-lg font-extrabold text-slate-900 leading-tight">{experienceLevelLabel(profile.experience_level)}</div>
                  <ExperienceLevelBadge compact level={profile.experience_level} verified={profile.experience_verified} verifiedByName={profile.experience_verified_by_name} verifiedAt={profile.experience_verified_at} />
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="text-base font-bold text-slate-600">Nieokreślony</div>
                  <Link to="/app/client/profile" className="inline-block text-xs font-semibold text-emerald-700 hover:underline">Uzupełnij w profilu &rarr;</Link>
                </div>
              )}
            </div>
          </div>
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${profile?.experience_verified ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
            <ShieldCheck className="w-5 h-5" />
          </div>
        </div>

        {[
          { label: 'Zarejestrowane przejścia', value: entries.length, cls: 'text-2xl font-extrabold', icon: TrendingUp, tone: 'bg-emerald-100 text-emerald-700' },
          { label: 'Ostatnia trudność', value: entries[0]?.grade || '—', cls: 'text-2xl font-mono font-extrabold', icon: Award, tone: 'bg-purple-100 text-purple-700' },
          { label: 'Ostatni wpis', value: entries[0] ? formatDateTime24(entries[0].created_at) : 'Brak wpisów', cls: 'text-base font-bold', icon: Calendar, tone: 'bg-sky-100 text-sky-700' },
        ].map(({ label, value, cls, icon: Icon, tone }) => (
          <div key={label} className={`${CARD_CLASS} p-5 flex items-center justify-between`}>
            <div>
              <p className="text-sm font-medium text-slate-500">{label}</p>
              <p className={`${cls} text-slate-900 mt-1`}>{value}</p>
            </div>
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${tone}`}><Icon className="w-5 h-5" /></div>
          </div>
        ))}
      </div>

      <AlertBanner type="error" message={errorMsg} onClose={() => setErrorMsg(null)} />

      <section className={`${CARD_CLASS} p-5 flex flex-col md:flex-row md:items-end gap-4`}>
        <div className="flex-1">
          <label htmlFor="progress-search" className="block text-sm font-medium text-slate-700 mb-1.5">Szukaj po trenerze, trudności lub nazwie drogi</label>
          <div className="relative">
            <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input id="progress-search" type="search" value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }} placeholder="np. VI.1+, filar..." className={`${INPUT_CLASS} pl-11`} />
          </div>
        </div>
        <div className="w-full md:w-64">
          <label htmlFor="progress-sort" className="block text-sm font-medium text-slate-700 mb-1.5">Sortowanie po dacie</label>
          <div className="relative">
            <ArrowUpDown className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select id="progress-sort" value={sortOrder} onChange={(e) => { setSortOrder(e.target.value); setCurrentPage(1); }} className={`${SELECT_CLASS} pl-10`}>
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

      {loading && !entries.length ? (
        <div className={`${CARD_CLASS} p-12 text-center text-base text-slate-500`}>Wczytywanie Twojego Dziennika postępów...</div>
      ) : !paginatedEntries.length ? (
        <div className={`${CARD_CLASS} p-10 text-center space-y-2`}>
          <p className="text-lg font-semibold text-slate-800">Brak wpisów w Dzienniku postępów</p>
          <p className="text-base text-slate-500">Po odbytym treningu Twój instruktor doda tutaj trudności pokonanych dróg oraz wskazówki.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {paginatedEntries.map((entry) => (
            <article key={entry.id} className={`${CARD_CLASS} p-5 sm:p-6 space-y-4`}>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-3.5">
                <div className="flex items-center gap-3.5">
                  <span className="inline-flex items-center justify-center min-w-[64px] px-3.5 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-900 font-mono text-lg font-extrabold shadow-sm">
                    {entry.grade}
                  </span>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">{entry.route_name || 'Droga treningowa CW Spider'}</h2>
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
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Uwagi techniczne instruktora</div>
                <p className="text-base text-slate-800 leading-relaxed whitespace-pre-line break-words">{entry.instructor_feedback}</p>
              </div>
            </article>
          ))}
        </div>
      )}

      <Pagination totalItems={filteredEntries.length} pageSize={pageSize} currentPage={safePage} onPageChange={setCurrentPage} onPageSizeChange={setPageSize} />
    </div>
  );
}
