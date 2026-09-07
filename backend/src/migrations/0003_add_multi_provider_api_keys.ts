import { QueryInterface, DataTypes } from 'sequelize';

export const up = async ({ context: queryInterface }: { context: QueryInterface }): Promise<void> => {
  const userSettingsCols = await queryInterface.describeTable('UserSettings');

  if (!userSettingsCols.alphaVantageApiKey) {
    await queryInterface.addColumn('UserSettings', 'alphaVantageApiKey', {
      type: DataTypes.TEXT,
      allowNull: true,
    });
  }

  if (!userSettingsCols.polygonApiKey) {
    await queryInterface.addColumn('UserSettings', 'polygonApiKey', {
      type: DataTypes.TEXT,
      allowNull: true,
    });
  }

  if (!userSettingsCols.autoSwitchOnRateLimit) {
    await queryInterface.addColumn('UserSettings', 'autoSwitchOnRateLimit', {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });
  }

  // Non-destructive data migration: copy existing single apiKey into the respective provider column
  try {
    const isSqlite = queryInterface.sequelize.getDialect() === 'sqlite';
    const quote = isSqlite ? '`' : '"';

    await queryInterface.sequelize.query(
      `UPDATE ${quote}UserSettings${quote} SET ${quote}alphaVantageApiKey${quote} = ${quote}apiKey${quote} WHERE ${quote}provider${quote} = 'alphavantage' AND ${quote}apiKey${quote} IS NOT NULL`
    );

    await queryInterface.sequelize.query(
      `UPDATE ${quote}UserSettings${quote} SET ${quote}polygonApiKey${quote} = ${quote}apiKey${quote} WHERE ${quote}provider${quote} = 'polygon' AND ${quote}apiKey${quote} IS NOT NULL`
    );
  } catch (err) {
    console.warn('[Migration 0003] Warning migrating legacy single apiKey to multi-provider columns:', err);
  }
};

export const down = async ({ context: queryInterface }: { context: QueryInterface }): Promise<void> => {
  const userSettingsCols = await queryInterface.describeTable('UserSettings');

  if (userSettingsCols.autoSwitchOnRateLimit) {
    await queryInterface.removeColumn('UserSettings', 'autoSwitchOnRateLimit');
  }

  if (userSettingsCols.polygonApiKey) {
    await queryInterface.removeColumn('UserSettings', 'polygonApiKey');
  }

  if (userSettingsCols.alphaVantageApiKey) {
    await queryInterface.removeColumn('UserSettings', 'alphaVantageApiKey');
  }
};
