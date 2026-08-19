#!/usr/bin/env bash
# Apply SQL migration files in migrations/ to the provided DATABASE_URL
# Usage: ./scripts/run_migrations.sh <DATABASE_URL>

set -euo pipefail
DB_URL=${1:-${DATABASE_URL:-}}
if [ -z "$DB_URL" ]; then
  echo "Usage: $0 <DATABASE_URL> or set DATABASE_URL env var"
  exit 1
fi

for f in migrations/*.sql; do
  if [ -f "$f" ]; then
    echo "Applying $f"
    psql "$DB_URL" -f "$f"
  fi
done

echo "Migrations applied."

