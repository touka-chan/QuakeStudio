#!/usr/bin/env sh
set -eu

: "${PORT:=8000}"
: "${QUAKESTUDIO_ADMIN_EMAIL:=admin@quakestudio.local}"
: "${QUAKESTUDIO_ADMIN_DISPLAY_NAME:=Administrator}"

if [ -z "${QUAKESTUDIO_ADMIN_PASSWORD:-}" ]; then
  echo "error: QUAKESTUDIO_ADMIN_PASSWORD is required for the first boot." >&2
  exit 1
fi

python -m alembic upgrade head
python -m app.seed --if-missing \
  --email "$QUAKESTUDIO_ADMIN_EMAIL" \
  --display-name "$QUAKESTUDIO_ADMIN_DISPLAY_NAME"

exec python -m uvicorn app.main:app --host 0.0.0.0 --port "$PORT"
