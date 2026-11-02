import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Clock,
  GraduationCap,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  X,
} from 'lucide-react';

const CURRENT_YEAR = new Date().getFullYear();

function FacebookIcon({ className = 'w-4 h-4' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function InstagramIcon({ className = 'w-4 h-4' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  );
}

export default function Footer() {
  const [termsOpen, setTermsOpen] = useState(false);

  return (
    <footer className="mt-auto bg-slate-900 text-slate-300 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Kolumna 1: O systemie / Logo Spider */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <img
                src="/logospider.png"
                alt="Centrum Wspinaczkowe Spider"
                className="h-10 w-auto object-contain"
              />
              <div className="flex flex-col">
                <span className="font-extrabold tracking-tight text-white text-base leading-none">
                  CW SPIDER
                </span>
                <span className="text-[11px] text-slate-400 font-medium tracking-wide mt-1">
                  Centrum Wspinaczkowe Bydgoszcz
                </span>
              </div>
            </div>

            <p className="text-sm text-slate-400 leading-relaxed">
              Nowoczesny system rezerwacji treningów wspinaczkowych oraz dziennik
              postępów dla klientów i instruktorów Centrum Wspinaczkowego Spider.
            </p>

            <div className="flex items-center gap-2.5 pt-1">
              <a
                href="https://www.facebook.com/centrum.wspinaczkowe"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Facebook Centrum Wspinaczkowe Spider"
                className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-emerald-600 transition-colors shadow-sm"
              >
                <FacebookIcon className="w-4 h-4" />
              </a>

              <a
                href="https://www.instagram.com/cw_spider"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram Centrum Wspinaczkowe Spider"
                className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-gradient-to-tr hover:from-amber-600 hover:to-pink-600 transition-colors shadow-sm"
              >
                <InstagramIcon className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Kolumna 2: Szybkie linki (Grafik, Rezerwacje, Regulamin) */}
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-white tracking-tight">
              Szybkie linki
            </h3>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link
                  to="/app/client"
                  className="text-slate-300 hover:text-emerald-400 transition-colors inline-block"
                >
                  Grafik treningów
                </Link>
              </li>
              <li>
                <Link
                  to="/app/client/reservations"
                  className="text-slate-300 hover:text-emerald-400 transition-colors inline-block"
                >
                  Moje rezerwacje
                </Link>
              </li>
              <li>
                <Link
                  to="/instructors"
                  className="text-slate-300 hover:text-emerald-400 transition-colors inline-block"
                >
                  Nasi instruktorzy
                </Link>
              </li>
              <li>
                <Link
                  to="/app/client/progress"
                  className="text-slate-300 hover:text-emerald-400 transition-colors inline-block"
                >
                  Dziennik postępów
                </Link>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => setTermsOpen(true)}
                  className="text-slate-300 hover:text-emerald-400 transition-colors inline-block text-left"
                >
                  Regulamin wspinaczki
                </button>
              </li>
            </ul>
          </div>

          {/* Kolumna 3: Kontakt i godziny */}
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-white tracking-tight">
              Kontakt i godziny
            </h3>
            <div className="space-y-3 text-sm text-slate-300">
              <div className="flex items-center gap-2.5">
                <Clock className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="font-medium text-white">Pn – Nd: 10:00 – 22:00</span>
              </div>

              <div className="flex items-start gap-2.5">
                <MapPin className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <address className="not-italic leading-relaxed text-slate-300">
                  ul. Świecka 8 (od Racławickiej),
                  <br />
                  85-048 Bydgoszcz
                </address>
              </div>

              <div className="flex items-center gap-2.5">
                <Phone className="w-4 h-4 text-emerald-400 shrink-0" />
                <div className="flex flex-wrap items-center gap-x-2">
                  <a
                    href="tel:+48519699795"
                    className="hover:text-emerald-400 transition-colors font-medium"
                  >
                    519 699 795
                  </a>
                  <span className="text-slate-600">•</span>
                  <a
                    href="tel:+48733054888"
                    className="hover:text-emerald-400 transition-colors font-medium"
                  >
                    733 054 888
                  </a>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-emerald-400 shrink-0" />
                <a
                  href="mailto:centrum.wspinaczkowe@gmail.com"
                  className="hover:text-emerald-400 transition-colors break-all"
                >
                  centrum.wspinaczkowe@gmail.com
                </a>
              </div>
            </div>
          </div>

          {/* Kolumna 4: Informacja akademicka / autor projektu */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-white font-semibold text-base tracking-tight">
              <GraduationCap className="w-5 h-5 text-emerald-400" />
              <h3>Informacja akademicka</h3>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed">
              Aplikacja realizowana w ramach pracy inżynierskiej.
            </p>

            <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-3.5 space-y-2 text-xs sm:text-sm">
              <div>
                <span className="text-slate-400 text-xs block">Autor projektu:</span>
                <span className="text-white font-semibold">Paweł Jońca</span>
              </div>
              <div>
                <span className="text-slate-400 text-xs block">Uczelnia:</span>
                <span className="text-slate-200 font-medium">Politechnika Bydgoska</span>
              </div>
              <div>
                <span className="text-slate-400 text-xs block">Projekt:</span>
                <span className="text-emerald-400 font-medium">
                  System rezerwacji treningów wspinaczkowych
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Dolna linia: Prawa autorskie i status */}
        <div className="mt-12 pt-8 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs sm:text-sm text-slate-400 text-center sm:text-left">
          <p>
            &copy; {CURRENT_YEAR} Centrum Wspinaczkowe Spider Bydgoszcz. Wszelkie prawa zastrzeżone.
          </p>
          <p className="text-slate-400">
            Praca inżynierska &bull; Paweł Jońca &bull; Politechnika Bydgoska
          </p>
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
                  Prosimy o przybycie do recepcji Centrum Wspinaczkowego Spider
                  na 10 minut przed planowaną godziną rozpoczęcia zajęć w celu
                  przebrania się i weryfikacji rezerwacji.
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-slate-900 mb-1">
                  2. Bezpłatne odwołanie wizyty
                </h4>
                <p>
                  Każdą rezerwację można bezpłatnie odwołać z poziomu panelu
                  klienta najpóźniej na 12 godzin przed zaplanowanym treningiem.
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-slate-900 mb-1">
                  3. Sprzęt wspinaczkowy
                </h4>
                <p>
                  Wypożyczenie atestowanej uprzęży, butów wspinaczkowych oraz
                  woreczka z magnezją jest dostępne w recepcji obiektu przed
                  rozpoczęciem treningu.
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-slate-900 mb-1">
                  4. Bezpieczeństwo i asekuracja
                </h4>
                <p>
                  Wszyscy uczestnicy zobowiązani są do przestrzegania instrukcji
                  stanowiskowych obiektu oraz bezwzględnego stosowania się do
                  poleceń dyżurującego instruktora.
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
