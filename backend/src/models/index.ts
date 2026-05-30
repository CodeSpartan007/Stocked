import { sequelize } from '../config/database';
import { User } from './User';
import { Stock } from './Stock';
import { DailyPrice } from './DailyPrice';
import { Purchase } from './Purchase';
import { Sales } from './Sales';
import { PerformanceTarget } from './PerformanceTarget';

// Set up associations
User.hasMany(Stock, { foreignKey: 'userId', onDelete: 'CASCADE', as: 'Stocks' });
Stock.belongsTo(User, { foreignKey: 'userId', as: 'User' });

Stock.hasMany(DailyPrice, { foreignKey: 'stockId', onDelete: 'CASCADE', as: 'DailyPrices' });
DailyPrice.belongsTo(Stock, { foreignKey: 'stockId', as: 'Stock' });

Stock.hasMany(Purchase, { foreignKey: 'stockId', onDelete: 'CASCADE', as: 'Purchases' });
Purchase.belongsTo(Stock, { foreignKey: 'stockId', as: 'Stock' });

Stock.hasMany(Sales, { foreignKey: 'stockId', onDelete: 'CASCADE', as: 'Sales' });
Sales.belongsTo(Stock, { foreignKey: 'stockId', as: 'Stock' });

User.hasMany(PerformanceTarget, { foreignKey: 'userId', onDelete: 'CASCADE', as: 'PerformanceTargets' });
PerformanceTarget.belongsTo(User, { foreignKey: 'userId', as: 'User' });

export { sequelize, User, Stock, DailyPrice, Purchase, Sales, PerformanceTarget };

export async function initDb() {
  // Sync the database
  await sequelize.sync();
  console.log('Database synced successfully.');

  // Seed default user if not exists
  const mockUser = await User.findByPk('mock-user-123');
  if (!mockUser) {
    await User.create({
      id: 'mock-user-123',
      email: 'user@stocked.com',
      passwordHash: 'seeded_dummy_password_hash', // Simulated secure hash for Phase 1
      role: 'user',
    });
    console.log('Default mock user (mock-user-123) seeded.');

    // Seed some initial stocks so there's rich data out of the box
    const apple = await Stock.create({
      id: 'a9f24300-d85f-4029-9e8c-8c0827284ea4',
      userId: 'mock-user-123',
      name: 'Apple Inc.',
      symbol: 'AAPL',
      description: 'Consumer electronics and software giant.',
      category: 'Technology',
    });

    const tesla = await Stock.create({
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
    const formatDate = (daysAgo: number) => {
      const d = new Date();
      d.setDate(today.getDate() - daysAgo);
      return d.toISOString().split('T')[0];
    };

    // AAPL Price History
    await DailyPrice.bulkCreate([
      { stockId: apple.id, date: formatDate(5), price: 175.50, volume: 52000000, source: 'manual' },
      { stockId: apple.id, date: formatDate(4), price: 177.20, volume: 48000000, source: 'manual' },
      { stockId: apple.id, date: formatDate(3), price: 176.80, volume: 43000000, source: 'api' },
      { stockId: apple.id, date: formatDate(2), price: 178.45, volume: 55000000, source: 'api' },
      { stockId: apple.id, date: formatDate(1), price: 180.10, volume: 60000000, source: 'manual' },
    ]);

    // TSLA Price History
    await DailyPrice.bulkCreate([
      { stockId: tesla.id, date: formatDate(4), price: 185.00, volume: 85000000, source: 'manual' },
      { stockId: tesla.id, date: formatDate(3), price: 182.30, volume: 92000000, source: 'manual' },
      { stockId: tesla.id, date: formatDate(2), price: 187.60, volume: 105000000, source: 'api' },
      { stockId: tesla.id, date: formatDate(1), price: 191.00, volume: 99000000, source: 'manual' },
    ]);

    console.log('Initial price records seeded.');
  }
}
