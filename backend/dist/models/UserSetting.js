"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserSetting = void 0;
const sequelize_1 = require("sequelize");
const database_1 = require("../config/database");
const User_1 = require("./User");
class UserSetting extends sequelize_1.Model {
}
exports.UserSetting = UserSetting;
UserSetting.init({
    userId: {
        type: sequelize_1.DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
        references: {
            model: User_1.User,
            key: 'id',
        },
        onDelete: 'CASCADE',
    },
    provider: {
        type: sequelize_1.DataTypes.ENUM('alphavantage', 'polygon', 'manual'),
        allowNull: false,
        defaultValue: 'manual',
    },
    apiKey: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: true,
    },
    refreshInterval: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 60,
    },
}, {
    sequelize: database_1.sequelize,
    modelName: 'UserSetting',
    tableName: 'UserSettings',
});
