const CURRENT_YEAR = new Date().getFullYear();

export default function Footer() {
  return (
    <footer className="mt-auto bg-slate-900 text-slate-300 border-t border-slate-800">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 lg:gap-12">
          {/* Kolumna 1: Kontakt */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white tracking-tight">Kontakt</h2>
            <div className="space-y-2 text-base text-slate-300">
              <p>
                <a
                  href="tel:+48519699795"
                  className="hover:text-emerald-400 transition-colors"
                >
                  519 699 795
                </a>
                <span className="text-slate-500 mx-2">&bull;</span>
                <a
                  href="tel:+48733054888"
                  className="hover:text-emerald-400 transition-colors"
                >
                  733 054 888
                </a>
              </p>
              <p>
                <a
                  href="mailto:centrum.wspinaczkowe@gmail.com"
                  className="hover:text-emerald-400 transition-colors break-all"
                >
                  centrum.wspinaczkowe@gmail.com
                </a>
              </p>
              <div className="pt-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-base">
                <a
                  href="https://www.facebook.com/centrum.wspinaczkowe"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-300 hover:text-emerald-400 underline underline-offset-4 decoration-slate-600 hover:decoration-emerald-400 transition-colors"
                >
                  Facebook (/centrum.wspinaczkowe)
                </a>
                <a
                  href="https://www.instagram.com/cw_spider"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-300 hover:text-emerald-400 underline underline-offset-4 decoration-slate-600 hover:decoration-emerald-400 transition-colors"
                >
                  Instagram (@cw_spider)
                </a>
              </div>
            </div>
          </div>

          {/* Kolumna 2: Adres */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white tracking-tight">Adres</h2>
            <address className="not-italic space-y-1.5 text-base text-slate-300 leading-relaxed">
              <p>ul. Świecka 8 (dojazd od strony ulicy Racławickiej),</p>
              <p>85-048 Bydgoszcz</p>
            </address>
          </div>

          {/* Kolumna 3: Godziny otwarcia */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white tracking-tight">Godziny otwarcia</h2>
            <ul className="space-y-2 text-base text-slate-300">
              <li>pn – pt: 10:00 do 22:00</li>
              <li>sb – nd: 10:00 do 22:00</li>
            </ul>
          </div>
        </div>

        {/* Sekcja techniczna i prawa autorskie */}
        <div className="mt-10 pt-8 border-t border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-sm sm:text-base text-slate-400">
          <span>
            &copy; {CURRENT_YEAR} Centrum Wspinaczkowe Spider Bydgoszcz
          </span>
          <p className="text-slate-300">
            Widzisz błąd w systemie? Zgłoś to:{' '}
            <a
              href="mailto:dellmatma@gmail.com"
              className="font-medium text-emerald-400 hover:text-emerald-300 underline underline-offset-4 transition-colors"
            >
              dellmatma@gmail.com
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
