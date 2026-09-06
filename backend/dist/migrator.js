"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrator = void 0;
exports.runMigrations = runMigrations;
exports.revertLastMigration = revertLastMigration;
exports.getMigrationStatus = getMigrationStatus;
const umzug_1 = require("umzug");
const database_1 = require("./config/database");
const baseStorage = new umzug_1.SequelizeStorage({ sequelize: database_1.sequelize });
const normalizedStorage = {
    async executed(params) {
        const records = await baseStorage.executed();
        return records.map((r) => r.replace(/\.[tj]s$/, ''));
    },
    async logMigration(params) {
        const cleanName = params.name.replace(/\.[tj]s$/, '');
        await baseStorage.logMigration({ name: cleanName });
    },
    async unlogMigration(params) {
        const cleanName = params.name.replace(/\.[tj]s$/, '');
        await Promise.allSettled([
            baseStorage.unlogMigration({ name: cleanName }),
            baseStorage.unlogMigration({ name: `${cleanName}.ts` }),
            baseStorage.unlogMigration({ name: `${cleanName}.js` }),
        ]);
    },
};
// Standalone Umzug Migration Pipeline
exports.migrator = new umzug_1.Umzug({
    migrations: {
        glob: ['migrations/!(*.d).{ts,js}', { cwd: __dirname }],
        resolve: ({ name, path: filepath, context }) => {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const migration = require(filepath);
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
    context: database_1.sequelize.getQueryInterface(),
    storage: normalizedStorage,
    logger: console,
});
async function runMigrations() {
    await exports.migrator.up();
}
async function revertLastMigration() {
    await exports.migrator.down();
}
async function getMigrationStatus() {
    const [executed, pending] = await Promise.all([
        exports.migrator.executed(),
        exports.migrator.pending(),
    ]);
    return { executed, pending };
}
// Standalone CLI execution
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        process.argv.push('up');
    }
    exports.migrator.runAsCLI().finally(async () => {
        await database_1.sequelize.close();
    });
}
