"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExportLogs = void 0;
const sequelize_1 = require("sequelize");
const database_1 = require("../config/database");
const User_1 = require("./User");
class ExportLogs extends sequelize_1.Model {
}
exports.ExportLogs = ExportLogs;
ExportLogs.init({
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
    exportType: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: false,
    },
    generatedAt: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize_1.DataTypes.NOW,
    },
    filename: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: false,
    },
}, {
    sequelize: database_1.sequelize,
    modelName: 'ExportLogs',
    tableName: 'ExportLogs',
});
