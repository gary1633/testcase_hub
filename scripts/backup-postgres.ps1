<#
.SYNOPSIS
  FinX TestCase Hub — Windows PowerShell Backup Script (PostgreSQL + Uploads)
.EXAMPLE
  .\scripts\backup-postgres.ps1
  .\scripts\backup-postgres.ps1 -BackupDir "D:\Backups\TCMS"
#>
param(
  [string]$BackupDir = ".\backups",
  [string]$PgContainer = "tcms-postgres-prod",
  [string]$ApiContainer = "tcms-api-prod",
  [string]$PostgresUser = "tcms",
  [string]$PostgresDb = "tcms_db",
  [int]$KeepLatest = 14
)

$ErrorActionPreference = "Stop"

New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"

$sqlFile = Join-Path $BackupDir "tcms_db_$timestamp.sql.gz"
$uploadsFile = Join-Path $BackupDir "tcms_uploads_$timestamp.tar.gz"

Write-Host "[1/2] Backing up PostgreSQL '$PostgresDb' from '$PgContainer'..." -ForegroundColor Cyan
cmd /c "docker exec $PgContainer sh -c `"pg_dump -U $PostgresUser -d $PostgresDb --no-owner --no-acl | gzip`" > `"$sqlFile`""
if ($LASTEXITCODE -ne 0) { throw "PostgreSQL backup failed with exit code $LASTEXITCODE" }

Write-Host "[2/2] Backing up uploads folder from '$ApiContainer'..." -ForegroundColor Cyan
cmd /c "docker exec $ApiContainer tar -czf - -C /app/apps/api uploads > `"$uploadsFile`""
if ($LASTEXITCODE -ne 0) { throw "Uploads backup failed with exit code $LASTEXITCODE" }

# Rotate old backups
Get-ChildItem -Path $BackupDir -Filter "tcms_db_*.sql.gz" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -Skip $KeepLatest |
  Remove-Item -Force -ErrorAction SilentlyContinue

Get-ChildItem -Path $BackupDir -Filter "tcms_uploads_*.tar.gz" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -Skip $KeepLatest |
  Remove-Item -Force -ErrorAction SilentlyContinue

Write-Host "Backup completed successfully:" -ForegroundColor Green
Write-Host "  - DB:      $sqlFile"
Write-Host "  - Uploads: $uploadsFile"
