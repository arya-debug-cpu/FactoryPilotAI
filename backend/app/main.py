"""FactoryPilot AI -- FastAPI application entry point.

Run:  uvicorn app.main:app --host 127.0.0.1 --port 8000
"""

from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import Base, engine
from .routers import (
    alerts,
    ai,
    dashboard,
    energy,
    machines,
    maintenance,
    orders,
    production,
)
from .seed import seed

app = FastAPI(
    title="FactoryPilot AI API",
    description="Factory operations, predictive maintenance and AI insights.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ALLOW_ORIGINS", "*").split(","),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

API = "/api"
app.include_router(dashboard.router, prefix=API)
app.include_router(machines.router, prefix=API)
app.include_router(production.router, prefix=API)
app.include_router(orders.router, prefix=API)
app.include_router(maintenance.router, prefix=API)
app.include_router(energy.router, prefix=API)
app.include_router(alerts.router, prefix=API)
app.include_router(ai.router, prefix=API)


@app.on_event("startup")
def on_startup() -> None:
    """Create tables and load demonstration data on first run."""
    Base.metadata.create_all(bind=engine)
    if os.getenv("SEED_ON_STARTUP", "true").lower() in ("1", "true", "yes"):
        seed(reset=os.getenv("SEED_RESET", "false").lower() in ("1", "true"))


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "service": "factorypilot-api", "database": "postgresql"}
