import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Award, Calendar, Search } from 'lucide-react';
import apiClient from '../api/client';
import { BTN_PRIMARY, CARD_CLASS, INPUT_CLASS, SELECT_CLASS } from '../styles/ui';

const BASE_INSTRUCTORS = [
  {
    id: 'tomasz-kowalski',
    name: 'Tomasz Kowalski',
    specialization: 'Wspinaczka sportowa',
    tags: ['Wspinaczka sportowa', 'Trening z dolną asekuracją', 'Sekcje zaawansowane'],
    experienceYears: 9,
    maxGrade: 'VI.5+ RP',
    bio: 'Instruktor wspinaczki sportowej PZA. Specjalizuje się w technice prowadzenia z dolną asekuracją, taktyce przejść RP/OS oraz budowaniu wytrzymałości siłowej na drogach przewieszonych.',
    photo:
      'https://images.unsplash.com/photo-1522163182402-834f871fd851?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'marta-nowak',
    name: 'Marta Nowak',
    specialization: 'Bouldering',
    tags: ['Bouldering', 'Dynamika i koordynacja', 'Mobilność'],
    experienceYears: 7,
    maxGrade: '7B+ FB',
    bio: 'Była zawodniczka Pucharu Polski w boulderingu i routesetterka CW Spider. Uczy dynamicznych ruchów, precyzyjnej pracy nóg na tarciu oraz bezpiecznego lądowania na materacu.',
    photo:
      'https://images.unsplash.com/photo-1564769662533-4f00a87b4056?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'piotr-wisniewski',
    name: 'Piotr Wiśniewski',
    specialization: 'Praca z dziećmi',
    tags: ['Praca z dziećmi', 'Pierwsze kroki', 'Wspinaczka rodzinna'],
    experienceYears: 6,
    maxGrade: 'VI.4+ RP',
    bio: 'Pedagog sportowy i instruktor rekreacji ruchowej. Prowadzi zajęcia wprowadzające dla dzieci, młodzieży oraz osób stawiających pierwsze kroki na ściance bez stresu i lęku wysokości.',
    photo:
      'https://images.unsplash.com/photo-1516592673884-4a382d1124c2?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'karolina-zielinska',
    name: 'Karolina Zielińska',
    specialization: 'Wspinaczka sportowa',
    tags: ['Wspinaczka sportowa', 'Technika ruchu', 'Kursy asekuracji'],
    experienceYears: 8,
    maxGrade: 'VI.5 RP',
    bio: 'Specjalistka od ekonomii ruchu, skręcania biodra i płynnego czytania sekwencji z dołu. Przygotowuje wspinaczy do samodzielnej asekuracji oraz pierwszych wyjazdów w skały Jury i Sokolików.',
    photo:
      'https://images.unsplash.com/photo-1601224748193-d24f166b5c77?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'michal-lewandowski',
    name: 'Michał Lewandowski',
    specialization: 'Bouldering',
    tags: ['Bouldering', 'Siła palców (Campus / Chwytotablica)', 'Prewencja kontuzji'],
    experienceYears: 10,
    maxGrade: '7C FB',
    bio: 'Trener przygotowania motorycznego wspinaczy i fizjoterapeuta sportowy. Pomaga przełamać plateau wycenowe dzięki planowaniu mikrocykli siłowych i profilaktyce urazów troczków.',
    photo:
      'https://images.unsplash.com/photo-1507034589631-9433cc6bc453?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'anna-kaczmarek',
    name: 'Anna Kaczmarek',
    specialization: 'Praca z dziećmi',
    tags: ['Praca z dziećmi', 'Sekcje młodzieżowe', 'Bouldering'],
    experienceYears: 5,
    maxGrade: 'VI.3+ RP',
    bio: 'Trenerka sekcji dziecięcych i młodzieżowych CW Spider. Łączy gry wspinaczkowe z nauką prawidłowych nawyków technicznych, koordynacji oraz współpracy w zespole asekuracyjnym.',
    photo:
      'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=800&q=80',
  },
];

const FALLBACK_PHOTO =
  'https://images.unsplash.com/photo-1522163182402-834f871fd851?auto=format&fit=crop&w=800&q=80';

