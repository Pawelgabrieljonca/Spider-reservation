import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, X } from 'lucide-react';
import RidgelineDitherFooter from './ui/ridgeline-dither-footer';

const CURRENT_YEAR = new Date().getFullYear();

export default function Footer() {
  const [termsOpen, setTermsOpen] = useState(false);
  const navigate = useNavigate();

  const handleNav = (path) => (e) => {
    e.preventDefault();
    navigate(path);
  };

  const navLinks = [
    { label: 'Grafik treningów', href: '/terminy', onClick: handleNav('/terminy') },
    { label: 'Nasi instruktorzy', href: '/instructors', onClick: handleNav('/instructors') },
  ];

  const columns = [
    {
      title: 'Nawigacja',
      links: navLinks,
    },
    {
      title: 'Godziny otwarcia',
      links: [
        { label: 'Pn - Nd: 10:00 - 22:00' },
        {
          label: 'ul. Świecka 8, 85-048 Bydgoszcz',
          href: 'https://maps.google.com/?q=Centrum+Wspinaczkowe+Spider+Bydgoszcz',
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      ],
    },
    {
      title: 'Kontakt',
      links: [
        { label: '519 699 795', href: 'tel:+48519699795' },
        { label: '733 054 888', href: 'tel:+48733054888' },
        { label: 'centrum.wspinaczkowe@gmail.com', href: 'mailto:centrum.wspinaczkowe@gmail.com' },
      ],
    },
  ];

  const socials = [
    {
      icon: 'facebook',
      href: 'https://www.facebook.com/centrum.wspinaczkowe',
      label: 'Facebook CW Spider',
    },
    {
      icon: 'instagram',
      href: 'https://www.instagram.com/cw_spider',
      label: 'Instagram CW Spider',
    },
  ];

  return (
    <footer className="mt-auto relative z-20 bg-[#F4F7F9]">
      <RidgelineDitherFooter
        preset="glacier"
        seed={23}
        ridges={7}
        height="620px"
        sceneMinHeight="320px"
        maxWidth="1240px"
        fontFamily="'Barlow', sans-serif"
        logo={
          <img
            src="/logospider-dark.png"
            alt="Centrum Wspinaczkowe Spider"
            className="h-14 sm:h-16 w-auto object-contain"
            onError={(e) => {
              e.currentTarget.src = '/logospider.png';
              e.currentTarget.classList.add('brightness-0');
            }}
          />
        }
        brandHref="/"
        name=""
        tagline="system rezerwacji treningów wspinaczkowych online."
        columns={columns}
        socials={socials}
        copyright={`© ${CURRENT_YEAR} Centrum Wspinaczkowe Spider Bydgoszcz. Wszelkie prawa zastrzeżone.`}
        bottomRight={
          <button
            type="button"
            onClick={() => setTermsOpen(true)}
            aria-label="Otwórz regulamin wspinaczki"
          >
            Regulamin wspinaczki
          </button>
        }
        credit={null}
        palette={{
          paper: '#F4F7F9',
          ink: '#1E293B',
          muted: '#475569',
          sectionLabel: '#64748B',
          line: '#dae3ed',
          heart: '#e5484d',
          tones: [
            '#F4F7F9',
            '#d6e6f4',
            '#a8cae7',
            '#6b9ecc',
            '#34679a',
            '#1a3e66',
            '#0b2140',
          ],
        }}
      />

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
