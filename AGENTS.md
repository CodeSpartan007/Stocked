# Agent Instructions & Reference: Stocked Project

This document serves as the primary reference and rulebook for AI coding agents working on the Stocked repository.

---

## 1. Database Safety & Mandatory Backup Policy (CRITICAL)

> [!CAUTION]
> **MANDATORY BACKUP POLICY:**
> A backup of the current database data **MUST** be made in the `dbBackups/` directory **before any and all destructive database changes**.

Destructive operations include, but are not limited to:
- Running migration undo or rollback operations (`npm run migrate:undo`).
- Applying schema migrations that drop or alter existing columns, tables, or constraints.
- Executing table rebuilds, table truncations, or cascading record deletions.
- Resetting or modifying seed scripts that could overwrite existing user data, portfolio records, or settings.

### How to Execute a Database Backup
Before performing any destructive operation, execute:
```bash
# From the project root:
node scripts/backup_db.js

# Or from the backend directory:
npm run db:backup
```

Verify that the backup completes cleanly and generates:
- `dbBackups/database_backup_<timestamp>.sqlite` (atomic standalone SQLite snapshot via `VACUUM INTO` with WAL journal flushed)
- `dbBackups/database_dump_<timestamp>.json` (structured JSON export of all tables and rows)
- `dbBackups/database_latest.sqlite` / `dbBackups/database_latest.json`
- An updated entry in `dbBackups/backup_manifest.json`

---

## 2. Core Architecture & Tech Stack
- **Frontend:** Next.js (App Router), TypeScript, Tailwind CSS, Lucide React, Recharts.
- **Backend:** Node.js, Express, TypeScript, Sequelize ORM with SQLite (`PRAGMA journal_mode=WAL;`).
- **Security:** AES-256-GCM authenticated encryption for stored API keys; rate limiting on authentication and market data endpoints; JWT cookies with secure flags.
- **Financial Calculations:** Chronological FIFO and Average Cost Basis accounting with strict short-selling prevention across transaction history.

---

## 3. Database Rules & Migrations
- **Multi-Tenancy:** Every database query and mutation MUST be scoped to the authenticated user's ID (`userId`) to isolate portfolio data.
- **Umzug Migrations:** All database schema changes MUST be implemented as Umzug migrations in `backend/src/migrations/`.
- **Bidirectional Migrations:** Ensure migrations provide both `up` and `down` methods.
- **WAL Journaling:** SQLite operates in WAL mode. Any backup must checkpoint the WAL (`PRAGMA wal_checkpoint(TRUNCATE);`) and snapshot using `VACUUM INTO`.

---

## 4. Code Standards & Verification
- Always run `npm test` in `backend/` to verify tests pass after making backend changes.
- Always verify TypeScript compilation (`npm run build` in both `backend/` and `frontend/`).
- Do NOT commit SQLite binary files (`*.sqlite`, `*.sqlite-wal`, `*.sqlite-shm`) or `.env` credential files to version control.
