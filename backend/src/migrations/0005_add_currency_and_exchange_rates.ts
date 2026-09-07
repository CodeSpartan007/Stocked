import { QueryInterface, DataTypes } from 'sequelize';
import { NSE_SYMBOLS_SET } from '../services/nseScraperService';

export const up = async ({ context: queryInterface }: { context: QueryInterface }): Promise<void> => {
  const sequelize = queryInterface.sequelize;
  const isSqlite = sequelize.getDialect() === 'sqlite';
  const quote = isSqlite ? '`' : '"';

  // 1. UserSettings columns
  const userSettingsCols = await queryInterface.describeTable('UserSettings');

  if (!userSettingsCols.baseCurrency) {
    await queryInterface.addColumn('UserSettings', 'baseCurrency', {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: 'USD',
    });
  }

  if (!userSettingsCols.exchangeRate) {
    await queryInterface.addColumn('UserSettings', 'exchangeRate', {
      type: DataTypes.DECIMAL(12, 4),
      allowNull: false,
      defaultValue: 130.0,
    });
  }

  if (!userSettingsCols.customExchangeRate) {
    await queryInterface.addColumn('UserSettings', 'customExchangeRate', {
      type: DataTypes.DECIMAL(12, 4),
      allowNull: true,
      defaultValue: null,
    });
  }

  if (!userSettingsCols.exchangeRateUpdatedAt) {
    await queryInterface.addColumn('UserSettings', 'exchangeRateUpdatedAt', {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    });
  }

  // 2. Stocks columns
  const stocksCols = await queryInterface.describeTable('Stocks');

  if (!stocksCols.currency) {
    await queryInterface.addColumn('Stocks', 'currency', {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: 'USD',
    });
  }

  // Backfill: Detect existing NSE stocks and set currency = 'KES'
  try {
    const [stocks] = (await sequelize.query(
      `SELECT ${quote}id${quote}, ${quote}symbol${quote} FROM ${quote}Stocks${quote}`
    )) as [Array<{ id: string; symbol: string }>, unknown];

    for (const stock of stocks) {
      const sym = (stock.symbol || '').trim().toUpperCase();
      const cleanSym = sym.replace(/\.(NR|NSE|XNA|NA)$/i, '').replace(/^(NSE|NSEKE):/i, '').replace(/:NSE$/i, '');
      const isNse =
        NSE_SYMBOLS_SET.has(cleanSym) ||
        sym.endsWith('.NR') ||
        sym.endsWith('.NSE') ||
        sym.startsWith('NSE:') ||
        sym.startsWith('NSEKE:');

      if (isNse) {
        await sequelize.query(
          `UPDATE ${quote}Stocks${quote} SET ${quote}currency${quote} = 'KES' WHERE ${quote}id${quote} = :id`,
          { replacements: { id: stock.id } }
        );
      }
    }
  } catch (err) {
    console.warn('[Migration 0005] Warning during Stocks currency backfill:', err);
  }

  // 3. PerformanceTargets columns
  const performanceTargetsCols = await queryInterface.describeTable('PerformanceTargets');

  if (!performanceTargetsCols.currency) {
    await queryInterface.addColumn('PerformanceTargets', 'currency', {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: 'USD',
    });
  }
};

export const down = async ({ context: queryInterface }: { context: QueryInterface }): Promise<void> => {
  const userSettingsCols = await queryInterface.describeTable('UserSettings');
  if (userSettingsCols.exchangeRateUpdatedAt) {
    await queryInterface.removeColumn('UserSettings', 'exchangeRateUpdatedAt');
  }
  if (userSettingsCols.customExchangeRate) {
    await queryInterface.removeColumn('UserSettings', 'customExchangeRate');
  }
  if (userSettingsCols.exchangeRate) {
    await queryInterface.removeColumn('UserSettings', 'exchangeRate');
  }
  if (userSettingsCols.baseCurrency) {
    await queryInterface.removeColumn('UserSettings', 'baseCurrency');
  }

  const stocksCols = await queryInterface.describeTable('Stocks');
  if (stocksCols.currency) {
    await queryInterface.removeColumn('Stocks', 'currency');
  }

  const performanceTargetsCols = await queryInterface.describeTable('PerformanceTargets');
  if (performanceTargetsCols.currency) {
    await queryInterface.removeColumn('PerformanceTargets', 'currency');
  }
};
