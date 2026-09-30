#!/usr/bin/env bash
# Starts the FactoryPilot FastAPI backend (PostgreSQL-backed).
# Installs missing Python dependencies on first run so the API is always
# available when the platform boots the preview.
set -e
cd "$(dirname "$0")"

if ! python3 -c "import fastapi, uvicorn, sqlalchemy, psycopg2, dotenv" >/dev/null 2>&1; then
  echo "[backend] installing python dependencies..."
  pip3 install --break-system-packages -q -r requirements.txt
fi

exec python3 -m uvicorn app.main:app \
  --host "${HOST:-127.0.0.1}" \
  --port "${PORT:-8000}" \
  --log-level "${LOG_LEVEL:-info}"
