"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserSetting = void 0;
const sequelize_1 = require("sequelize");
const database_1 = require("../config/database");
const User_1 = require("./User");
const crypto_1 = require("../utils/crypto");
class UserSetting extends sequelize_1.Model {
}
exports.UserSetting = UserSetting;
UserSetting.init({
    userId: {
        type: sequelize_1.DataTypes.UUID,
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
        type: sequelize_1.DataTypes.TEXT,
        allowNull: true,
        get() {
            const rawValue = this.getDataValue('apiKey');
            const userId = this.getDataValue('userId') || this.userId;
            return rawValue ? (0, crypto_1.decrypt)(rawValue, userId) : null;
        },
        set(value) {
            if (value) {
                const userId = this.getDataValue('userId') || this.userId;
                this.setDataValue('apiKey', (0, crypto_1.encrypt)(value, userId));
            }
            else {
                this.setDataValue('apiKey', null);
            }
        },
    },
    refreshInterval: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 60,
    },
    costBasisMethod: {
        type: sequelize_1.DataTypes.ENUM('average', 'fifo'),
        allowNull: false,
        defaultValue: 'average',
    },
}, {
    sequelize: database_1.sequelize,
    modelName: 'UserSetting',
    tableName: 'UserSettings',
    defaultScope: {
        attributes: { exclude: ['apiKey'] },
    },
    scopes: {
        withApiKey: {
            attributes: { include: ['apiKey'] },
        },
    },
});
