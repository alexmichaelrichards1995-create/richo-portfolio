#!/usr/bin/env bash
# Apply SQL migration files in migrations/ to the provided DATABASE_URL.
# Usage: ./scripts/run_migrations.sh <DATABASE_URL>

set -euo pipefail

DB_URL=${1:-${DATABASE_URL:-}}
if [[ -z "$DB_URL" ]]; then
  echo "Usage: $0 <DATABASE_URL> or set DATABASE_URL env var" >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required but was not found in PATH" >&2
  exit 127
fi

shopt -s nullglob
migrations=(migrations/*.sql)
if (( ${#migrations[@]} == 0 )); then
  echo "No SQL migrations found in migrations/." >&2
  exit 1
fi

for f in "${migrations[@]}"; do
  echo "Applying $f"
  psql -v ON_ERROR_STOP=1 "$DB_URL" -f "$f"
done

echo "Migrations applied successfully."
