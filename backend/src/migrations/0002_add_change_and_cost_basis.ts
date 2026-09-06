import { QueryInterface, DataTypes } from 'sequelize';

export const up = async ({ context: queryInterface }: { context: QueryInterface }): Promise<void> => {
  // Check and add columns to DailyPrices
  const dailyPricesCols = await queryInterface.describeTable('DailyPrices');
  
  if (!dailyPricesCols.change) {
    await queryInterface.addColumn('DailyPrices', 'change', {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.00,
    });
  }

  if (!dailyPricesCols.changePercent) {
    await queryInterface.addColumn('DailyPrices', 'changePercent', {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.00,
    });
  }

  // Check and add costBasisMethod to UserSettings
  const userSettingsCols = await queryInterface.describeTable('UserSettings');

  if (!userSettingsCols.costBasisMethod) {
    await queryInterface.addColumn('UserSettings', 'costBasisMethod', {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'average',
    });
  }
};

export const down = async ({ context: queryInterface }: { context: QueryInterface }): Promise<void> => {
  const dailyPricesCols = await queryInterface.describeTable('DailyPrices');

  if (dailyPricesCols.changePercent) {
    await queryInterface.removeColumn('DailyPrices', 'changePercent');
  }

  if (dailyPricesCols.change) {
    await queryInterface.removeColumn('DailyPrices', 'change');
  }

  const userSettingsCols = await queryInterface.describeTable('UserSettings');

  if (userSettingsCols.costBasisMethod) {
    await queryInterface.removeColumn('UserSettings', 'costBasisMethod');
  }
};
