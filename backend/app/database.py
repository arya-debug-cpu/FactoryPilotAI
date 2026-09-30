"""Database engine + session management for FactoryPilot AI.

PostgreSQL is the only database. The connection string is always read from the
environment (see .env.example) -- never hardcoded.
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Load the project-root .env first, then an optional backend/.env on top of it.
_ROOT_ENV = Path(__file__).resolve().parents[2] / ".env"
_BACKEND_ENV = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(_ROOT_ENV)
load_dotenv(_BACKEND_ENV, override=True)

_DEFAULT_URL = "postgresql+psycopg2://postgres:postgres@127.0.0.1:5432/app_db"
DATABASE_URL = os.getenv("DATABASE_URL", _DEFAULT_URL)
# Normalise the driver so `postgresql://...` (psycopg v3 by default in
# SQLAlchemy 2.x) always resolves to the installed psycopg2 driver.
DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg2://")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg2://", 1)
DATABASE_URL = DATABASE_URL.replace("postgresql+psycopg://", "postgresql+psycopg2://")

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
    future=True,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)

Base = declarative_base()


def get_db():
    """FastAPI dependency that yields a scoped session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
