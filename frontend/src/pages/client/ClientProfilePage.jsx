import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  Award,
  CheckCircle2,
  Footprints,
  Mail,
  Phone,
  Save,
  ShieldCheck,
  User,
  X,
} from 'lucide-react';
import apiClient from '../../api/client';
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  CARD_CLASS,
  INPUT_CLASS,
  SELECT_CLASS,
} from '../../styles/ui';
import SEO from '../../components/SEO';
import { extractApiError } from '../../utils/grades';

const SHOE_SIZE_OPTIONS = [];
for (let size = 34; size <= 48; size += 0.5) {
  SHOE_SIZE_OPTIONS.push(Number.isInteger(size) ? String(size) : size.toFixed(1));
}

const EXPERIENCE_OPTIONS = [
  {
    value: 'BEGINNER',
    title: 'Początkujący',
    description:
      'Pierwsze wizyty na ściance, nauka podstaw asekuracji, bezpiecznego odpadania i techniki nóg.',
  },
  {
    value: 'INTERMEDIATE',
    title: 'Średniozaawansowany',
    description:
      'Swobodne wspinanie na wędkę lub z dolną asekuracją, praca nad płynnością ruchu (ok. V – VI.2).',
  },
  {
    value: 'ADVANCED',
    title: 'Zaawansowany',
    description:
      'Trening ukierunkowany na wynik, przewieszenia, bouldering siłowy oraz taktykę przejść RP/OS.',
  },
];

