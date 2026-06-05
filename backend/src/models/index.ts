import { sequelize } from '../config/database';
import { User } from './User';
import { Stock } from './Stock';
import { DailyPrice } from './DailyPrice';
import { Purchase } from './Purchase';
import { Sales } from './Sales';
import { PerformanceTarget } from './PerformanceTarget';
import { UserSetting } from './UserSetting';
import { ExportLogs } from './ExportLogs';
import bcrypt from 'bcrypt';

// Stable, valid UUIDv4 constants for seeded accounts
const SEEDED_USER_UUID = '12345678-abcd-4000-8000-123456789abc';
const SEEDED_ADMIN_UUID = '87654321-abcd-4000-8000-abcdefabcdef';

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

User.hasOne(UserSetting, { foreignKey: 'userId', onDelete: 'CASCADE', as: 'UserSetting' });
UserSetting.belongsTo(User, { foreignKey: 'userId', as: 'User' });

User.hasMany(ExportLogs, { foreignKey: 'userId', onDelete: 'CASCADE', as: 'ExportLogs' });
ExportLogs.belongsTo(User, { foreignKey: 'userId', as: 'User' });

// Direct User Relations for secure multi-tenant isolation
User.hasMany(Purchase, { foreignKey: 'userId', onDelete: 'CASCADE', as: 'Purchases' });
Purchase.belongsTo(User, { foreignKey: 'userId', as: 'User' });

User.hasMany(Sales, { foreignKey: 'userId', onDelete: 'CASCADE', as: 'Sales' });
Sales.belongsTo(User, { foreignKey: 'userId', as: 'User' });

User.hasMany(DailyPrice, { foreignKey: 'userId', onDelete: 'CASCADE', as: 'DailyPrices' });
DailyPrice.belongsTo(User, { foreignKey: 'userId', as: 'User' });

export { sequelize, User, Stock, DailyPrice, Purchase, Sales, PerformanceTarget, UserSetting, ExportLogs };

export async function initDb() {
  // In development, `alter: true` applies schema changes automatically.
  // In production, never alter/drop tables — only create if not exists.
  await sequelize.sync({ alter: process.env.NODE_ENV !== 'production' });
  console.log('Database synced successfully.');

  // Seed default user if not exists
  let mockUser = await User.findByPk(SEEDED_USER_UUID);
  const existingUserWithEmail = await User.findOne({ where: { email: 'user@stocked.com' } });

  if (existingUserWithEmail && existingUserWithEmail.id !== SEEDED_USER_UUID) {
    if (process.env.NODE_ENV !== 'production') {
      // Non-destructively rename the conflicting email to free the seed address
      existingUserWithEmail.email = `${existingUserWithEmail.email}.seed-conflict`;
      await existingUserWithEmail.save();
      mockUser = null;
    } else {
      mockUser = existingUserWithEmail;
    }
  }

  let mockAdmin = await User.findByPk(SEEDED_ADMIN_UUID);
  const existingAdminWithEmail = await User.findOne({ where: { email: 'admin@stocked.com' } });

  if (existingAdminWithEmail && existingAdminWithEmail.id !== SEEDED_ADMIN_UUID) {
    if (process.env.NODE_ENV !== 'production') {
      // Non-destructively rename the conflicting email to free the seed address
      existingAdminWithEmail.email = `${existingAdminWithEmail.email}.seed-conflict`;
      await existingAdminWithEmail.save();
      mockAdmin = null;
    } else {
      mockAdmin = existingAdminWithEmail;
    }
  }

  if (!mockUser) {
    // Generate secure cryptographically hashed passwords for seeding
    const userPasswordHash = await bcrypt.hash('UserPassword123!', 12);
    const adminPasswordHash = await bcrypt.hash('AdminPassword123!', 12);

    // Create user
    await User.create({
      id: SEEDED_USER_UUID,
      email: 'user@stocked.com',
      passwordHash: userPasswordHash,
      role: 'user',
    });
    console.log(`Default mock user (${SEEDED_USER_UUID}) seeded.`);

    // Create administrator
    if (!mockAdmin) {
      await User.create({
        id: SEEDED_ADMIN_UUID,
        email: 'admin@stocked.com',
        passwordHash: adminPasswordHash,
        role: 'admin',
      });
      console.log(`Default administrator user (${SEEDED_ADMIN_UUID}) seeded.`);
    }

    // Seed some initial stocks so there's rich data out of the box
    const apple = await Stock.create({
      id: 'a9f24300-d85f-4029-9e8c-8c0827284ea4',
      userId: SEEDED_USER_UUID,
      name: 'Apple Inc.',
      symbol: 'AAPL',
      description: 'Consumer electronics and software giant.',
      category: 'Technology',
    });

    const tesla = await Stock.create({
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
    const formatDate = (daysAgo: number) => {
      const d = new Date();
      d.setDate(today.getDate() - daysAgo);
      return d.toISOString().split('T')[0];
    };

    // AAPL Price History
    await DailyPrice.bulkCreate([
      { id: '1a111111-1111-1111-1111-111111111111', stockId: apple.id, userId: SEEDED_USER_UUID, date: formatDate(5), price: 175.50, volume: 52000000, source: 'manual' },
      { id: '1a111111-1111-1111-1111-222222222222', stockId: apple.id, userId: SEEDED_USER_UUID, date: formatDate(4), price: 177.20, volume: 48000000, source: 'manual' },
      { id: '1a111111-1111-1111-1111-333333333333', stockId: apple.id, userId: SEEDED_USER_UUID, date: formatDate(3), price: 176.80, volume: 43000000, source: 'api' },
      { id: '1a111111-1111-1111-1111-444444444444', stockId: apple.id, userId: SEEDED_USER_UUID, date: formatDate(2), price: 178.45, volume: 55000000, source: 'api' },
      { id: '1a111111-1111-1111-1111-555555555555', stockId: apple.id, userId: SEEDED_USER_UUID, date: formatDate(1), price: 180.10, volume: 60000000, source: 'manual' },
    ]);

    // TSLA Price History
    await DailyPrice.bulkCreate([
      { id: '2b222222-2222-2222-2222-111111111111', stockId: tesla.id, userId: SEEDED_USER_UUID, date: formatDate(4), price: 185.00, volume: 85000000, source: 'manual' },
      { id: '2b222222-2222-2222-2222-222222222222', stockId: tesla.id, userId: SEEDED_USER_UUID, date: formatDate(3), price: 182.30, volume: 92000000, source: 'manual' },
      { id: '2b222222-2222-2222-2222-333333333333', stockId: tesla.id, userId: SEEDED_USER_UUID, date: formatDate(2), price: 187.60, volume: 105000000, source: 'api' },
      { id: '2b222222-2222-2222-2222-444444444444', stockId: tesla.id, userId: SEEDED_USER_UUID, date: formatDate(1), price: 191.00, volume: 99000000, source: 'manual' },
    ]);

    console.log('Initial price records seeded.');
  }
}
