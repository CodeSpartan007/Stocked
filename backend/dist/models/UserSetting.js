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
        type: sequelize_1.DataTypes.ENUM('alphavantage', 'polygon', 'nse', 'manual'),
        allowNull: false,
        defaultValue: 'manual',
    },
    apiKey: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: true,
        get() {
            const rawValue = this.getDataValue('apiKey');
            const userId = this.getDataValue('userId') || this.userId;
            if (rawValue) {
                return (0, crypto_1.decrypt)(rawValue, userId);
            }
            const provider = this.getDataValue('provider');
            if (provider === 'alphavantage') {
                return this.alphaVantageApiKey;
            }
            else if (provider === 'polygon') {
                return this.polygonApiKey;
            }
            return null;
        },
        set(value) {
            const userId = this.getDataValue('userId') || this.userId;
            if (value) {
                this.setDataValue('apiKey', (0, crypto_1.encrypt)(value, userId));
            }
            else {
                this.setDataValue('apiKey', null);
            }
        },
    },
    alphaVantageApiKey: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: true,
        get() {
            const rawValue = this.getDataValue('alphaVantageApiKey');
            const userId = this.getDataValue('userId') || this.userId;
            if (rawValue) {
                return (0, crypto_1.decrypt)(rawValue, userId);
            }
            const provider = this.getDataValue('provider');
            if (provider === 'alphavantage') {
                const rawLegacy = this.getDataValue('apiKey');
                return rawLegacy ? (0, crypto_1.decrypt)(rawLegacy, userId) : null;
            }
            return null;
        },
        set(value) {
            const userId = this.getDataValue('userId') || this.userId;
            if (value) {
                this.setDataValue('alphaVantageApiKey', (0, crypto_1.encrypt)(value, userId));
            }
            else {
                this.setDataValue('alphaVantageApiKey', null);
            }
        },
    },
    polygonApiKey: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: true,
        get() {
            const rawValue = this.getDataValue('polygonApiKey');
            const userId = this.getDataValue('userId') || this.userId;
            if (rawValue) {
                return (0, crypto_1.decrypt)(rawValue, userId);
            }
            const provider = this.getDataValue('provider');
            if (provider === 'polygon') {
                const rawLegacy = this.getDataValue('apiKey');
                return rawLegacy ? (0, crypto_1.decrypt)(rawLegacy, userId) : null;
            }
            return null;
        },
        set(value) {
            const userId = this.getDataValue('userId') || this.userId;
            if (value) {
                this.setDataValue('polygonApiKey', (0, crypto_1.encrypt)(value, userId));
            }
            else {
                this.setDataValue('polygonApiKey', null);
            }
        },
    },
    autoSwitchOnRateLimit: {
        type: sequelize_1.DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
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
    baseCurrency: {
        type: sequelize_1.DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'USD',
    },
    exchangeRate: {
        type: sequelize_1.DataTypes.DECIMAL(12, 4),
        allowNull: false,
        defaultValue: 130.00,
    },
    customExchangeRate: {
        type: sequelize_1.DataTypes.DECIMAL(12, 4),
        allowNull: true,
        defaultValue: null,
    },
    exchangeRateUpdatedAt: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: true,
        defaultValue: null,
    },
}, {
    sequelize: database_1.sequelize,
    modelName: 'UserSetting',
    tableName: 'UserSettings',
    defaultScope: {
        attributes: { exclude: ['apiKey', 'alphaVantageApiKey', 'polygonApiKey'] },
    },
    scopes: {
        withApiKey: {
            attributes: { include: ['apiKey', 'alphaVantageApiKey', 'polygonApiKey'] },
        },
    },
});
UserSetting.beforeSave((instance) => {
    const userId = instance.getDataValue('userId') || instance.userId;
    if (!userId)
        return;
    // Synchronize legacy apiKey column with active provider credentials
    if (instance.provider === 'alphavantage') {
        const avRaw = instance.getDataValue('alphaVantageApiKey');
        if (avRaw) {
            instance.setDataValue('apiKey', avRaw);
        }
        else if (instance.getDataValue('apiKey')) {
            instance.setDataValue('alphaVantageApiKey', instance.getDataValue('apiKey'));
        }
    }
    else if (instance.provider === 'polygon') {
        const polyRaw = instance.getDataValue('polygonApiKey');
        if (polyRaw) {
            instance.setDataValue('apiKey', polyRaw);
        }
        else if (instance.getDataValue('apiKey')) {
            instance.setDataValue('polygonApiKey', instance.getDataValue('apiKey'));
        }
    }
});