function InstructorAvatar({ src, name }) {
  const [imgError, setImgError] = useState(false);
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  if (imgError) {
    return (
      <div className="w-full h-52 bg-gradient-to-br from-slate-800 to-emerald-900 text-white flex items-center justify-center text-3xl font-bold tracking-wider">
        {initials}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={`Instruktor ${name}`}
      loading="lazy"
      onError={() => setImgError(true)}
      className="w-full h-52 object-cover group-hover:scale-[1.02] transition-transform duration-300"
    />
  );
}

export default function InstructorsPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [specFilter, setSpecFilter] = useState('ALL');
  const [slotCountsByInstructor, setSlotCountsByInstructor] = useState({});

  // Pobieramy w tle aktualne wolne terminy, aby pokazać liczbę dostępnych slotów
  // oraz ewentualnych instruktorów dodanych w bazie danych (widok dostępny również dla gości).
  useEffect(() => {
    let active = true;

    const dateTo = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString();
    apiClient
      .get('/api/v1/client/slots', { params: { only_free: true, date_to: dateTo } })
      .then((res) => {
        if (!active || !Array.isArray(res.data)) return;
        const counts = {};
        for (const slot of res.data) {
          if (slot.instructor_name) {
            counts[slot.instructor_name] = (counts[slot.instructor_name] || 0) + 1;
          }
        }
        setSlotCountsByInstructor(counts);
      })
      .catch(() => {
        // Widok publiczny działa niezawodnie również w przypadku braku połączenia
      });

    return () => {
      active = false;
    };
  }, []);

  const allInstructors = useMemo(() => {
    const knownNames = new Set(BASE_INSTRUCTORS.map((i) => i.name.toLowerCase()));
    const dynamicInstructors = Object.keys(slotCountsByInstructor)
      .filter((name) => !knownNames.has(name.toLowerCase()))
      .map((name, idx) => ({
        id: `db-instructor-${idx}-${name}`,
        name,
        specialization: 'Wspinaczka sportowa',
        tags: ['Treningi personalne 1h', 'Małe grupy 1.5h', 'CW Spider Bydgoszcz'],
        experienceYears: 6,
        maxGrade: 'VI.4 RP',
        bio: 'Certyfikowany instruktor kadry Centrum Wspinaczkowego Spider w Bydgoszczy. Prowadzi treningi indywidualne oraz zajęcia w małych grupach dostosowane do poziomu uczestnika.',
        photo: FALLBACK_PHOTO,
      }));

    return [...dynamicInstructors, ...BASE_INSTRUCTORS];
  }, [slotCountsByInstructor]);

  const filteredInstructors = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allInstructors.filter((inst) => {
      const matchesSpec =
        specFilter === 'ALL' ||
        inst.specialization === specFilter ||
        inst.tags.some((t) => t.toLowerCase() === specFilter.toLowerCase());
      const matchesQuery =
        !q ||
        inst.name.toLowerCase().includes(q) ||
        inst.specialization.toLowerCase().includes(q) ||
        inst.tags.some((t) => t.toLowerCase().includes(q));
      return matchesSpec && matchesQuery;
    });
  }, [allInstructors, searchQuery, specFilter]);

  const handleViewSlots = (instructorName) => {
    navigate(`/app/client?instructor=${encodeURIComponent(instructorName)}`);
  };

  return (
    <div className="space-y-6">
      {/* Nagłówek podstrony */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900">
          Instruktorzy
        </h1>
      </div>

      <div className={`${CARD_CLASS} p-5 sm:p-6`}>
        {/* Pasek wyszukiwania i filtrowania specjalizacji */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <label htmlFor="instr-search" className="block text-sm font-medium text-slate-700 mb-1.5">
              Szukaj instruktora lub umiejętności
            </label>
            <div className="relative">
              <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="instr-search"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="np. Kowalski, bouldering, asekuracja..."
                className={`${INPUT_CLASS} pl-11`}
              />
            </div>
          </div>

          <div>
            <label htmlFor="instr-spec" className="block text-sm font-medium text-slate-700 mb-1.5">
              Specjalizacja
            </label>
            <select
              id="instr-spec"
              value={specFilter}
              onChange={(e) => setSpecFilter(e.target.value)}
              className={SELECT_CLASS}
            >
              <option value="ALL">Wszystkie specjalizacje</option>
              <option value="Wspinaczka sportowa">Wspinaczka sportowa</option>
              <option value="Bouldering">Bouldering</option>
              <option value="Praca z dziećmi">Praca z dziećmi</option>
            </select>
          </div>
        </div>
      </div>

      {/* Siatka kart instruktorów: 1 kolumna mobile, 3 kolumny desktop */}
      {filteredInstructors.length === 0 ? (
        <div className={`${CARD_CLASS} p-10 text-center space-y-3`}>
          <p className="text-lg font-semibold text-slate-800">
            Brak instruktorów spełniających wybrane kryteria
          </p>
          <p className="text-base text-slate-500">
            Zmień frazę wyszukiwania lub wybierz „Wszystkie specjalizacje”.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {filteredInstructors.map((inst) => {
            const freeSlotsCount = slotCountsByInstructor[inst.name] || 0;

            return (
              <article
                key={inst.id}
                className={`${CARD_CLASS} overflow-hidden flex flex-col group hover:shadow-md transition-shadow`}
              >
                <div className="relative overflow-hidden bg-slate-200">
                  <InstructorAvatar src={inst.photo} name={inst.name} />
                  <div className="absolute top-3 left-3">
                    <span className="inline-block bg-slate-900/85 backdrop-blur-sm text-white text-xs font-semibold px-3 py-1 rounded-full">
                      {inst.specialization}
                    </span>
                  </div>
                  {freeSlotsCount > 0 && (
                    <div className="absolute top-3 right-3">
                      <span className="inline-block bg-emerald-600 text-white text-xs font-semibold px-2.5 py-1 rounded-full shadow-sm">
                        Wolne terminy: {freeSlotsCount}
                      </span>
                    </div>
                  )}
                </div>

                <div className="p-5 sm:p-6 flex-1 flex flex-col justify-between space-y-5">
                  <div className="space-y-3">
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">{inst.name}</h2>
                      <div className="flex items-center gap-3 text-sm text-slate-500 mt-1">
                        <span className="inline-flex items-center gap-1">
                          <Award className="w-4 h-4 text-emerald-600" />
                          Staż: {inst.experienceYears} lat
                        </span>
                        <span>&bull;</span>
                        <span className="font-mono font-semibold text-slate-700">
                          Poziom: {inst.maxGrade}
                        </span>
                      </div>
                    </div>

                    <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
                      {inst.bio}
                    </p>

                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {inst.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200 px-2.5 py-1 rounded-md"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleViewSlots(inst.name)}
                    className={`${BTN_PRIMARY} w-full`}
                  >
                    <Calendar className="w-4 h-4" />
                    <span>Zobacz wolne terminy</span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

