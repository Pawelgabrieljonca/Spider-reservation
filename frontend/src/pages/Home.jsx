export default function Home() {
  return (
    <section className="relative flex-1 w-full min-h-screen flex items-center justify-center overflow-hidden bg-slate-950 px-6 sm:px-12 py-36 sm:py-44">
      <img
        src="/separator.webp"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-cover object-center select-none"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-b from-slate-950/70 via-slate-950/45 to-slate-950/70"
      />

      <div className="relative z-10 max-w-4xl mx-auto text-center">
        <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-white leading-tight drop-shadow-lg">
          Zacznij od dzisiaj swój trening
        </h1>
      </div>
    </section>
  );
}
