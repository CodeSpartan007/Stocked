/**
 * Stocked Database Backup Utility
 * 
 * Safely creates an atomic, WAL-checkpointed backup of the Stocked SQLite database.
 * Generates:
 * 1. An atomic standalone SQLite file via VACUUM INTO (all WAL changes merged).
 * 2. A structured JSON dump of all tables and rows for auditing & portability.
 * 3. Latest pointers (database_latest.sqlite, database_latest.json).
 * 4. A manifest with timestamps, table row counts, and SHA256 checksums.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Resolve paths
const PROJECT_ROOT = path.resolve(__dirname, '..');
const BACKEND_DIR = path.join(PROJECT_ROOT, 'backend');
const DB_PATH = path.join(BACKEND_DIR, 'database.sqlite');
const BACKUP_DIR = path.join(PROJECT_ROOT, 'dbBackups');

// Resolve sqlite3 module from backend/node_modules
let sqlite3;
try {
  sqlite3 = require(path.join(BACKEND_DIR, 'node_modules', 'sqlite3'));
} catch {
  sqlite3 = require('sqlite3');
}

function getTimestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const year = now.getFullYear();
  const month = pad(now.getMonth() + 1);
  const day = pad(now.getDate());
  const hours = pad(now.getHours());
  const minutes = pad(now.getMinutes());
  const seconds = pad(now.getSeconds());
  return `${year}${month}${day}_${hours}${minutes}${seconds}`;
}

function computeSha256(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

async function runBackup() {
  console.log('📦 [Stocked DB Backup] Starting database backup...');

  if (!fs.existsSync(DB_PATH)) {
    console.error(`❌ [Stocked DB Backup] Source database not found at ${DB_PATH}`);
    process.exit(1);
  }

  // Ensure backup directory exists
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    console.log(`📁 Created backup directory: ${BACKUP_DIR}`);
  }

  const timestamp = getTimestamp();
  const backupSqliteName = `database_backup_${timestamp}.sqlite`;
  const backupJsonName = `database_dump_${timestamp}.json`;
  const backupSqlitePath = path.join(BACKUP_DIR, backupSqliteName);
  const backupJsonPath = path.join(BACKUP_DIR, backupJsonName);
  const latestSqlitePath = path.join(BACKUP_DIR, 'database_latest.sqlite');
  const latestJsonPath = path.join(BACKUP_DIR, 'database_latest.json');
  const manifestPath = path.join(BACKUP_DIR, 'backup_manifest.json');

  const db = new sqlite3.Database(DB_PATH);

  try {
    // 1. Checkpoint SQLite WAL journal to flush all pending writes
    await new Promise((resolve, reject) => {
      db.all('PRAGMA wal_checkpoint(TRUNCATE);', (err, rows) => {
        if (err) return reject(err);
        console.log('🔄 WAL Checkpoint completed successfully:', rows);
        resolve(rows);
      });
    });

    // 2. Perform atomic VACUUM INTO to create standalone clean SQLite backup
    await new Promise((resolve, reject) => {
      // Escape path for SQLite string literal
      const escapedPath = backupSqlitePath.replace(/'/g, "''");
      db.run(`VACUUM INTO '${escapedPath}';`, (err) => {
        if (err) return reject(err);
        console.log(`💾 Atomic SQLite backup generated: ${backupSqliteName}`);
        resolve();
      });
    });

    // 3. Query all user tables and export structured JSON dump
    const tables = await new Promise((resolve, reject) => {
      db.all(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';",
        (err, rows) => {
          if (err) return reject(err);
          resolve(rows.map((r) => r.name));
        }
      );
    });

    const dumpData = {
      meta: {
        exportedAt: new Date().toISOString(),
        sourceDatabase: 'database.sqlite',
        schemaVersion: 'Sequelize',
      },
      tables: {},
    };

    const tableCounts = {};

    for (const table of tables) {
      const rows = await new Promise((resolve, reject) => {
        db.all(`SELECT * FROM \`${table}\`;`, (err, data) => {
          if (err) return reject(err);
          resolve(data);
        });
      });
      dumpData.tables[table] = rows;
      tableCounts[table] = rows.length;
    }

    // Write JSON dump
    fs.writeFileSync(backupJsonPath, JSON.stringify(dumpData, null, 2), 'utf-8');
    console.log(`📄 JSON export dump generated: ${backupJsonName}`);

    // 4. Update latest pointers (copies)
    fs.copyFileSync(backupSqlitePath, latestSqlitePath);
    fs.copyFileSync(backupJsonPath, latestJsonPath);

    // 5. Update Manifest
    const sqliteStats = fs.statSync(backupSqlitePath);
    const jsonStats = fs.statSync(backupJsonPath);
    const sqliteSha256 = computeSha256(backupSqlitePath);
    const jsonSha256 = computeSha256(backupJsonPath);

    let history = [];
    if (fs.existsSync(manifestPath)) {
      try {
        const prevManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        if (Array.isArray(prevManifest.history)) {
          history = prevManifest.history;
        }
      } catch {
        history = [];
      }
    }

    const currentEntry = {
      timestamp,
      createdAt: new Date().toISOString(),
      sqliteFile: backupSqliteName,
      sqliteSizeBytes: sqliteStats.size,
      sqliteSha256,
      jsonFile: backupJsonName,
      jsonSizeBytes: jsonStats.size,
      jsonSha256,
      tableCounts,
    };

    history.unshift(currentEntry);
    // Keep last 50 backup records in manifest
    if (history.length > 50) history = history.slice(0, 50);

    const manifestData = {
      latestBackup: currentEntry,
      history,
    };

    fs.writeFileSync(manifestPath, JSON.stringify(manifestData, null, 2), 'utf-8');
    console.log(`📋 Backup manifest updated at ${manifestPath}`);

    console.log('\n==================================================');
    console.log('✅ [Stocked DB Backup] Backup completed successfully!');
    console.log(`   Destination: ${BACKUP_DIR}`);
    console.log(`   SQLite File: ${backupSqliteName} (${(sqliteStats.size / 1024).toFixed(1)} KB)`);
    console.log(`   JSON Dump:   ${backupJsonName} (${(jsonStats.size / 1024).toFixed(1)} KB)`);
    console.log('   Table Records:');
    for (const [t, count] of Object.entries(tableCounts)) {
      console.log(`     - ${t.padEnd(20)}: ${count} rows`);
    }
    console.log('==================================================\n');
  } catch (error) {
    console.error('❌ [Stocked DB Backup] Backup failed:', error);
    process.exitCode = 1;
  } finally {
    db.close();
  }
}

if (require.main === module) {
  runBackup();
}

module.exports = { runBackup };
