#!/usr/bin/env bash
# Apply root legacy Marketplace SQL migrations only to the dedicated legacy DB.
# Usage: LEGACY_MARKETPLACE_DATABASE_URL=postgres://... ./scripts/run_migrations.sh

set -euo pipefail
DB_URL=${LEGACY_MARKETPLACE_DATABASE_URL:-}
if [ -z "$DB_URL" ]; then
  echo "LEGACY_MARKETPLACE_DATABASE_URL is required"
  exit 1
fi

for f in migrations/*.sql; do
  if [ -f "$f" ]; then
    echo "Applying $f"
    psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$f"
  fi
done

echo "Legacy Marketplace migrations applied."
