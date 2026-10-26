from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

# Engine odpowiada za pulę fizycznych połączeń TCP do bazy
engine = create_engine(
    settings.DATABASE_URL,
    echo=True  # echo=True loguje surowe zapytania SQL w konsoli – nieocenione podczas nauki
)

# SessionLocal będzie tworzyć izolowane transakcje dla każdego żądania
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)