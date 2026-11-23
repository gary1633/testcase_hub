#!/usr/bin/env bash
set -euo pipefail

# =====================================================================
# FinX TestCase Hub — PostgreSQL Restore Script
# Usage: ./scripts/restore-postgres.sh <path/to/tcms_db_YYYYMMDD.sql.gz> [path/to/tcms_uploads_YYYYMMDD.tar.gz]
# =====================================================================

if [ $# -lt 1 ]; then
  echo "Usage: $0 <db_backup.sql.gz> [uploads_backup.tar.gz]"
  exit 1
fi

SQL_FILE="$1"
UPLOADS_FILE="${2:-}"
PG_CONTAINER="${PG_CONTAINER:-tcms-postgres-prod}"
API_CONTAINER="${API_CONTAINER:-tcms-api-prod}"
POSTGRES_USER="${POSTGRES_USER:-tcms}"
POSTGRES_DB="${POSTGRES_DB:-tcms_db}"

echo "WARNING: Restoring '$SQL_FILE' will overwrite current data in '$POSTGRES_DB'."
read -r -p "Continue? [y/N] " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 1
fi

echo "[1/2] Restoring PostgreSQL database..."
gunzip -c "$SQL_FILE" | docker exec -i "$PG_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"

if [ -n "$UPLOADS_FILE" ] && [ -f "$UPLOADS_FILE" ]; then
  echo "[2/2] Restoring uploads folder..."
  cat "$UPLOADS_FILE" | docker exec -i "$API_CONTAINER" tar -xzf - -C /app/apps/api
fi

echo "Restore completed. Restarting API service..."
docker restart "$API_CONTAINER"
