"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExportLogs = exports.UserSetting = exports.PerformanceTarget = exports.Sales = exports.Purchase = exports.DailyPrice = exports.Stock = exports.User = exports.sequelize = void 0;
exports.initDb = initDb;
const database_1 = require("../config/database");
Object.defineProperty(exports, "sequelize", { enumerable: true, get: function () { return database_1.sequelize; } });
const User_1 = require("./User");
Object.defineProperty(exports, "User", { enumerable: true, get: function () { return User_1.User; } });
const Stock_1 = require("./Stock");
Object.defineProperty(exports, "Stock", { enumerable: true, get: function () { return Stock_1.Stock; } });
const DailyPrice_1 = require("./DailyPrice");
Object.defineProperty(exports, "DailyPrice", { enumerable: true, get: function () { return DailyPrice_1.DailyPrice; } });
const Purchase_1 = require("./Purchase");
Object.defineProperty(exports, "Purchase", { enumerable: true, get: function () { return Purchase_1.Purchase; } });
const Sales_1 = require("./Sales");
Object.defineProperty(exports, "Sales", { enumerable: true, get: function () { return Sales_1.Sales; } });
const PerformanceTarget_1 = require("./PerformanceTarget");
Object.defineProperty(exports, "PerformanceTarget", { enumerable: true, get: function () { return PerformanceTarget_1.PerformanceTarget; } });
const UserSetting_1 = require("./UserSetting");
Object.defineProperty(exports, "UserSetting", { enumerable: true, get: function () { return UserSetting_1.UserSetting; } });
const ExportLogs_1 = require("./ExportLogs");
Object.defineProperty(exports, "ExportLogs", { enumerable: true, get: function () { return ExportLogs_1.ExportLogs; } });
const bcrypt_1 = __importDefault(require("bcrypt"));
const recalculate_1 = require("../utils/recalculate");
// Stable, valid UUIDv4 constants for seeded accounts
const SEEDED_USER_UUID = '12345678-abcd-4000-8000-123456789abc';
const SEEDED_ADMIN_UUID = '87654321-abcd-4000-8000-abcdefabcdef';
// Set up associations
User_1.User.hasMany(Stock_1.Stock, { foreignKey: 'userId', onDelete: 'CASCADE', as: 'Stocks' });
Stock_1.Stock.belongsTo(User_1.User, { foreignKey: 'userId', as: 'User' });
Stock_1.Stock.hasMany(DailyPrice_1.DailyPrice, { foreignKey: 'stockId', onDelete: 'CASCADE', as: 'DailyPrices' });
DailyPrice_1.DailyPrice.belongsTo(Stock_1.Stock, { foreignKey: 'stockId', as: 'Stock' });
Stock_1.Stock.hasMany(Purchase_1.Purchase, { foreignKey: 'stockId', onDelete: 'CASCADE', as: 'Purchases' });
Purchase_1.Purchase.belongsTo(Stock_1.Stock, { foreignKey: 'stockId', as: 'Stock' });
Stock_1.Stock.hasMany(Sales_1.Sales, { foreignKey: 'stockId', onDelete: 'CASCADE', as: 'Sales' });
Sales_1.Sales.belongsTo(Stock_1.Stock, { foreignKey: 'stockId', as: 'Stock' });
User_1.User.hasMany(PerformanceTarget_1.PerformanceTarget, { foreignKey: 'userId', onDelete: 'CASCADE', as: 'PerformanceTargets' });
PerformanceTarget_1.PerformanceTarget.belongsTo(User_1.User, { foreignKey: 'userId', as: 'User' });
User_1.User.hasOne(UserSetting_1.UserSetting, { foreignKey: 'userId', onDelete: 'CASCADE', as: 'UserSetting' });
UserSetting_1.UserSetting.belongsTo(User_1.User, { foreignKey: 'userId', as: 'User' });
User_1.User.hasMany(ExportLogs_1.ExportLogs, { foreignKey: 'userId', onDelete: 'CASCADE', as: 'ExportLogs' });
ExportLogs_1.ExportLogs.belongsTo(User_1.User, { foreignKey: 'userId', as: 'User' });
// Direct User Relations for secure multi-tenant isolation
User_1.User.hasMany(Purchase_1.Purchase, { foreignKey: 'userId', onDelete: 'CASCADE', as: 'Purchases' });
Purchase_1.Purchase.belongsTo(User_1.User, { foreignKey: 'userId', as: 'User' });
User_1.User.hasMany(Sales_1.Sales, { foreignKey: 'userId', onDelete: 'CASCADE', as: 'Sales' });
Sales_1.Sales.belongsTo(User_1.User, { foreignKey: 'userId', as: 'User' });
User_1.User.hasMany(DailyPrice_1.DailyPrice, { foreignKey: 'userId', onDelete: 'CASCADE', as: 'DailyPrices' });
DailyPrice_1.DailyPrice.belongsTo(User_1.User, { foreignKey: 'userId', as: 'User' });
async function initDb() {
    // In development, `alter: true` applies schema changes automatically.
    // In SQLite/development: do not use `alter: true` as it causes duplicate unique constraint bugs.
    // In production, never alter/drop tables — only create if not exists.
    const isSqlite = database_1.sequelize.getDialect() === 'sqlite';
    // In development SQLite, we can alter the schema.
    // We NEVER run automatic Sequelize sync alters on Postgres (even when running locally) to prevent data risks.
    await database_1.sequelize.sync({ alter: isSqlite && process.env.NODE_ENV !== 'production' });
    // Non-destructively add new columns if they are missing in production Postgres schema
    if (!isSqlite) {
        try {
            await database_1.sequelize.query('ALTER TABLE "DailyPrices" ADD COLUMN IF NOT EXISTS "change" DECIMAL(12, 2) DEFAULT 0.00;');
            await database_1.sequelize.query('ALTER TABLE "DailyPrices" ADD COLUMN IF NOT EXISTS "changePercent" DECIMAL(12, 2) DEFAULT 0.00;');
            console.log('DailyPrices columns verified/added successfully for Postgres.');
        }
        catch (err) {
            console.error('Failed to run schema migration for Postgres:', err);
        }
    }
    console.log('Database synced successfully.');
    // Seed default user if not exists
    let mockUser = await User_1.User.findByPk(SEEDED_USER_UUID);
    const existingUserWithEmail = await User_1.User.findOne({ where: { email: 'user@stocked.com' } });
    if (existingUserWithEmail && existingUserWithEmail.id !== SEEDED_USER_UUID) {
        if (process.env.NODE_ENV !== 'production') {
            // Non-destructively rename the conflicting email to free the seed address
            existingUserWithEmail.email = `${existingUserWithEmail.email}.seed-conflict`;
            await existingUserWithEmail.save();
            mockUser = null;
        }
        else {
            mockUser = existingUserWithEmail;
        }
    }
    let mockAdmin = await User_1.User.findByPk(SEEDED_ADMIN_UUID);
    const existingAdminWithEmail = await User_1.User.findOne({ where: { email: 'admin@stocked.com' } });
    if (existingAdminWithEmail && existingAdminWithEmail.id !== SEEDED_ADMIN_UUID) {
        if (process.env.NODE_ENV !== 'production') {
            // Non-destructively rename the conflicting email to free the seed address
            existingAdminWithEmail.email = `${existingAdminWithEmail.email}.seed-conflict`;
            await existingAdminWithEmail.save();
            mockAdmin = null;
        }
        else {
            mockAdmin = existingAdminWithEmail;
        }
    }
    if (!mockUser) {
        // Generate secure cryptographically hashed passwords for seeding
        const userPasswordHash = await bcrypt_1.default.hash('UserPassword123!', 12);
        const adminPasswordHash = await bcrypt_1.default.hash('AdminPassword123!', 12);
        // Create user
        await User_1.User.create({
            id: SEEDED_USER_UUID,
            email: 'user@stocked.com',
            passwordHash: userPasswordHash,
            role: 'user',
        });
        console.log(`Default mock user (${SEEDED_USER_UUID}) seeded.`);
        // Create administrator
        if (!mockAdmin) {
            await User_1.User.create({
                id: SEEDED_ADMIN_UUID,
                email: 'admin@stocked.com',
                passwordHash: adminPasswordHash,
                role: 'admin',
            });
            console.log(`Default administrator user (${SEEDED_ADMIN_UUID}) seeded.`);
        }
        // Seed some initial stocks so there's rich data out of the box
        const apple = await Stock_1.Stock.create({
            id: 'a9f24300-d85f-4029-9e8c-8c0827284ea4',
            userId: SEEDED_USER_UUID,
            name: 'Apple Inc.',
            symbol: 'AAPL',
            description: 'Consumer electronics and software giant.',
            category: 'Technology',
        });
        const tesla = await Stock_1.Stock.create({
            id: 'b6e82c5f-cfde-4786-bb34-8c8872b22f03',
            userId: SEEDED_USER_UUID,
            name: 'Tesla Inc.',
            symbol: 'TSLA',
            description: 'Electric vehicles, energy storage, and solar power.',
            category: 'Automotive',
        });
        console.log('Initial sample stocks (AAPL, TSLA) seeded.');
        // Seed some initial prices
        const today = new Date();
        const formatDate = (daysAgo) => {
            const d = new Date();
            d.setDate(today.getDate() - daysAgo);
            return d.toISOString().split('T')[0];
        };
        // AAPL Price History
        await DailyPrice_1.DailyPrice.bulkCreate([
            { id: '1a111111-1111-1111-1111-111111111111', stockId: apple.id, userId: SEEDED_USER_UUID, date: formatDate(5), price: 175.50, volume: 52000000, source: 'manual' },
            { id: '1a111111-1111-1111-1111-222222222222', stockId: apple.id, userId: SEEDED_USER_UUID, date: formatDate(4), price: 177.20, volume: 48000000, source: 'manual' },
            { id: '1a111111-1111-1111-1111-333333333333', stockId: apple.id, userId: SEEDED_USER_UUID, date: formatDate(3), price: 176.80, volume: 43000000, source: 'api' },
            { id: '1a111111-1111-1111-1111-444444444444', stockId: apple.id, userId: SEEDED_USER_UUID, date: formatDate(2), price: 178.45, volume: 55000000, source: 'api' },
            { id: '1a111111-1111-1111-1111-555555555555', stockId: apple.id, userId: SEEDED_USER_UUID, date: formatDate(1), price: 180.10, volume: 60000000, source: 'manual' },
        ]);
        // TSLA Price History
        await DailyPrice_1.DailyPrice.bulkCreate([
            { id: '2b222222-2222-2222-2222-111111111111', stockId: tesla.id, userId: SEEDED_USER_UUID, date: formatDate(4), price: 185.00, volume: 85000000, source: 'manual' },
            { id: '2b222222-2222-2222-2222-222222222222', stockId: tesla.id, userId: SEEDED_USER_UUID, date: formatDate(3), price: 182.30, volume: 92000000, source: 'manual' },
            { id: '2b222222-2222-2222-2222-333333333333', stockId: tesla.id, userId: SEEDED_USER_UUID, date: formatDate(2), price: 187.60, volume: 105000000, source: 'api' },
            { id: '2b222222-2222-2222-2222-444444444444', stockId: tesla.id, userId: SEEDED_USER_UUID, date: formatDate(1), price: 191.00, volume: 99000000, source: 'manual' },
        ]);
        console.log('Initial price records seeded.');
        // Recalculate seed history to populate change and changePercent
        await (0, recalculate_1.recalculateStockPriceHistory)(apple.id, SEEDED_USER_UUID);
        await (0, recalculate_1.recalculateStockPriceHistory)(tesla.id, SEEDED_USER_UUID);
        console.log('Initial seed price history changes calculated.');
    }
    // Recalculate price history for all existing stocks to update change and changePercent
    try {
        const allStocks = await Stock_1.Stock.findAll();
        for (const s of allStocks) {
            await (0, recalculate_1.recalculateStockPriceHistory)(s.id, s.userId);
        }
        console.log(`Recalculated price history for all ${allStocks.length} stocks on startup.`);
    }
    catch (err) {
        console.error('Failed to run startup history recalculation:', err);
    }
}
