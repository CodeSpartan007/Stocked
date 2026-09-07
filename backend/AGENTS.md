# Backend Agent Guidelines

For full repository rules, tech stack specifications, and development standards, see the root [AGENTS.md](../AGENTS.md).

## Database Safety & Backup Policy (CRITICAL)

> [!CAUTION]
> **MANDATORY BACKUP BEFORE DESTRUCTIVE CHANGES:**
> Before running any destructive database operation (such as `npm run migrate:undo`, dropping columns or tables, altering indexes or unique constraints, table truncations, or re-seeding operations), you **MUST** create a backup of the current database.

### Command to Create Backup
```bash
# From backend directory:
npm run db:backup

# Or from project root:
node scripts/backup_db.js
```

All backups are stored in `../dbBackups/` with timestamped atomic SQLite snapshots and structured JSON dumps.
