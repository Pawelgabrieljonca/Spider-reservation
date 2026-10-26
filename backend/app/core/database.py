from sqlalchemy import create_engine
from sqlalchemy.orm import scoped_session, sessionmaker

from app.core.config import settings

# Engine odpowiada za pulę fizycznych połączeń TCP do bazy
engine = create_engine(
    settings.DATABASE_URL,
    echo=settings.SQL_ECHO,  # SQL_ECHO=true w .env loguje surowe zapytania SQL w konsoli
    pool_pre_ping=True,      # wykrywa zerwane połączenia (np. po restarcie kontenera)
)

# SessionLocal będzie tworzyć izolowane transakcje dla każdego żądania
SessionLocal = sessionmaker(autocommit=False, autoflush=False, expire_on_commit=False, bind=engine)

# Sesja powiązana z bieżącym wątkiem obsługującym żądanie HTTP.
# Zamykana w teardown_appcontext (app/main.py) – jedna sesja = jedno żądanie.
db_session = scoped_session(SessionLocal)