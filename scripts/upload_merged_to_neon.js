/**
 * Synchronize merged local database dataset to Neon Postgres.
 */
const fs = require('fs');
const path = require('path');
const { Client, types } = require(path.join(__dirname, '../backend/node_modules/pg'));
const sqlite3 = require(path.join(__dirname, '../backend/node_modules/sqlite3'));

// Preserve exact DATE strings
types.setTypeParser(1082, (str) => str);

const LOCAL_DB_PATH = path.join(__dirname, '../backend/database.sqlite');
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL environment variable is required.');
  process.exit(1);
}

async function querySqlite(db, sql) {
  return new Promise((resolve, reject) => {
    db.all(sql, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

async function run() {
  console.log('🚀 Starting migration & upload of merged dataset to Neon Postgres...');

  const sqliteDb = new sqlite3.Database(LOCAL_DB_PATH);
  const pgClient = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await pgClient.connect();
    console.log('Connected to Neon Postgres.');

    // 1. Schema Updates on Postgres
    console.log('\n--- Step 1: Aligning Schema on Neon Postgres ---');

    // Add 'nse' to provider enum if missing
    try {
      await pgClient.query(`ALTER TYPE "enum_UserSettings_provider" ADD VALUE IF NOT EXISTS 'nse';`);
      console.log('  + Added nse to enum_UserSettings_provider (or already present)');
    } catch (e) {
      console.log('  = Enum note:', e.message);
    }

    // Add currency column to Stocks
    await pgClient.query(`
      ALTER TABLE "Stocks" 
      ADD COLUMN IF NOT EXISTS "currency" VARCHAR(10) NOT NULL DEFAULT 'USD';
    `);
    console.log('  + Ensured Stocks.currency exists');

    // Add currency column to PerformanceTargets
    await pgClient.query(`
      ALTER TABLE "PerformanceTargets" 
      ADD COLUMN IF NOT EXISTS "currency" VARCHAR(10) NOT NULL DEFAULT 'USD';
    `);
    console.log('  + Ensured PerformanceTargets.currency exists');

    // Add columns to UserSettings
    await pgClient.query(`
      ALTER TABLE "UserSettings" 
      ADD COLUMN IF NOT EXISTS "costBasisMethod" VARCHAR(20) NOT NULL DEFAULT 'average',
      ADD COLUMN IF NOT EXISTS "alphaVantageApiKey" TEXT,
      ADD COLUMN IF NOT EXISTS "polygonApiKey" TEXT,
      ADD COLUMN IF NOT EXISTS "autoSwitchOnRateLimit" BOOLEAN NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS "baseCurrency" VARCHAR(10) NOT NULL DEFAULT 'USD',
      ADD COLUMN IF NOT EXISTS "exchangeRate" DECIMAL(12, 4) NOT NULL DEFAULT 130,
      ADD COLUMN IF NOT EXISTS "customExchangeRate" DECIMAL(12, 4),
      ADD COLUMN IF NOT EXISTS "exchangeRateUpdatedAt" TIMESTAMP WITH TIME ZONE;
    `);
    console.log('  + Ensured UserSettings multi-provider & currency columns exist');

    // Ensure SequelizeMeta exists
    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS "SequelizeMeta" (
        "name" VARCHAR(255) NOT NULL PRIMARY KEY
      );
    `);
    console.log('  + Ensured SequelizeMeta table exists');

    // 2. Fetch all merged data from Local SQLite
    console.log('\n--- Step 2: Reading Merged Data from Local SQLite ---');
    const users = await querySqlite(sqliteDb, 'SELECT * FROM Users');
    const userSettings = await querySqlite(sqliteDb, 'SELECT * FROM UserSettings');
    const stocks = await querySqlite(sqliteDb, 'SELECT * FROM Stocks');
    const purchases = await querySqlite(sqliteDb, 'SELECT * FROM Purchases');
    const sales = await querySqlite(sqliteDb, 'SELECT * FROM Sales');
    const targets = await querySqlite(sqliteDb, 'SELECT * FROM PerformanceTargets');
    const dailyPrices = await querySqlite(sqliteDb, 'SELECT * FROM DailyPrices');
    const exportLogs = await querySqlite(sqliteDb, 'SELECT * FROM ExportLogs');
    const migrations = await querySqlite(sqliteDb, 'SELECT * FROM SequelizeMeta');

    console.log(`  Users: ${users.length}`);
    console.log(`  UserSettings: ${userSettings.length}`);
    console.log(`  Stocks: ${stocks.length}`);
    console.log(`  Purchases: ${purchases.length}`);
    console.log(`  Sales: ${sales.length}`);
    console.log(`  PerformanceTargets: ${targets.length}`);
    console.log(`  DailyPrices: ${dailyPrices.length}`);
    console.log(`  ExportLogs: ${exportLogs.length}`);
    console.log(`  Migrations: ${migrations.length}`);

    // 3. Upload data inside a transaction
    console.log('\n--- Step 3: Synchronizing Data to Neon Postgres (Atomic Transaction) ---');
    await pgClient.query('BEGIN;');

    // Users
    for (const u of users) {
      await pgClient.query(`
        INSERT INTO "Users" ("id", "email", "passwordHash", "role", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT ("id") DO UPDATE SET
          "email" = EXCLUDED."email",
          "passwordHash" = EXCLUDED."passwordHash",
          "role" = EXCLUDED."role",
          "updatedAt" = EXCLUDED."updatedAt";
      `, [u.id, u.email, u.passwordHash, u.role, u.createdAt, u.updatedAt]);
    }
    console.log('  ✓ Synced Users');

    // UserSettings
    for (const s of userSettings) {
      await pgClient.query(`
        INSERT INTO "UserSettings" (
          "userId", "provider", "apiKey", "refreshInterval", "createdAt", "updatedAt",
          "costBasisMethod", "alphaVantageApiKey", "polygonApiKey", "autoSwitchOnRateLimit",
          "baseCurrency", "exchangeRate", "customExchangeRate", "exchangeRateUpdatedAt"
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT ("userId") DO UPDATE SET
          "provider" = EXCLUDED."provider",
          "apiKey" = EXCLUDED."apiKey",
          "refreshInterval" = EXCLUDED."refreshInterval",
          "costBasisMethod" = EXCLUDED."costBasisMethod",
          "alphaVantageApiKey" = EXCLUDED."alphaVantageApiKey",
          "polygonApiKey" = EXCLUDED."polygonApiKey",
          "autoSwitchOnRateLimit" = EXCLUDED."autoSwitchOnRateLimit",
          "baseCurrency" = EXCLUDED."baseCurrency",
          "exchangeRate" = EXCLUDED."exchangeRate",
          "customExchangeRate" = EXCLUDED."customExchangeRate",
          "exchangeRateUpdatedAt" = EXCLUDED."exchangeRateUpdatedAt",
          "updatedAt" = EXCLUDED."updatedAt";
      `, [
        s.userId,
        s.provider,
        s.apiKey,
        s.refreshInterval,
        s.createdAt,
        s.updatedAt,
        s.costBasisMethod || 'average',
        s.alphaVantageApiKey,
        s.polygonApiKey,
        Boolean(s.autoSwitchOnRateLimit),
        s.baseCurrency || 'USD',
        s.exchangeRate || 130.0,
        s.customExchangeRate,
        s.exchangeRateUpdatedAt,
      ]);
    }
    console.log('  ✓ Synced UserSettings');

    // Stocks
    for (const st of stocks) {
      await pgClient.query(`
        INSERT INTO "Stocks" ("id", "userId", "name", "symbol", "description", "category", "currency", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT ("id") DO UPDATE SET
          "name" = EXCLUDED."name",
          "symbol" = EXCLUDED."symbol",
          "description" = EXCLUDED."description",
          "category" = EXCLUDED."category",
          "currency" = EXCLUDED."currency",
          "updatedAt" = EXCLUDED."updatedAt";
      `, [st.id, st.userId, st.name, st.symbol, st.description, st.category, st.currency || 'USD', st.createdAt, st.updatedAt]);
    }
    console.log('  ✓ Synced Stocks');

    // Purchases
    for (const p of purchases) {
      await pgClient.query(`
        INSERT INTO "Purchases" ("id", "userId", "stockId", "quantity", "purchasePrice", "purchaseDate", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT ("id") DO UPDATE SET
          "quantity" = EXCLUDED."quantity",
          "purchasePrice" = EXCLUDED."purchasePrice",
          "purchaseDate" = EXCLUDED."purchaseDate",
          "updatedAt" = EXCLUDED."updatedAt";
      `, [p.id, p.userId, p.stockId, p.quantity, p.purchasePrice, p.purchaseDate, p.createdAt, p.updatedAt]);
    }
    console.log('  ✓ Synced Purchases');

    // Sales
    for (const sa of sales) {
      await pgClient.query(`
        INSERT INTO "Sales" ("id", "userId", "stockId", "quantity", "sellPrice", "saleDate", "profitLoss", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT ("id") DO UPDATE SET
          "quantity" = EXCLUDED."quantity",
          "sellPrice" = EXCLUDED."sellPrice",
          "saleDate" = EXCLUDED."saleDate",
          "profitLoss" = EXCLUDED."profitLoss",
          "updatedAt" = EXCLUDED."updatedAt";
      `, [sa.id, sa.userId, sa.stockId, sa.quantity, sa.sellPrice, sa.saleDate, sa.profitLoss, sa.createdAt, sa.updatedAt]);
    }
    console.log('  ✓ Synced Sales');

    // PerformanceTargets
    for (const pt of targets) {
      await pgClient.query(`
        INSERT INTO "PerformanceTargets" ("id", "userId", "targetName", "targetType", "targetValue", "targetDate", "isAchieved", "currency", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT ("id") DO UPDATE SET
          "targetName" = EXCLUDED."targetName",
          "targetType" = EXCLUDED."targetType",
          "targetValue" = EXCLUDED."targetValue",
          "targetDate" = EXCLUDED."targetDate",
          "isAchieved" = EXCLUDED."isAchieved",
          "currency" = EXCLUDED."currency",
          "updatedAt" = EXCLUDED."updatedAt";
      `, [pt.id, pt.userId, pt.targetName, pt.targetType, pt.targetValue, pt.targetDate, Boolean(pt.isAchieved), pt.currency || 'USD', pt.createdAt, pt.updatedAt]);
    }
    console.log('  ✓ Synced PerformanceTargets');

    // DailyPrices
    for (const dp of dailyPrices) {
      await pgClient.query(`
        INSERT INTO "DailyPrices" ("id", "userId", "stockId", "date", "price", "volume", "source", "change", "changePercent", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT ("id") DO UPDATE SET
          "price" = EXCLUDED."price",
          "volume" = EXCLUDED."volume",
          "source" = EXCLUDED."source",
          "change" = EXCLUDED."change",
          "changePercent" = EXCLUDED."changePercent",
          "updatedAt" = EXCLUDED."updatedAt";
      `, [dp.id, dp.userId, dp.stockId, dp.date, dp.price, dp.volume, dp.source, dp.change || 0, dp.changePercent || 0, dp.createdAt, dp.updatedAt]);
    }
    console.log('  ✓ Synced DailyPrices');

    // ExportLogs
    for (const el of exportLogs) {
      await pgClient.query(`
        INSERT INTO "ExportLogs" ("id", "userId", "reportType", "exportType", "status", "generatedAt", "filename", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT ("id") DO UPDATE SET
          "status" = EXCLUDED."status",
          "generatedAt" = EXCLUDED."generatedAt",
          "filename" = EXCLUDED."filename",
          "updatedAt" = EXCLUDED."updatedAt";
      `, [el.id, el.userId, el.reportType, el.exportType, el.status, el.generatedAt, el.filename, el.createdAt, el.updatedAt]);
    }
    console.log('  ✓ Synced ExportLogs');

    // SequelizeMeta
    for (const m of migrations) {
      await pgClient.query(`
        INSERT INTO "SequelizeMeta" ("name")
        VALUES ($1)
        ON CONFLICT ("name") DO NOTHING;
      `, [m.name]);
    }
    console.log('  ✓ Synced SequelizeMeta');

    await pgClient.query('COMMIT;');
    console.log('\n🎉 Transaction committed successfully to Neon Postgres!');

    // 4. Verification
    console.log('\n--- Step 4: Verification of Neon Postgres Row Counts ---');
    const tablesToVerify = [
      'Users',
      'UserSettings',
      'Stocks',
      'Purchases',
      'Sales',
      'PerformanceTargets',
      'DailyPrices',
      'ExportLogs',
      'SequelizeMeta',
    ];

    for (const tbl of tablesToVerify) {
      const res = await pgClient.query(`SELECT count(*) as count FROM "${tbl}"`);
      console.log(`  ${tbl.padEnd(22)}: ${res.rows[0].count} rows`);
    }

  } catch (err) {
    await pgClient.query('ROLLBACK;');
    console.error('❌ Upload failed, transaction rolled back:', err);
    throw err;
  } finally {
    await pgClient.end();
    sqliteDb.close();
  }
}

if (require.main === module) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { run };