export default function ClientProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const [identity, setIdentity] = useState({
    firstName: '',
    lastName: '',
    email: '',
  });
  const [phoneNumber, setPhoneNumber] = useState('');
  const [shoeSize, setShoeSize] = useState('');
  const [experienceLevel, setExperienceLevel] = useState('');

  useEffect(() => {
    let active = true;
    apiClient
      .get('/api/v1/client/profile')
      .then((res) => {
        if (!active) return;
        const data = res.data || {};
        setIdentity({
          firstName: data.first_name || '',
          lastName: data.last_name || '',
          email: data.email || '',
        });
        setPhoneNumber(data.phone_number || '');
        setShoeSize(data.shoe_size || '');
        setExperienceLevel(data.experience_level || '');
      })
      .catch((err) => {
        if (active) setErrorMsg(extractApiError(err, 'Nie udało się wczytać profilu wspinacza.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setSaving(true);

    try {
      const res = await apiClient.put('/api/v1/client/profile', {
        phone_number: phoneNumber.trim() || null,
        shoe_size: shoeSize || null,
        experience_level: experienceLevel || null,
      });
      const updated = res.data || {};
      setPhoneNumber(updated.phone_number || '');
      setShoeSize(updated.shoe_size || '');
      setExperienceLevel(updated.experience_level || '');
      setSuccessMsg(
        'Twój profil wspinacza został zapisany. Dane będą automatycznie podpowiadane podczas rezerwacji.'
      );
    } catch (err) {
      setErrorMsg(extractApiError(err, 'Nie udało się zapisać zmian w profilu.'));
    } finally {
      setSaving(false);
    }
  };

  const fullName = `${identity.firstName} ${identity.lastName}`.trim() || 'Wspinacz CW Spider';

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <SEO
        title="Mój Profil | Centrum Wspinaczkowe Spider"
        description="Ustawienia profilu wspinacza, dane kontaktowe i preferencje rezerwacji w systemie Centrum Wspinaczkowego Spider w Bydgoszczy."
        path="/app/client/profile"
        robots="noindex, nofollow"
      />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900">
            Profil wspinacza
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Uzupełnij dane kontaktowe i sprzętowe, aby przyspieszyć rezerwację treningów.
          </p>
        </div>

        <Link to="/app/client" className={BTN_SECONDARY}>
          Przejdź do kalendarza
        </Link>
      </div>

      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-3.5 flex items-center justify-between gap-3 text-sm sm:text-base">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg hover:bg-red-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl px-4 py-3.5 flex items-center justify-between gap-3 text-sm sm:text-base">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMsg(null)}
            className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg hover:bg-emerald-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Karta tożsamości z Keycloak (tylko do odczytu) */}
      <section className={`${CARD_CLASS} p-5 sm:p-6`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-slate-800 to-emerald-700 text-white flex items-center justify-center font-bold text-lg shrink-0 shadow-sm">
              <User className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="text-lg font-bold text-slate-900 truncate">{fullName}</div>
              <div className="flex items-center gap-1.5 text-sm text-slate-600 truncate mt-0.5">
                <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="truncate">{identity.email || '—'}</span>
              </div>
            </div>
          </div>

          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200 self-start sm:self-center">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Tożsamość chroniona przez Keycloak</span>
          </span>
        </div>
      </section>

      {/* Formularz edycji danych wspinacza */}
      {loading ? (
        <div className={`${CARD_CLASS} p-10 text-center text-slate-500`}>
          Wczytywanie ustawień profilu...
        </div>
      ) : (
        <form onSubmit={handleSubmit} className={`${CARD_CLASS} p-5 sm:p-6 space-y-6`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Numer telefonu */}
            <div className="space-y-1.5">
              <label
                htmlFor="profile-phone"
                className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"
              >
                <Phone className="w-4 h-4 text-emerald-600" />
                <span>Numer telefonu kontaktowego</span>
              </label>
              <input
                id="profile-phone"
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="np. +48 519 699 795"
                maxLength={20}
                className={INPUT_CLASS}
              />
              <p className="text-xs text-slate-500">
                Automatycznie podpowiadany przy rezerwacji i widoczny wyłącznie dla Twojego
                instruktora.
              </p>
            </div>

            {/* Rozmiar buta wspinaczkowego */}
            <div className="space-y-1.5">
              <label
                htmlFor="profile-shoe-size"
                className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"
              >
                <Footprints className="w-4 h-4 text-emerald-600" />
                <span>Rozmiar buta wspinaczkowego (EU)</span>
              </label>
              <select
                id="profile-shoe-size"
                value={shoeSize}
                onChange={(e) => setShoeSize(e.target.value)}
                className={SELECT_CLASS}
              >
                <option value="">Brak / korzystam z własnych butów</option>
                {SHOE_SIZE_OPTIONS.map((sz) => (
                  <option key={sz} value={sz}>
                    EU {sz}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500">
                Ułatwia recepcji CW Spider przygotowanie obuwia przy opcji „Wypożyczenie sprzętu”.
              </p>
            </div>
          </div>

          {/* Poziom zaawansowania */}
          <div className="space-y-2.5 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                <Award className="w-4 h-4 text-emerald-600" />
                <span>Poziom zaawansowania wspinaczkowego</span>
              </label>
              {experienceLevel && (
                <button
                  type="button"
                  onClick={() => setExperienceLevel('')}
                  className="text-xs font-medium text-slate-500 hover:text-slate-800 underline"
                >
                  Wyczyść wybór
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {EXPERIENCE_OPTIONS.map((opt) => {
                const selected = experienceLevel === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setExperienceLevel(opt.value)}
                    className={`text-left p-4 rounded-xl border-2 transition-all flex flex-col justify-between gap-2 ${
                      selected
                        ? 'border-emerald-600 bg-emerald-50/70 shadow-sm'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-900 text-sm sm:text-base">
                        {opt.title}
                      </span>
                      <span
                        className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                          selected
                            ? 'border-emerald-600 bg-emerald-600'
                            : 'border-slate-300 bg-white'
                        }`}
                      >
                        {selected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">{opt.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-end gap-3">
            <button
              type="submit"
              disabled={saving}
              className={`${BTN_PRIMARY} w-full sm:w-auto px-6`}
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Zapisywanie profilu...' : 'Zapisz ustawienia profilu'}</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

