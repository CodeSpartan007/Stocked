/**
 * Merge Production Neon Postgres snapshot into Local SQLite database.
 */
const fs = require('fs');
const path = require('path');
const sqlite3 = require(path.join(__dirname, '../backend/node_modules/sqlite3'));

const PROD_BACKUP_PATH = path.join(__dirname, '../dbBackups/prod_backup_clean.json');
const LOCAL_DB_PATH = path.join(__dirname, '../backend/database.sqlite');

async function merge() {
  console.log('🔄 Starting merge of Production data into Local SQLite...');

  if (!fs.existsSync(PROD_BACKUP_PATH)) {
    throw new Error(`Production backup not found at ${PROD_BACKUP_PATH}`);
  }

  const prod = JSON.parse(fs.readFileSync(PROD_BACKUP_PATH, 'utf-8'));
  const db = new sqlite3.Database(LOCAL_DB_PATH);

  const runQuery = (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) return reject(err);
        resolve(this);
      });
    });
  };

  const allQuery = (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });
  };

  try {
    await runQuery('BEGIN TRANSACTION;');

    // 1. Users
    console.log('Merging Users...');
    for (const u of prod.tables.Users) {
      const existing = await allQuery('SELECT id FROM Users WHERE id = ? OR email = ?', [u.id, u.email]);
      if (existing.length === 0) {
        await runQuery(
          `INSERT INTO Users (id, email, passwordHash, role, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)`,
          [u.id, u.email, u.passwordHash, u.role, u.createdAt, u.updatedAt]
        );
        console.log(`  + Inserted user: ${u.email} (${u.id})`);
      } else {
        if (u.email === 'admin@stocked.com') {
          await runQuery('UPDATE Users SET passwordHash = ? WHERE id = ?', [u.passwordHash, u.id]);
          console.log(`  ~ Updated admin password hash to match production`);
        } else {
          console.log(`  = User already exists: ${u.email}`);
        }
      }
    }

    // 2. UserSettings
    console.log('Merging UserSettings...');
    for (const s of prod.tables.UserSettings) {
      const existing = await allQuery('SELECT userId FROM UserSettings WHERE userId = ?', [s.userId]);
      if (existing.length === 0) {
        const polyKey = s.provider === 'polygon' ? s.apiKey : null;
        const avKey = s.provider === 'alphavantage' ? s.apiKey : null;
        await runQuery(
          `INSERT INTO UserSettings (
            userId, provider, apiKey, refreshInterval, createdAt, updatedAt,
            costBasisMethod, alphaVantageApiKey, polygonApiKey, autoSwitchOnRateLimit,
            baseCurrency, exchangeRate, customExchangeRate, exchangeRateUpdatedAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            s.userId,
            s.provider,
            s.apiKey,
            s.refreshInterval || 60,
            s.createdAt,
            s.updatedAt,
            'average',
            avKey,
            polyKey,
            1,
            'USD',
            130.0,
            null,
            null,
          ]
        );
        console.log(`  + Inserted settings for user: ${s.userId}`);
      } else {
        console.log(`  = Settings already exist for user: ${s.userId}`);
      }
    }

    // 3. Stocks
    console.log('Merging Stocks...');
    for (const st of prod.tables.Stocks) {
      const existing = await allQuery('SELECT id FROM Stocks WHERE id = ?', [st.id]);
      if (existing.length === 0) {
        await runQuery(
          `INSERT INTO Stocks (id, userId, name, symbol, description, category, currency, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            st.id,
            st.userId,
            st.name,
            st.symbol,
            st.description,
            st.category,
            'USD',
            st.createdAt,
            st.updatedAt,
          ]
        );
        console.log(`  + Inserted stock: ${st.symbol} (${st.name}) for user ${st.userId}`);
      } else {
        console.log(`  = Stock already exists: ${st.symbol}`);
      }
    }

    // 4. Purchases
    console.log('Merging Purchases...');
    for (const p of prod.tables.Purchases) {
      const existing = await allQuery('SELECT id FROM Purchases WHERE id = ?', [p.id]);
      if (existing.length === 0) {
        await runQuery(
          `INSERT INTO Purchases (id, userId, stockId, quantity, purchasePrice, purchaseDate, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            p.id,
            p.userId,
            p.stockId,
            p.quantity,
            p.purchasePrice,
            p.purchaseDate,
            p.createdAt,
            p.updatedAt,
          ]
        );
        console.log(`  + Inserted purchase: ${p.id} (${p.quantity} @ ${p.purchasePrice})`);
      } else {
        console.log(`  = Purchase already exists: ${p.id}`);
      }
    }

    // 5. Sales
    console.log('Merging Sales...');
    for (const sa of prod.tables.Sales) {
      const existing = await allQuery('SELECT id FROM Sales WHERE id = ?', [sa.id]);
      if (existing.length === 0) {
        await runQuery(
          `INSERT INTO Sales (id, userId, stockId, quantity, sellPrice, saleDate, profitLoss, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            sa.id,
            sa.userId,
            sa.stockId,
            sa.quantity,
            sa.sellPrice,
            sa.saleDate,
            sa.profitLoss,
            sa.createdAt,
            sa.updatedAt,
          ]
        );
        console.log(`  + Inserted sale: ${sa.id} (${sa.quantity} @ ${sa.sellPrice})`);
      } else {
        console.log(`  = Sale already exists: ${sa.id}`);
      }
    }

    // 6. PerformanceTargets
    console.log('Merging PerformanceTargets...');
    for (const pt of prod.tables.PerformanceTargets) {
      const existing = await allQuery('SELECT id FROM PerformanceTargets WHERE id = ?', [pt.id]);
      if (existing.length === 0) {
        await runQuery(
          `INSERT INTO PerformanceTargets (id, userId, targetName, targetType, targetValue, targetDate, isAchieved, currency, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            pt.id,
            pt.userId,
            pt.targetName,
            pt.targetType,
            pt.targetValue,
            pt.targetDate,
            pt.isAchieved ? 1 : 0,
            'USD',
            pt.createdAt,
            pt.updatedAt,
          ]
        );
        console.log(`  + Inserted target: ${pt.targetName}`);
      } else {
        console.log(`  = Target already exists: ${pt.id}`);
      }
    }

    // 7. DailyPrices
    console.log('Merging DailyPrices...');
    let pricesAdded = 0;
    for (const dp of prod.tables.DailyPrices) {
      const existing = await allQuery('SELECT id FROM DailyPrices WHERE id = ?', [dp.id]);
      if (existing.length === 0) {
        await runQuery(
          `INSERT INTO DailyPrices (id, userId, stockId, date, price, volume, source, \`change\`, \`changePercent\`, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            dp.id,
            dp.userId,
            dp.stockId,
            dp.date,
            dp.price,
            dp.volume,
            dp.source,
            dp.change || 0,
            dp.changePercent || 0,
            dp.createdAt,
            dp.updatedAt,
          ]
        );
        pricesAdded++;
      }
    }
    console.log(`  + Inserted ${pricesAdded} daily prices.`);

    // 8. ExportLogs
    console.log('Merging ExportLogs...');
    for (const el of prod.tables.ExportLogs) {
      const existing = await allQuery('SELECT id FROM ExportLogs WHERE id = ?', [el.id]);
      if (existing.length === 0) {
        await runQuery(
          `INSERT INTO ExportLogs (id, userId, reportType, exportType, status, generatedAt, filename, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            el.id,
            el.userId,
            el.reportType,
            el.exportType,
            el.status,
            el.generatedAt,
            el.filename,
            el.createdAt,
            el.updatedAt,
          ]
        );
        console.log(`  + Inserted export log: ${el.filename}`);
      } else {
        console.log(`  = Export log already exists: ${el.id}`);
      }
    }

    await runQuery('COMMIT;');
    console.log('✅ Merge into Local SQLite completed successfully!');
  } catch (err) {
    await runQuery('ROLLBACK;');
    console.error('❌ Merge failed, transaction rolled back:', err);
    throw err;
  } finally {
    db.close();
  }
}

if (require.main === module) {
  merge().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { merge };
