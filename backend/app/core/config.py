from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "smartb-backend"
    env: str = "dev"
    secret_key: str = "change_me"
    access_token_expire_minutes: int = 60
    algorithm: str = "HS256"
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/smartb"
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @field_validator("database_url", mode="before")
    @classmethod
    def normalize_database_url(cls, value: str) -> str:
        if not isinstance(value, str):
            return value
        # Railway and many providers expose postgres:// or postgresql:// URLs.
        # Force SQLAlchemy to use psycopg v3 driver explicitly.
        if value.startswith("postgres://"):
            return "postgresql+psycopg://" + value[len("postgres://") :]
        if value.startswith("postgresql://") and not value.startswith("postgresql+"):
            return "postgresql+psycopg://" + value[len("postgresql://") :]
        return value


settings = Settings()
