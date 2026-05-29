"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Stock = void 0;
const sequelize_1 = require("sequelize");
const database_1 = require("../config/database");
const User_1 = require("./User");
class Stock extends sequelize_1.Model {
}
exports.Stock = Stock;
Stock.init({
    id: {
        type: sequelize_1.DataTypes.UUID,
        defaultValue: sequelize_1.DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
    },
    userId: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: false,
        references: {
            model: User_1.User,
            key: 'id',
        },
        onDelete: 'CASCADE',
    },
    name: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: false,
    },
    symbol: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: false,
    },
    description: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: true,
    },
    category: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: true,
    },
}, {
    sequelize: database_1.sequelize,
    modelName: 'Stock',
    tableName: 'Stocks',
    indexes: [
        {
            unique: true,
            fields: ['userId', 'symbol'],
            name: 'stocks_user_symbol_unique',
        },
    ],
});
