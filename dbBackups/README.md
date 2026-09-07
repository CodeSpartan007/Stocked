# Database Backups (`dbBackups/`)

This directory contains point-in-time database backups created before schema migrations, destructive database operations, or maintenance tasks.

## Mandatory Policy

> **CRITICAL RULE FOR AGENTS & DEVELOPERS:**
> A database backup **MUST** be made before executing any and all destructive database operations (migrations, rollbacks, column drops, table rebuilds, truncate operations, or resets).

## How to Create a Backup

Run the backup utility from the project root or backend:

```bash
# From project root:
node scripts/backup_db.js

# Or from backend directory:
npm run db:backup
```

## Backup Contents

Each backup execution produces:
1. `database_backup_<timestamp>.sqlite`: An atomic, standalone SQLite snapshot generated via `VACUUM INTO` with all WAL pages merged and defragmented.
2. `database_dump_<timestamp>.json`: A complete structured JSON export of all tables and rows for human inspection, auditability, and cross-engine portability.
3. `database_latest.sqlite` / `database_latest.json`: Fast-access copies of the most recent backup.
4. `backup_manifest.json`: An index tracking backup timestamps, file sizes, SHA-256 integrity checksums, and per-table row counts.

## How to Restore from a Backup

1. Stop the running backend server.
2. Copy the desired backup SQLite file over `backend/database.sqlite`:
   ```bash
   cp dbBackups/database_latest.sqlite backend/database.sqlite
   rm -f backend/database.sqlite-wal backend/database.sqlite-shm
   ```
3. Restart the backend server.
