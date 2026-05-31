"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PerformanceTarget = void 0;
const sequelize_1 = require("sequelize");
const database_1 = require("../config/database");
const User_1 = require("./User");
class PerformanceTarget extends sequelize_1.Model {
}
exports.PerformanceTarget = PerformanceTarget;
PerformanceTarget.init({
    id: {
        type: sequelize_1.DataTypes.UUID,
        defaultValue: sequelize_1.DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
    },
    userId: {
        type: sequelize_1.DataTypes.UUID,
        allowNull: false,
        references: {
            model: User_1.User,
            key: 'id',
        },
        onDelete: 'CASCADE',
    },
    targetName: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: false,
    },
    targetType: {
        type: sequelize_1.DataTypes.ENUM('portfolio_value', 'total_return', 'annualized_return'),
        allowNull: false,
        validate: {
            isIn: [['portfolio_value', 'total_return', 'annualized_return']],
        },
    },
    targetValue: {
        type: sequelize_1.DataTypes.DECIMAL(12, 4),
        allowNull: false,
        validate: {
            gtZero(value) {
                if (Number(value) <= 0) {
                    throw new Error('Target value must be greater than 0.');
                }
            }
        },
    },
    targetDate: {
        type: sequelize_1.DataTypes.DATEONLY,
        allowNull: false,
    },
    isAchieved: {
        type: sequelize_1.DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
}, {
    sequelize: database_1.sequelize,
    modelName: 'PerformanceTarget',
    tableName: 'PerformanceTargets',
});
