"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sequelize = void 0;
const sequelize_1 = require("sequelize");
const path_1 = __importDefault(require("path"));
const isProduction = process.env.NODE_ENV === 'production';
// In development: use local SQLite file.
// In production: use Neon Postgres via DATABASE_URL env var.
function createSequelize() {
    if (isProduction) {
        const dbUrl = process.env.DATABASE_URL;
        if (!dbUrl) {
            console.error('[FATAL] DATABASE_URL is not set. In production, a Postgres connection string is required.\n' +
                'Set DATABASE_URL in your Railway environment variables and redeploy.');
            process.exit(1);
        }
        return new sequelize_1.Sequelize(dbUrl, {
            dialect: 'postgres',
            dialectOptions: {
                ssl: {
                    require: true,
                    rejectUnauthorized: false, // Required for Neon's managed SSL
                },
            },
            logging: false,
            define: {
                timestamps: true,
            },
        });
    }
    return new sequelize_1.Sequelize({
        dialect: 'sqlite',
        storage: path_1.default.resolve(__dirname, '../../database.sqlite'),
        logging: false,
        define: {
            timestamps: true,
        },
        hooks: {
            afterConnect: (connection, callback) => {
                connection.run('PRAGMA foreign_keys = ON;', callback);
            },
        },
    });
}
exports.sequelize = createSequelize();
