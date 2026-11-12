import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, X } from 'lucide-react';

const CURRENT_YEAR = new Date().getFullYear();

function FacebookIcon({ className = 'w-4 h-4' }) {
  return (
    <svg viewBox="0 0 24 24" className={`${className} fill-current`} aria-hidden="true">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function InstagramIcon({ className = 'w-4 h-4' }) {
  return (
    <svg viewBox="0 0 24 24" className={`${className} fill-none stroke-current stroke-[1.8]`} aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.4" cy="6.6" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export default function Footer() {
  const [termsOpen, setTermsOpen] = useState(false);

  return (
    <footer className="mt-auto relative z-20 bg-[#0b1c36] text-white border-t border-blue-900/60">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 sm:pt-14 pb-8">
        {/* Główna siatka 4 kolumn */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12 pb-12">
          {/* Kolumna 1: Brand / Logo + Opis + Social media */}
          <div className="space-y-4">
            <Link to="/" className="inline-block focus:outline-none" aria-label="CW Spider">
              <img
                src="/logospider.png"
                alt="Centrum Wspinaczkowe Spider"
                className="h-12 sm:h-13 w-auto object-contain"
                onError={(e) => {
                  e.currentTarget.src = '/logospider-dark.png';
                  e.currentTarget.classList.add('invert');
                }}
              />
            </Link>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-[230px]">
              system rezerwacji treningów wspinaczkowych online.
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <a
                href="https://www.instagram.com/cw_spider"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram CW Spider"
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-white/20 hover:border-white/60 bg-white/5 hover:bg-white/10 text-white text-xs font-medium transition-all"
              >
                <InstagramIcon className="w-3.5 h-3.5" />
                <span>Instagram</span>
              </a>
              <a
                href="https://www.facebook.com/centrum.wspinaczkowe"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Facebook CW Spider"
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-white/20 hover:border-white/60 bg-white/5 hover:bg-white/10 text-white text-xs font-medium transition-all"
              >
                <FacebookIcon className="w-3.5 h-3.5" />
                <span>Facebook</span>
              </a>
            </div>
          </div>

          {/* Kolumna 2: Nawigacja */}
          <div className="space-y-3">
            <h4 className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-blue-300/90 font-mono">
              Nawigacja
            </h4>
            <ul className="space-y-2 text-xs sm:text-sm">
              <li>
                <Link
                  to="/terminy"
                  className="text-slate-300 hover:text-white transition-colors"
                >
                  Grafik treningów
                </Link>
              </li>
              <li>
                <Link
                  to="/instructors"
                  className="text-slate-300 hover:text-white transition-colors"
                >
                  Nasi instruktorzy
                </Link>
              </li>
            </ul>
          </div>

          {/* Kolumna 3: Godziny otwarcia */}
          <div className="space-y-3">
            <h4 className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-blue-300/90 font-mono">
              Godziny otwarcia
            </h4>
            <ul className="space-y-2 text-xs sm:text-sm text-slate-300">
              <li>Pn - Nd: 10:00 - 22:00</li>
              <li>
                <a
                  href="https://maps.google.com/?q=Centrum+Wspinaczkowe+Spider+Bydgoszcz"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white transition-colors"
                >
                  ul. Świecka 8, 85-048 Bydgoszcz
                </a>
              </li>
            </ul>
          </div>

          {/* Kolumna 4: Kontakt */}
          <div className="space-y-3">
            <h4 className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-blue-300/90 font-mono">
              Kontakt
            </h4>
            <ul className="space-y-2 text-xs sm:text-sm">
              <li>
                <a
                  href="tel:+48519699795"
                  className="text-slate-300 hover:text-white transition-colors"
                >
                  519 699 795
                </a>
              </li>
              <li>
                <a
                  href="tel:+48733054888"
                  className="text-slate-300 hover:text-white transition-colors"
                >
                  733 054 888
                </a>
              </li>
              <li>
                <a
                  href="mailto:centrum.wspinaczkowe@gmail.com"
                  className="text-slate-300 hover:text-white transition-colors break-all"
                >
                  centrum.wspinaczkowe@gmail.com
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Dolny pasek praw autorskich i regulaminu */}
        <div className="pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <p className="text-center sm:text-left">
            © {CURRENT_YEAR} Centrum Wspinaczkowe Spider Bydgoszcz. Wszelkie prawa zastrzeżone.
          </p>

          <button
            type="button"
            onClick={() => setTermsOpen(true)}
            className="text-slate-300 hover:text-white underline decoration-white/30 underline-offset-4 transition-colors"
          >
            Regulamin wspinaczki
          </button>
        </div>
      </div>

      {/* Modal: Regulamin wspinaczki */}
      {termsOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm"
        >
          <div className="bg-white text-slate-900 rounded-2xl max-w-lg w-full p-6 sm:p-7 shadow-2xl border border-slate-200 relative max-h-[90vh] overflow-y-auto space-y-5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">
                  Regulamin rezerwacji i wspinaczki
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setTermsOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors"
                aria-label="Zamknij regulamin"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-sm text-slate-600 leading-relaxed">
              <div>
                <h4 className="font-semibold text-slate-900 mb-1">
                  1. Rezerwacja i punktualność
                </h4>
                <p>
                  Prosimy o przybycie do recepcji Centrum Wspinaczkowego Spider na 10 minut
                  przed planowaną godziną rozpoczęcia zajęć w celu przebrania się i weryfikacji
                  rezerwacji.
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-slate-900 mb-1">
                  2. Bezpłatne odwołanie wizyty
                </h4>
                <p>
                  Każdą rezerwację można bezpłatnie odwołać z poziomu panelu klienta
                  najpóźniej na 12 godzin przed zaplanowanym treningiem.
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-slate-900 mb-1">
                  3. Sprzęt wspinaczkowy
                </h4>
                <p>
                  Wypożyczenie atestowanej uprzęży, butów wspinaczkowych oraz woreczka z magnezją
                  jest dostępne w recepcji obiektu przed rozpoczęciem treningu.
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-slate-900 mb-1">
                  4. Bezpieczeństwo i asekuracja
                </h4>
                <p>
                  Wszyscy uczestnicy zobowiązani są do przestrzegania instrukcji stanowiskowych
                  obiektu oraz bezwzględnego stosowania się do poleceń dyżurującego instruktora.
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setTermsOpen(false)}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm rounded-xl transition-colors"
              >
                Rozumiem
              </button>
            </div>
          </div>
        </div>
      )}
    </footer>
  );
}
