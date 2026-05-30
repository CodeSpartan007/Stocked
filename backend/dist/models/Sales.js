"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Sales = void 0;
const sequelize_1 = require("sequelize");
const database_1 = require("../config/database");
const Stock_1 = require("./Stock");
class Sales extends sequelize_1.Model {
}
exports.Sales = Sales;
Sales.init({
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
    quantity: {
        type: sequelize_1.DataTypes.DECIMAL(12, 4),
        allowNull: false,
        validate: {
            min: 0.0001,
        },
    },
    sellPrice: {
        type: sequelize_1.DataTypes.DECIMAL(12, 2),
        allowNull: false,
        validate: {
            min: 0.01,
        },
    },
    saleDate: {
        type: sequelize_1.DataTypes.DATEONLY,
        allowNull: false,
    },
    profitLoss: {
        type: sequelize_1.DataTypes.DECIMAL(12, 2),
        allowNull: false,
    },
}, {
    sequelize: database_1.sequelize,
    modelName: 'Sales',
    tableName: 'Sales',
});
