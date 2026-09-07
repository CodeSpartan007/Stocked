import { QueryInterface } from 'sequelize';

export const up = async ({ context: queryInterface }: { context: QueryInterface }): Promise<void> => {
  const sequelize = queryInterface.sequelize;
  const isSqlite = sequelize.getDialect() === 'sqlite';

  if (isSqlite) {
    await sequelize.query('PRAGMA foreign_keys = OFF;');

    // 1. Fix Stocks table if it has invalid UNIQUE on individual columns (userId or symbol)
    const [stocksMaster] = (await sequelize.query(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='Stocks';"
    )) as [Array<{ sql: string }>, unknown];

    if (stocksMaster.length > 0) {
      const sql = stocksMaster[0].sql;
      const hasBadUserIdUnique = /`?userId`?[^,]*UNIQUE/i.test(sql);
      const hasBadSymbolUnique = /`?symbol`?[^,]*UNIQUE/i.test(sql);

      if (hasBadUserIdUnique || hasBadSymbolUnique) {
        console.log('[Migration 0004] Rebuilding SQLite Stocks table to remove invalid column-level UNIQUE constraints...');
        await sequelize.query('DROP TABLE IF EXISTS `Stocks_new`;');
        await sequelize.query(`
          CREATE TABLE \`Stocks_new\` (
            \`id\` UUID NOT NULL PRIMARY KEY,
            \`userId\` UUID NOT NULL REFERENCES \`Users\` (\`id\`) ON DELETE CASCADE,
            \`name\` VARCHAR(255) NOT NULL,
            \`symbol\` VARCHAR(255) NOT NULL,
            \`description\` TEXT,
            \`category\` VARCHAR(255),
            \`createdAt\` DATETIME NOT NULL,
            \`updatedAt\` DATETIME NOT NULL
          );
        `);
        await sequelize.query(`
          INSERT INTO \`Stocks_new\` (\`id\`, \`userId\`, \`name\`, \`symbol\`, \`description\`, \`category\`, \`createdAt\`, \`updatedAt\`)
          SELECT \`id\`, \`userId\`, \`name\`, \`symbol\`, \`description\`, \`category\`, \`createdAt\`, \`updatedAt\` FROM \`Stocks\`;
        `);
        await sequelize.query('DROP TABLE `Stocks`;');
        await sequelize.query('ALTER TABLE `Stocks_new` RENAME TO `Stocks`;');
        console.log('[Migration 0004] SQLite Stocks table successfully rebuilt.');
      }
    }

    // Ensure composite unique index on Stocks (userId, symbol)
    await sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS \`stocks_user_symbol_unique\` ON \`Stocks\` (\`userId\`, \`symbol\`);
    `);

    // 2. Fix DailyPrices table if it has invalid UNIQUE on stockId or date, or lacks composite unique index
    const [dailyPricesMaster] = (await sequelize.query(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='DailyPrices';"
    )) as [Array<{ sql: string }>, unknown];

    if (dailyPricesMaster.length > 0) {
      const sql = dailyPricesMaster[0].sql;
      const hasBadStockIdUnique = /`?stockId`?[^,]*UNIQUE/i.test(sql);
      const hasBadDateUnique = /`?date`?[^,]*UNIQUE/i.test(sql);

      if (hasBadStockIdUnique || hasBadDateUnique) {
        console.log('[Migration 0004] Rebuilding SQLite DailyPrices table to remove invalid column-level UNIQUE constraints...');
        await sequelize.query('DROP TABLE IF EXISTS `DailyPrices_new`;');
        await sequelize.query(`
          CREATE TABLE \`DailyPrices_new\` (
            \`id\` UUID NOT NULL PRIMARY KEY,
            \`userId\` UUID NOT NULL REFERENCES \`Users\` (\`id\`) ON DELETE CASCADE,
            \`stockId\` UUID NOT NULL REFERENCES \`Stocks\` (\`id\`) ON DELETE CASCADE,
            \`date\` DATE NOT NULL,
            \`price\` DECIMAL(12,2) NOT NULL,
            \`volume\` INTEGER NOT NULL,
            \`source\` TEXT NOT NULL DEFAULT 'manual',
            \`createdAt\` DATETIME NOT NULL,
            \`updatedAt\` DATETIME NOT NULL,
            \`change\` DECIMAL(12,2) NOT NULL DEFAULT 0,
            \`changePercent\` DECIMAL(12,2) NOT NULL DEFAULT 0
          );
        `);
        // Check which columns exist in current DailyPrices
        const [cols] = (await sequelize.query('PRAGMA table_info(`DailyPrices`);')) as [Array<{ name: string }>, unknown];
        const colNames = new Set(cols.map((c) => c.name));
        const selectChange = colNames.has('change') ? '`change`' : '0 AS `change`';
        const selectChangePercent = colNames.has('changePercent') ? '`changePercent`' : '0 AS `changePercent`';

        await sequelize.query(`
          INSERT OR IGNORE INTO \`DailyPrices_new\` (\`id\`, \`userId\`, \`stockId\`, \`date\`, \`price\`, \`volume\`, \`source\`, \`createdAt\`, \`updatedAt\`, \`change\`, \`changePercent\`)
          SELECT \`id\`, \`userId\`, \`stockId\`, \`date\`, \`price\`, \`volume\`, \`source\`, \`createdAt\`, \`updatedAt\`, ${selectChange}, ${selectChangePercent} FROM \`DailyPrices\`;
        `);
        await sequelize.query('DROP TABLE `DailyPrices`;');
        await sequelize.query('ALTER TABLE `DailyPrices_new` RENAME TO `DailyPrices`;');
        console.log('[Migration 0004] SQLite DailyPrices table successfully rebuilt.');
      }
    }

    // Ensure composite unique index on DailyPrices (stockId, date)
    await sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS \`daily_prices_stock_date_unique\` ON \`DailyPrices\` (\`stockId\`, \`date\`);
    `);

    await sequelize.query('PRAGMA foreign_keys = ON;');
  } else {
    // Postgres dialect
    // Drop single-column unique constraints if they exist
    try {
      await sequelize.query('ALTER TABLE "Stocks" DROP CONSTRAINT IF EXISTS "Stocks_userId_key";');
      await sequelize.query('ALTER TABLE "Stocks" DROP CONSTRAINT IF EXISTS "Stocks_symbol_key";');
      await sequelize.query('ALTER TABLE "DailyPrices" DROP CONSTRAINT IF EXISTS "DailyPrices_stockId_key";');
      await sequelize.query('ALTER TABLE "DailyPrices" DROP CONSTRAINT IF EXISTS "DailyPrices_date_key";');
    } catch (err) {
      console.warn('[Migration 0004] Non-critical warning dropping Postgres single-column constraints:', err);
    }

    // Create unique composite indexes
    try {
      await sequelize.query('CREATE UNIQUE INDEX IF NOT EXISTS "stocks_user_symbol_unique" ON "Stocks" ("userId", "symbol");');
      await sequelize.query('CREATE UNIQUE INDEX IF NOT EXISTS "daily_prices_stock_date_unique" ON "DailyPrices" ("stockId", "date");');
    } catch (err) {
      console.warn('[Migration 0004] Non-critical warning creating Postgres unique indexes:', err);
    }
  }
};

export const down = async ({ context: queryInterface }: { context: QueryInterface }): Promise<void> => {
  const sequelize = queryInterface.sequelize;
  const isSqlite = sequelize.getDialect() === 'sqlite';
  const quote = isSqlite ? '`' : '"';

  try {
    await sequelize.query(`DROP INDEX IF EXISTS ${quote}stocks_user_symbol_unique${quote};`);
    await sequelize.query(`DROP INDEX IF EXISTS ${quote}daily_prices_stock_date_unique${quote};`);
  } catch (err) {
    console.warn('[Migration 0004 down] Warning dropping indexes:', err);
  }
};
