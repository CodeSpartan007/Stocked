"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DailyPrice = void 0;
const sequelize_1 = require("sequelize");
const database_1 = require("../config/database");
const Stock_1 = require("./Stock");
class DailyPrice extends sequelize_1.Model {
}
exports.DailyPrice = DailyPrice;
DailyPrice.init({
    id: {
        type: sequelize_1.DataTypes.UUID,
        defaultValue: sequelize_1.DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
    },
    stockId: {
        type: sequelize_1.DataTypes.UUID,
        allowNull: false,
        references: {
            model: Stock_1.Stock,
            key: 'id',
        },
        onDelete: 'CASCADE',
    },
    date: {
        type: sequelize_1.DataTypes.DATEONLY,
        allowNull: false,
    },
    price: {
        type: sequelize_1.DataTypes.DECIMAL(12, 2),
        allowNull: false,
        validate: {
            min: 0.01,
        },
    },
    volume: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
        validate: {
            min: 0,
        },
    },
    source: {
        type: sequelize_1.DataTypes.ENUM('manual', 'api'),
        allowNull: false,
        defaultValue: 'manual',
        validate: {
            isIn: [['manual', 'api']],
        },
    },
}, {
    sequelize: database_1.sequelize,
    modelName: 'DailyPrice',
    tableName: 'DailyPrices',
    indexes: [
        {
            unique: true,
            fields: ['stockId', 'date'],
            name: 'daily_prices_stock_date_unique',
        },
    ],
});
