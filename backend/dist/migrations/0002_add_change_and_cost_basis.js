"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.down = exports.up = void 0;
const sequelize_1 = require("sequelize");
const up = async ({ context: queryInterface }) => {
    // Check and add columns to DailyPrices
    const dailyPricesCols = await queryInterface.describeTable('DailyPrices');
    if (!dailyPricesCols.change) {
        await queryInterface.addColumn('DailyPrices', 'change', {
            type: sequelize_1.DataTypes.DECIMAL(12, 2),
            allowNull: false,
            defaultValue: 0.00,
        });
    }
    if (!dailyPricesCols.changePercent) {
        await queryInterface.addColumn('DailyPrices', 'changePercent', {
            type: sequelize_1.DataTypes.DECIMAL(12, 2),
            allowNull: false,
            defaultValue: 0.00,
        });
    }
    // Check and add costBasisMethod to UserSettings
    const userSettingsCols = await queryInterface.describeTable('UserSettings');
    if (!userSettingsCols.costBasisMethod) {
        await queryInterface.addColumn('UserSettings', 'costBasisMethod', {
            type: sequelize_1.DataTypes.STRING(20),
            allowNull: false,
            defaultValue: 'average',
        });
    }
};
exports.up = up;
const down = async ({ context: queryInterface }) => {
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
exports.down = down;
