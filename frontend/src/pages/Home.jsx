import { Calendar, Clock, LogIn, TrendingUp, UserPlus } from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import { BTN_DARK, BTN_PRIMARY, CARD_CLASS } from '../styles/ui';

export default function Home() {
  const { isAuthenticated, login, keycloak, clearSessionExpiredNotice } = useAuth();

  const handleRegister = () => {
    clearSessionExpiredNotice?.();
    keycloak.register();
  };

  return (
    <div className="space-y-8">
      {/* Sekcja Hero */}
      <section className={`${CARD_CLASS} p-6 sm:p-10`}>
        <div className="max-w-3xl space-y-5">
          <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1 rounded-full text-sm font-medium">
            <span>Centrum Wspinaczkowe Spider • Bydgoszcz</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 leading-tight">
            Zarezerwuj trening wspinaczkowy online bez kolejek i telefonów
          </h1>

          <p className="text-base sm:text-lg text-slate-600 leading-relaxed">
            Wybierz dogodny termin zajęć indywidualnych (1h) lub w małej grupie (1.5h), odbierz
            potwierdzenie z załącznikiem kalendarza (.ics) i śledź swoje przejścia w module{' '}
            <strong className="text-slate-800 font-semibold">Dziennik postępów</strong>.
          </p>

          {!isAuthenticated && (
            <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 pt-2">
              <button type="button" onClick={() => login()} className={BTN_DARK}>
                <LogIn className="w-5 h-5" />
                <span>Zaloguj się</span>
              </button>

              <button type="button" onClick={handleRegister} className={BTN_PRIMARY}>
                <UserPlus className="w-5 h-5" />
                <span>Zarejestruj się</span>
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Reguły i atuty */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className={`${CARD_CLASS} p-6 space-y-3`}>
          <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
            <Calendar className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">Gwarancja wolnego miejsca</h2>
          <p className="text-base text-slate-600 leading-relaxed">
            Trening personalny (1h) dla 1 osoby lub zajęcia w małej grupie (1.5h, maks. 3 osoby).
            Blokada transakcyjna całkowicie eliminuje podwójne zapisy.
          </p>
        </div>

        <div className={`${CARD_CLASS} p-6 space-y-3`}>
          <div className="w-11 h-11 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">Elastyczne odwołanie do 12h</h2>
          <p className="text-base text-slate-600 leading-relaxed">
            Zmiana planów? Wizytę możesz bezpłatnie odwołać jednym kliknięciem najpóźniej na 12
            godzin przed rozpoczęciem treningu.
          </p>
        </div>

        <div className={`${CARD_CLASS} p-6 space-y-3`}>
          <div className="w-11 h-11 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
            <TrendingUp className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">Dziennik postępów</h2>
          <p className="text-base text-slate-600 leading-relaxed">
            Po zajęciach instruktor zapisuje pokonane drogi w skali krakowskiej Kurtyki (np. VI+,
            VI.1+, VI.3) wraz ze wskazówkami technicznymi i motorycznymi.
          </p>
        </div>
      </section>
    </div>
  );
}
