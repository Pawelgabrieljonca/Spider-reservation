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

      <div className="relative z-10 max-w-4xl mx-auto text-center px-4 space-y-8 sm:space-y-10">
        <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-white leading-tight drop-shadow-lg">
          Zacznij od dzisiaj swój trening
        </h1>

        <div>
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
