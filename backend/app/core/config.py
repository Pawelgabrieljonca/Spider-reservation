import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    DB_USER: str = os.getenv("POSTGRES_USER", "spider_admin")
    DB_PASSWORD: str = os.getenv("POSTGRES_PASSWORD", "spider_secret_pass")
    DB_HOST: str = os.getenv("POSTGRES_HOST", "localhost")
    DB_PORT: str = os.getenv("POSTGRES_PORT", "5432")
    DB_NAME: str = os.getenv("POSTGRES_DB", "spider_db")

    @property
    def DATABASE_URL(self) -> str:
        return f"postgresql://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"

settings = Settings()