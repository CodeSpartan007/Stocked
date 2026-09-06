import { Umzug, SequelizeStorage } from 'umzug';
import { QueryInterface } from 'sequelize';
import { sequelize } from './config/database';
import path from 'path';

const baseStorage = new SequelizeStorage({ sequelize });

const normalizedStorage = {
  async executed(params?: any): Promise<string[]> {
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

// Standalone Umzug Migration Pipeline
export const migrator = new Umzug({
  migrations: {
    glob: ['migrations/!(*.d).{ts,js}', { cwd: __dirname }],
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
  context: sequelize.getQueryInterface(),
  storage: normalizedStorage,
  logger: console,
});

export type Migration = typeof migrator._types.migration;

export async function runMigrations(): Promise<void> {
  await migrator.up();
}

export async function revertLastMigration(): Promise<void> {
  await migrator.down();
}

export async function getMigrationStatus() {
  const [executed, pending] = await Promise.all([
    migrator.executed(),
    migrator.pending(),
  ]);
  return { executed, pending };
}

// Standalone CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    process.argv.push('up');
  }
  migrator.runAsCLI().finally(async () => {
    await sequelize.close();
  });
}
