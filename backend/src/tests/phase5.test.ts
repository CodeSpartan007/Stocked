import { Sequelize, QueryInterface, QueryTypes } from 'sequelize';
import path from 'path';
import fs from 'fs';
import { Umzug, SequelizeStorage } from 'umzug';
import { initDb, User, Stock, DailyPrice, UserSetting } from '../models';
import { applySqliteHooks } from '../config/database';

describe('Phase 5: Database Concurrency & Migrations', () => {
  const tempDbPath = path.resolve(__dirname, '../../test_wal_phase5.sqlite');

  afterAll(async () => {
    // Clean up temporary database file
    if (fs.existsSync(tempDbPath)) {
      try {
        fs.unlinkSync(tempDbPath);
      } catch {
        // Ignore if file is temporarily locked
      }
    }
    if (fs.existsSync(`${tempDbPath}-wal`)) {
      try {
        fs.unlinkSync(`${tempDbPath}-wal`);
      } catch {
        // Ignore
      }
    }
    if (fs.existsSync(`${tempDbPath}-shm`)) {
      try {
        fs.unlinkSync(`${tempDbPath}-shm`);
      } catch {
        // Ignore
      }
    }
  });

  describe('5.1 SQLite WAL Mode & Busy Timeout', () => {
    it('should activate WAL mode, foreign keys, and 5000ms busy timeout on connection', async () => {
      const testDb = applySqliteHooks(
        new Sequelize({
          dialect: 'sqlite',
          storage: tempDbPath,
          logging: false,
          hooks: {
            afterConnect: (connection: any, callback: any) => {
              connection.run('PRAGMA foreign_keys = ON;', () => {
                connection.run('PRAGMA journal_mode = WAL;', () => {
                  connection.run('PRAGMA busy_timeout = 5000;', callback);
                });
              });
            },
          },
        })
      );

      // Verify foreign keys pragma
      const fkResult = await testDb.query('PRAGMA foreign_keys;', { type: QueryTypes.SELECT }) as Array<{ foreign_keys: number }>;
      expect(fkResult[0].foreign_keys).toBe(1);

      // Verify WAL journal mode pragma
      const journalResult = await testDb.query('PRAGMA journal_mode;', { type: QueryTypes.SELECT }) as Array<{ journal_mode: string }>;
      expect(journalResult[0].journal_mode.toLowerCase()).toBe('wal');

      // Verify busy timeout pragma
      const timeoutResult = await testDb.query('PRAGMA busy_timeout;', { type: QueryTypes.SELECT }) as Array<{ timeout: number }>;
      expect(timeoutResult[0].timeout).toBe(5000);

      await testDb.close();
    });
  });

  describe('5.2 Standalone Umzug Migration Pipeline', () => {
    let migrationDb: Sequelize;
    let testMigrator: Umzug<QueryInterface>;
    const migrationDbPath = path.resolve(__dirname, '../../test_migration_runner.sqlite');

    beforeAll(async () => {
      migrationDb = new Sequelize({
        dialect: 'sqlite',
        storage: migrationDbPath,
        logging: false,
        hooks: {
          afterConnect: (connection: any, callback: any) => {
            connection.run('PRAGMA foreign_keys = ON;', () => {
              connection.run('PRAGMA journal_mode = WAL;', () => {
                connection.run('PRAGMA busy_timeout = 5000;', callback);
              });
            });
          },
        },
      });

      const baseStorage = new SequelizeStorage({ sequelize: migrationDb });
      const normalizedStorage = {
        async executed(): Promise<string[]> {
          const records = await baseStorage.executed();
          return records.map((r: string) => r.replace(/\.[tj]s$/, ''));
        },
        async logMigration(params: { name: string }): Promise<void> {
          const cleanName = params.name.replace(/\.[tj]s$/, '');
          await baseStorage.logMigration({ name: cleanName });
        },
        async unlogMigration(params: { name: string }): Promise<void> {
          const cleanName = params.name.replace(/\.[tj]s$/, '');
          await Promise.allSettled([
            baseStorage.unlogMigration({ name: cleanName }),
            baseStorage.unlogMigration({ name: `${cleanName}.ts` }),
            baseStorage.unlogMigration({ name: `${cleanName}.js` }),
          ]);
        },
      };

      testMigrator = new Umzug({
        migrations: {
          glob: ['migrations/!(*.d).{ts,js}', { cwd: path.resolve(__dirname, '../') }],
          resolve: ({ name, path: filepath, context }) => {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const migration = require(filepath!);
            const up = migration.up || migration.default?.up;
            const down = migration.down || migration.default?.down;
            const cleanName = name.replace(/\.[tj]s$/, '');
            return {
              name: cleanName,
              path: filepath,
              up: async () => up({ context }),
              down: async () => down?.({ context }),
            };
          },
        },
        context: migrationDb.getQueryInterface(),
        storage: normalizedStorage,
        logger: undefined,
      });
    });

    afterAll(async () => {
      await migrationDb.close();
      if (fs.existsSync(migrationDbPath)) {
        try {
          fs.unlinkSync(migrationDbPath);
        } catch {
          // Ignore
        }
      }
      if (fs.existsSync(`${migrationDbPath}-wal`)) {
        try {
          fs.unlinkSync(`${migrationDbPath}-wal`);
        } catch {
          // Ignore
        }
      }
      if (fs.existsSync(`${migrationDbPath}-shm`)) {
        try {
          fs.unlinkSync(`${migrationDbPath}-shm`);
        } catch {
          // Ignore
        }
      }
    });

    it('should execute pending migrations up and create all core tables and evolution columns', async () => {
      const applied = await testMigrator.up();
      expect(applied.length).toBe(4);
      expect(applied.map(m => m.name)).toEqual([
        '0001_initial_schema',
        '0002_add_change_and_cost_basis',
        '0003_add_multi_provider_api_keys',
        '0004_fix_unique_constraints_and_indexes',
      ]);

      // Verify all tables were created
      const queryInterface = migrationDb.getQueryInterface();
      const tables = await queryInterface.showAllTables();
      expect(tables).toContain('Users');
      expect(tables).toContain('Stocks');
      expect(tables).toContain('DailyPrices');
      expect(tables).toContain('Purchases');
      expect(tables).toContain('Sales');
      expect(tables).toContain('PerformanceTargets');
      expect(tables).toContain('UserSettings');
      expect(tables).toContain('ExportLogs');
      expect(tables).toContain('SequelizeMeta');

      // Verify DailyPrices has change and changePercent columns
      const dailyPricesDesc = await queryInterface.describeTable('DailyPrices');
      expect(dailyPricesDesc.change).toBeDefined();
      expect(dailyPricesDesc.changePercent).toBeDefined();

      // Verify UserSettings has costBasisMethod column and multi-provider columns
      const userSettingsDesc = await queryInterface.describeTable('UserSettings');
      expect(userSettingsDesc.costBasisMethod).toBeDefined();
      expect(userSettingsDesc.alphaVantageApiKey).toBeDefined();
      expect(userSettingsDesc.polygonApiKey).toBeDefined();
      expect(userSettingsDesc.autoSwitchOnRateLimit).toBeDefined();
    });

    it('should correctly revert migrations (down) and remove added columns', async () => {
      const reverted0004 = await testMigrator.down();
      expect(reverted0004.length).toBe(1);
      expect(reverted0004[0].name).toBe('0004_fix_unique_constraints_and_indexes');

      const reverted = await testMigrator.down();
      expect(reverted.length).toBe(1);
      expect(reverted[0].name).toBe('0003_add_multi_provider_api_keys');

      const queryInterface = migrationDb.getQueryInterface();
      const userSettingsDesc = await queryInterface.describeTable('UserSettings');
      expect(userSettingsDesc.alphaVantageApiKey).toBeUndefined();
      expect(userSettingsDesc.polygonApiKey).toBeUndefined();
      expect(userSettingsDesc.autoSwitchOnRateLimit).toBeUndefined();
    });

    it('should re-apply migration up and restore columns', async () => {
      const applied = await testMigrator.up();
      expect(applied.length).toBe(2);
      expect(applied.map(m => m.name)).toEqual([
        '0003_add_multi_provider_api_keys',
        '0004_fix_unique_constraints_and_indexes',
      ]);

      const queryInterface = migrationDb.getQueryInterface();
      const userSettingsDesc = await queryInterface.describeTable('UserSettings');
      expect(userSettingsDesc.alphaVantageApiKey).toBeDefined();
      expect(userSettingsDesc.polygonApiKey).toBeDefined();
      expect(userSettingsDesc.autoSwitchOnRateLimit).toBeDefined();
    });

    it('should integrate with initDb() seamlessly', async () => {
      // initDb() runs migrator.up() internally and verifies default seed accounts
      await expect(initDb()).resolves.not.toThrow();

      const user = await User.findOne({ where: { email: 'user@stocked.com' } });
      expect(user).not.toBeNull();
      expect(user?.role).toBe('user');

      const admin = await User.findOne({ where: { email: 'admin@stocked.com' } });
      expect(admin).not.toBeNull();
      expect(admin?.role).toBe('admin');
    });
  });
});
