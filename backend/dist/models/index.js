"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PerformanceTarget = exports.Sales = exports.Purchase = exports.DailyPrice = exports.Stock = exports.User = exports.sequelize = void 0;
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
async function initDb() {
    // Sync the database
    await database_1.sequelize.sync();
    console.log('Database synced successfully.');
    // Seed default user if not exists
    const mockUser = await User_1.User.findByPk('mock-user-123');
    if (!mockUser) {
        await User_1.User.create({
            id: 'mock-user-123',
            email: 'user@stocked.com',
            passwordHash: 'seeded_dummy_password_hash', // Simulated secure hash for Phase 1
            role: 'user',
        });
        console.log('Default mock user (mock-user-123) seeded.');
        // Seed some initial stocks so there's rich data out of the box
        const apple = await Stock_1.Stock.create({
            id: 'a9f24300-d85f-4029-9e8c-8c0827284ea4',
            userId: 'mock-user-123',
            name: 'Apple Inc.',
            symbol: 'AAPL',
            description: 'Consumer electronics and software giant.',
            category: 'Technology',
        });
        const tesla = await Stock_1.Stock.create({
            id: 'b6e82c5f-cfde-4786-bb34-8c8872b22f03',
            userId: 'mock-user-123',
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
            { stockId: apple.id, date: formatDate(5), price: 175.50, volume: 52000000, source: 'manual' },
            { stockId: apple.id, date: formatDate(4), price: 177.20, volume: 48000000, source: 'manual' },
            { stockId: apple.id, date: formatDate(3), price: 176.80, volume: 43000000, source: 'api' },
            { stockId: apple.id, date: formatDate(2), price: 178.45, volume: 55000000, source: 'api' },
            { stockId: apple.id, date: formatDate(1), price: 180.10, volume: 60000000, source: 'manual' },
        ]);
        // TSLA Price History
        await DailyPrice_1.DailyPrice.bulkCreate([
            { stockId: tesla.id, date: formatDate(4), price: 185.00, volume: 85000000, source: 'manual' },
            { stockId: tesla.id, date: formatDate(3), price: 182.30, volume: 92000000, source: 'manual' },
            { stockId: tesla.id, date: formatDate(2), price: 187.60, volume: 105000000, source: 'api' },
            { stockId: tesla.id, date: formatDate(1), price: 191.00, volume: 99000000, source: 'manual' },
        ]);
        console.log('Initial price records seeded.');
    }
}
