import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <section className="relative w-full min-h-[100dvh] flex items-center justify-center overflow-hidden bg-slate-950 px-6 sm:px-12 py-20 sm:py-28">
      <img
        src="/separator.webp"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-cover object-center select-none"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-b from-slate-950/75 via-slate-950/50 to-slate-950/75"
      />

      <div className="relative z-10 max-w-screen-2xl w-full mx-auto text-center px-4 space-y-6 sm:space-y-8">
        <h1 className="font-heading font-extrabold uppercase tracking-wide text-[26px] sm:text-4xl md:text-5xl lg:text-6xl xl:text-[56px] 2xl:text-[68px] text-white leading-tight drop-shadow-lg">
          <span className="inline-block whitespace-nowrap">Rezerwacja treningów</span>{' '}
          <span className="inline-block whitespace-nowrap">wspinaczkowych online</span>
        </h1>

        <p className="text-base sm:text-lg md:text-xl lg:text-2xl text-slate-200 max-w-2xl mx-auto font-normal leading-relaxed drop-shadow">
          Wybierz instruktora, zarezerwuj termin w CW Spider i śledź swoje postępy na ścianie w jednym miejscu.
        </p>

        <div className="pt-2 sm:pt-4">
          <Link
            to="/app/client"
            className="inline-flex items-center justify-center min-h-[52px] sm:min-h-[56px] px-8 sm:px-10 py-3.5 sm:py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold text-base sm:text-lg shadow-xl shadow-slate-950/60 hover:scale-[1.02] active:scale-[0.99] transition-all"
          >
            Zarezerwuj trening
          </Link>
        </div>
      </div>
    </section>
  );
}
