#!/usr/bin/env bash
# Restore-test a Regent database backup into a throwaway local Postgres (Docker).
# It never touches Supabase.
#
#   bash scripts/db/restore-test.sh <backup.dump.age> <age-private-key-file>
#
# Needs: docker, age (https://github.com/FiloSottile/age). Prints row counts at the end.

set -euo pipefail

BACKUP="${1:-}"
KEY="${2:-}"
if [ -z "$BACKUP" ] || [ -z "$KEY" ]; then
  echo "Usage: bash scripts/db/restore-test.sh <backup.dump.age> <age-private-key-file>" >&2
  exit 1
fi
[ -f "$BACKUP" ] || { echo "Backup not found: $BACKUP" >&2; exit 1; }
[ -f "$KEY" ] || { echo "Key file not found: $KEY" >&2; exit 1; }
command -v docker >/dev/null || { echo "Docker is required" >&2; exit 1; }
command -v age >/dev/null || { echo "age is required (winget install FiloSottile.age)" >&2; exit 1; }

CONTAINER="regent-restore-test"
WORK="$(mktemp -d)"
DUMP="$WORK/backup.dump"
cleanup() {
  rm -rf "$WORK"
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "1/4 Decrypting backup…"
age --decrypt --identity "$KEY" --output "$DUMP" "$BACKUP"

echo "2/4 Starting a temporary Postgres 17…"
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=restoretest postgres:17 >/dev/null
for _ in $(seq 1 30); do
  docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done

echo "3/4 Restoring…"
docker cp "$DUMP" "$CONTAINER:/tmp/backup.dump"
# Supabase-only roles and extensions don't exist locally; those warnings are expected.
docker exec "$CONTAINER" pg_restore -U postgres -d postgres --no-owner --no-privileges /tmp/backup.dump || \
  echo "(pg_restore reported warnings above; check the counts below)"

echo "4/4 Row counts:"
docker exec "$CONTAINER" psql -U postgres -d postgres -At -c "
  SELECT schemaname || '.' || relname || ': ' || n_live_tup
  FROM pg_stat_user_tables
  WHERE schemaname IN ('core','finance','wealth')
  ORDER BY schemaname, relname;" || true
docker exec "$CONTAINER" psql -U postgres -d postgres -c "ANALYZE;" >/dev/null
docker exec "$CONTAINER" psql -U postgres -d postgres -At -c "
  SELECT 'users: ' || (SELECT count(*) FROM core.users)
  UNION ALL SELECT 'transactions: ' || (SELECT count(*) FROM finance.transactions)
  UNION ALL SELECT 'income records: ' || (SELECT count(*) FROM finance.income_records);"

echo "Restore test finished. The temporary database is removed now."
