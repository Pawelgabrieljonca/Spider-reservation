import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Award, Footprints, KeyRound, Mail, MailCheck, Phone, Save, ShieldCheck, User } from 'lucide-react';
import apiClient, { extractApiError } from '../core/api';
import { useAuth } from '../core/auth';
import { formatDate24 } from '../core/dateUtils';
import { AlertBanner, BTN_PRIMARY, BTN_SECONDARY, CARD_CLASS, ExperienceLevelBadge, ExperienceLevelSelector, INPUT_CLASS, SELECT_CLASS } from '../ui/common';

const COOLDOWN_SECONDS = 60;
const SHOE_SIZE_OPTIONS = Array.from({ length: 29 }, (_, i) => {
  const sz = 34 + i * 0.5;
  return Number.isInteger(sz) ? String(sz) : sz.toFixed(1);
});

function AccountSecurityCard({ redirectPath }) {
  const { userProfile } = useAuth();
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [successMsg, setSuccessMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setInterval(() => setCooldown((prev) => (prev > 1 ? prev - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleRequestPasswordReset = async () => {
    setSending(true); setErrorMsg(null); setSuccessMsg(null);
    try {
      const res = await apiClient.post('/api/v1/account/password-reset-email', { redirect_path: redirectPath });
      setSuccessMsg(res.data?.message || 'Wysłaliśmy link do zmiany hasła na Twój adres e-mail. Sprawdź skrzynkę odbiorczą.');
      setCooldown(COOLDOWN_SECONDS);
    } catch (err) {
      setErrorMsg(extractApiError(err, 'Nie udało się wysłać wiadomości ze zmianą hasła. Spróbuj ponownie za chwilę.'));
    } finally { setSending(false); }
  };

  const emailVerified = userProfile?.emailVerified;

  return (
    <section className={`${CARD_CLASS} p-5 sm:p-6 space-y-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-emerald-600" />
            <h2 className="text-base sm:text-lg font-bold text-slate-900">Bezpieczeństwo konta i zmiana hasła</h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-600">
            Wyślemy jednorazowy, bezpieczny link z systemu Keycloak na Twój adres e-mail (ważny 15 minut).
          </p>
        </div>
        {typeof emailVerified === 'boolean' && (
          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${emailVerified ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-amber-50 text-amber-900 border-amber-200'}`}>
            {emailVerified ? <ShieldCheck className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
            <span>{emailVerified ? 'E-mail zweryfikowany' : 'E-mail niezweryfikowany'}</span>
          </span>
        )}
      </div>

      <AlertBanner type="success" message={successMsg} onClose={() => setSuccessMsg(null)} />
      <AlertBanner type="error" message={errorMsg} onClose={() => setErrorMsg(null)} />

      <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="text-xs text-slate-500">
          Adres wysyłki: <strong className="text-slate-800">{userProfile?.email || '—'}</strong>
        </div>
        <button type="button" onClick={handleRequestPasswordReset} disabled={sending || cooldown > 0} className={`${BTN_SECONDARY} w-full sm:w-auto px-5`}>
          <MailCheck className="w-4 h-4 text-emerald-600" />
          <span>{sending ? 'Wysyłanie linku...' : cooldown > 0 ? `Wysłano (ponów za ${cooldown} s)` : 'Wyślij link do zmiany hasła'}</span>
        </button>
      </div>
    </section>
  );
}

export default function ProfilePage({ role = 'client' }) {
  const isClient = role === 'client';
  const { userProfile } = useAuth();
  const [loading, setLoading] = useState(isClient);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [profile, setProfile] = useState({
    first_name: '', last_name: '', email: '', phone_number: '', shoe_size: '',
    experience_level: '', savedLevel: '', experience_verified: false,
    experience_verified_at: null, experience_verified_by_name: null,
  });

  const applyProfile = (data = {}) =>
    setProfile((prev) => ({
      ...prev,
      first_name: data.first_name ?? prev.first_name,
      last_name: data.last_name ?? prev.last_name,
      email: data.email ?? prev.email,
      phone_number: data.phone_number || '',
      shoe_size: data.shoe_size || '',
      experience_level: data.experience_level || '',
      savedLevel: data.experience_level || '',
      experience_verified: Boolean(data.experience_verified),
      experience_verified_at: data.experience_verified_at || null,
      experience_verified_by_name: data.experience_verified_by_name || null,
    }));

  useEffect(() => {
    if (!isClient) return undefined;
    let active = true;
    apiClient
      .get('/api/v1/client/profile')
      .then((res) => { if (active) applyProfile(res.data); })
      .catch((err) => { if (active) setErrorMsg(extractApiError(err, 'Nie udało się wczytać profilu wspinacza.')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [isClient]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setErrorMsg(null); setSuccessMsg(null); setSaving(true);
    try {
      const res = await apiClient.put('/api/v1/client/profile', {
        phone_number: profile.phone_number.trim() || null,
        shoe_size: profile.shoe_size || null,
        experience_level: profile.experience_level || null,
      });
      applyProfile(res.data);
      setSuccessMsg('Twój profil wspinacza został zapisany. Dane będą automatycznie podpowiadane podczas rezerwacji.');
    } catch (err) {
      setErrorMsg(extractApiError(err, 'Nie udało się zapisać zmian w profilu.'));
    } finally { setSaving(false); }
  };

  const fullName = isClient
    ? `${profile.first_name} ${profile.last_name}`.trim() || 'Wspinacz CW Spider'
    : [userProfile?.firstName, userProfile?.lastName].filter(Boolean).join(' ') || userProfile?.username || 'Instruktor CW Spider';
  const email = (isClient ? profile.email : userProfile?.email) || '—';

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900">
            {isClient ? 'Profil wspinacza' : 'Mój profil'}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {isClient
              ? 'Uzupełnij dane kontaktowe i sprzętowe, aby przyspieszyć rezerwację treningów.'
              : 'Podgląd danych konta instruktora oraz ustawienia bezpieczeństwa logowania.'}
          </p>
        </div>
        <Link to={isClient ? '/app/client' : '/app/instructor'} className={BTN_SECONDARY}>
          {isClient ? 'Przejdź do kalendarza' : 'Wróć do grafiku'}
        </Link>
      </div>

      <AlertBanner type="error" message={errorMsg} onClose={() => setErrorMsg(null)} />
      <AlertBanner type="success" message={successMsg} onClose={() => setSuccessMsg(null)} />

      <section className={`${CARD_CLASS} p-5 sm:p-6`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-slate-800 to-emerald-700 text-white flex items-center justify-center shrink-0 shadow-sm">
              <User className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="text-lg font-bold text-slate-900 truncate">{fullName}</div>
              <div className="flex items-center gap-1.5 text-sm text-slate-600 truncate mt-0.5">
                <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="truncate">{email}</span>
              </div>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200 self-start sm:self-center">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>{isClient ? 'Tożsamość chroniona przez Keycloak' : 'Instruktor CW Spider'}</span>
          </span>
        </div>
      </section>

      {isClient && (loading ? (
        <div className={`${CARD_CLASS} p-10 text-center text-slate-500`}>Wczytywanie ustawień profilu...</div>
      ) : (
        <form onSubmit={handleSubmit} className={`${CARD_CLASS} p-5 sm:p-6 space-y-6`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label htmlFor="profile-phone" className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><Phone className="w-4 h-4 text-emerald-600" />Numer telefonu kontaktowego</label>
              <input id="profile-phone" type="tel" value={profile.phone_number} onChange={(e) => setProfile((p) => ({ ...p, phone_number: e.target.value }))} placeholder="np. +48 519 699 795" maxLength={20} className={INPUT_CLASS} />
              <p className="text-xs text-slate-500">Automatycznie podpowiadany przy rezerwacji i widoczny wyłącznie dla Twojego instruktora.</p>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="profile-shoe-size" className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><Footprints className="w-4 h-4 text-emerald-600" />Rozmiar buta wspinaczkowego (EU)</label>
              <select id="profile-shoe-size" value={profile.shoe_size} onChange={(e) => setProfile((p) => ({ ...p, shoe_size: e.target.value }))} className={SELECT_CLASS}>
                <option value="">Brak / korzystam z własnych butów</option>
                {SHOE_SIZE_OPTIONS.map((sz) => <option key={sz} value={sz}>EU {sz}</option>)}
              </select>
              <p className="text-xs text-slate-500">Ułatwia recepcji CW Spider przygotowanie obuwia przy opcji „Wypożyczenie sprzętu”.</p>
            </div>
          </div>

          <div className="space-y-2.5 pt-2 border-t border-slate-100">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><Award className="w-4 h-4 text-emerald-600" />Poziom zaawansowania wspinaczkowego</span>
                <ExperienceLevelBadge level={profile.savedLevel} verified={profile.experience_verified} verifiedByName={profile.experience_verified_by_name} verifiedAt={profile.experience_verified_at} />
              </div>
              {profile.experience_level && (
                <button type="button" onClick={() => setProfile((p) => ({ ...p, experience_level: '' }))} className="text-xs font-medium text-slate-500 hover:text-slate-800 underline">Wyczyść wybór</button>
              )}
            </div>
            {profile.experience_verified && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-900">
                Twój poziom został zatwierdzony przez instruktora
                {profile.experience_verified_by_name && <> <strong>{profile.experience_verified_by_name}</strong></>}
                {profile.experience_verified_at ? ` (${formatDate24(profile.experience_verified_at)})` : ''}.
                {profile.experience_level !== profile.savedLevel && (
                  <span className="block mt-1 font-semibold text-amber-800">Uwaga: ręczna zmiana poziomu spowoduje usunięcie zatwierdzenia do czasu ponownej weryfikacji przez instruktora.</span>
                )}
              </div>
            )}
            <ExperienceLevelSelector value={profile.experience_level} onChange={(val) => setProfile((p) => ({ ...p, experience_level: val }))} />
          </div>

          <div className="pt-3 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-end gap-3">
            <button type="submit" disabled={saving} className={`${BTN_PRIMARY} w-full sm:w-auto px-6`}>
              <Save className="w-4 h-4" />
              <span>{saving ? 'Zapisywanie profilu...' : 'Zapisz ustawienia profilu'}</span>
            </button>
          </div>
        </form>
      ))}

      <AccountSecurityCard redirectPath={isClient ? '/app/client/profile' : '/app/instructor/profile'} />
    </div>
  );
}
