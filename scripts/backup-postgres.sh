#!/usr/bin/env bash
set -euo pipefail

# =====================================================================
# FinX TestCase Hub — PostgreSQL + Uploads Backup Script
# Usage: ./scripts/backup-postgres.sh [backup_dir]
# =====================================================================

BACKUP_DIR="${1:-./backups}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
PG_CONTAINER="${PG_CONTAINER:-tcms-postgres-prod}"
API_CONTAINER="${API_CONTAINER:-tcms-api-prod}"
POSTGRES_USER="${POSTGRES_USER:-tcms}"
POSTGRES_DB="${POSTGRES_DB:-tcms_db}"

mkdir -p "$BACKUP_DIR"

SQL_OUT="$BACKUP_DIR/tcms_db_${TIMESTAMP}.sql.gz"
UPLOADS_OUT="$BACKUP_DIR/tcms_uploads_${TIMESTAMP}.tar.gz"

echo "[1/2] Dumping PostgreSQL database '$POSTGRES_DB' from container '$PG_CONTAINER'..."
docker exec "$PG_CONTAINER" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl \
  | gzip > "$SQL_OUT"

echo "[2/2] Archiving attachments/evidence uploads from container '$API_CONTAINER'..."
docker exec "$API_CONTAINER" tar -czf - -C /app/apps/api uploads > "$UPLOADS_OUT"

# Keep last 14 backups by default (POSIX/macOS/Linux compatible)
ls -1t "$BACKUP_DIR"/tcms_db_*.sql.gz 2>/dev/null | tail -n +15 | while IFS= read -r f; do rm -f "$f"; done
ls -1t "$BACKUP_DIR"/tcms_uploads_*.tar.gz 2>/dev/null | tail -n +15 | while IFS= read -r f; do rm -f "$f"; done

echo "Backup completed:"
echo "  - DB:      $SQL_OUT"
echo "  - Uploads: $UPLOADS_OUT"
