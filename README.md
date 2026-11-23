# CW Spider – System Rezerwacji Treningów Wspinaczkowych

Webowa aplikacja do zarządzania rezerwacjami treningów wspinaczkowych, grafikami instruktorów oraz dziennikiem postępów (**„Moja Cyfra”**) dla Centrum Wspinaczkowego Spider w Bydgoszczy *(praca inżynierska)*.

---

## Kluczowe funkcje i reguły biznesowe

- **Ochrona przed double-booking:** zapisy na zajęcia z blokadą wiersza `SELECT ... FOR UPDATE`.
- **Limity miejsc:** trening indywidualny 1h (`1` osoba) oraz grupowa lekcja 1,5h (max `3` osoby).
- **Reguła anulowania 12h:** odwołanie rezerwacji możliwe wyłącznie przy `now() + 12h <= start_time`.
- **Moduł „Moja Cyfra”:** rejestracja wycen dróg (skala francuska, np. `6a`, `6b+`) i wskazówek instruktora.
- **Powiadomienia i kalendarz:** asynchroniczna wysyłka e-maili przez SendGrid API z załącznikiem `.ics` (iCalendar) oraz powiadomienia w aplikacji.
- **SSO & RBAC:** logowanie przez Keycloak (PKCE `S256`) z rolami `ROLE_CLIENT`, `ROLE_INSTRUCTOR`, `ROLE_ADMIN`.

---

## Stack technologiczny

| Warstwa | Technologie |
|---|---|
| **Backend** | Python 3.12, Flask, `flask-smorest` (OpenAPI 3 / Swagger), Marshmallow, Gunicorn |
| **Baza i ORM** | PostgreSQL 16, SQLAlchemy 2.x, Alembic |
| **IAM** | Keycloak 24.0 (JWT RS256 / JWKS) |
| **Frontend** | React 19, Vite, Tailwind CSS, Axios, `keycloak-js`, Nginx |
| **Integracje i infra** | SendGrid, `icalendar`, Docker & Docker Compose |

---

## Struktura projektu

- `backend/` – API REST (Flask), modele SQLAlchemy, migracje Alembic, serwisy domenowe, testy (`tests/`).
- `frontend/` – aplikacja SPA (React + Vite) serwowana produkcyjnie przez Nginx.
- `docker/` – konfiguracja startowa bazy PostgreSQL oraz eksport realmu `spider-climbing` dla Keycloaka.

---

## Uruchomienie (Docker Compose)

Wymagane wolne porty: `5173`, `5001`, `8080`, `5433`.

1. Utwórz plik `.env` na podstawie szablonu (zawiera m.in. domyślne dane deweloperskie do Keycloaka i bazy):
   ```bash
   cp .env.example .env
   ```
2. Zbuduj i uruchom cały stos (migracje `alembic upgrade head` wykonują się automatycznie):
   ```bash
   docker compose up -d --build
   ```

| Usługa | Adres |
|---|---|
| **Frontend** | http://localhost:5173 |
| **Backend API / Health** | http://localhost:5001/health |
| **Swagger UI (OpenAPI)** | http://localhost:5001/docs |
| **Keycloak** | http://localhost:8080 |

> **Konta testowe:** Eksport realmu `spider-climbing` nie zawiera użytkowników – po uruchomieniu utwórz konta z rolami `ROLE_CLIENT`, `ROLE_INSTRUCTOR`, `ROLE_ADMIN` w panelu Keycloaka.

---

## Testy (backend)

```powershell
cd backend
.\venv\Scripts\python.exe -m unittest discover -s tests
```
