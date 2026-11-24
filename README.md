# CW Spider – System Rezerwacji Treningów Wspinaczkowych

Aplikacja webowa realizowana w ramach pracy inżynierskiej, służąca do rezerwacji treningów wspinaczkowych online w Centrum Wspinaczkowym Spider w Bydgoszczy.

Umożliwia klientom przeglądanie wolnych terminów (trening indywidualny 1h lub grupowy 1,5h do 3 osób), zarządzanie własnymi rezerwacjami (z zasadą odwołania do 12h przed zajęciami), prowadzenie profilu oraz podgląd dziennika postępów. Instruktorzy mogą zarządzać swoim grafikiem dyżurów, weryfikować poziom zaawansowania podopiecznych, dodawać prywatne notatki trenerskie oraz zapisywać trudności pokonanych dróg wraz ze wskazówkami. Logowanie i kontrolę dostępu (`ROLE_CLIENT`, `ROLE_INSTRUCTOR`) obsługuje Keycloak, a backend REST (Flask + PostgreSQL) wysyła powiadomienia w aplikacji oraz potwierdzenia e-mail z plikiem kalendarza `.ics`.

## Uruchomienie (Docker Compose)

```bash
cp .env.example .env
docker compose up -d --build
```

- Frontend: `http://localhost:5173`
- Backend API / Swagger: `http://localhost:5001/docs`
- Keycloak: `http://localhost:8080`
