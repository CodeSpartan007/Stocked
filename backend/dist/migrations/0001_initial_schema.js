"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.down = exports.up = void 0;
const sequelize_1 = require("sequelize");
const up = async ({ context: queryInterface }) => {
    const tableExists = async (tableName) => {
        try {
            await queryInterface.describeTable(tableName);
            return true;
        }
        catch {
            return false;
        }
    };
    // 1. Users table
    if (!(await tableExists('Users'))) {
        await queryInterface.createTable('Users', {
            id: {
                type: sequelize_1.DataTypes.UUID,
                primaryKey: true,
                allowNull: false,
            },
            email: {
                type: sequelize_1.DataTypes.STRING,
                allowNull: false,
                unique: true,
            },
            passwordHash: {
                type: sequelize_1.DataTypes.STRING,
                allowNull: false,
            },
            role: {
                type: sequelize_1.DataTypes.STRING,
                allowNull: false,
                defaultValue: 'user',
            },
            createdAt: {
                type: sequelize_1.DataTypes.DATE,
                allowNull: false,
            },
            updatedAt: {
                type: sequelize_1.DataTypes.DATE,
                allowNull: false,
            },
        });
    }
    // 2. Stocks table
    if (!(await tableExists('Stocks'))) {
        await queryInterface.createTable('Stocks', {
            id: {
                type: sequelize_1.DataTypes.UUID,
                primaryKey: true,
                allowNull: false,
            },
            userId: {
                type: sequelize_1.DataTypes.UUID,
                allowNull: false,
                references: {
                    model: 'Users',
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
                allowNull: false,
            },
            createdAt: {
                type: sequelize_1.DataTypes.DATE,
                allowNull: false,
            },
            updatedAt: {
                type: sequelize_1.DataTypes.DATE,
                allowNull: false,
            },
        });
    }
    // 3. DailyPrices table (base schema without change & changePercent)
    if (!(await tableExists('DailyPrices'))) {
        await queryInterface.createTable('DailyPrices', {
            id: {
                type: sequelize_1.DataTypes.UUID,
                primaryKey: true,
                allowNull: false,
            },
            userId: {
                type: sequelize_1.DataTypes.UUID,
                allowNull: false,
                references: {
                    model: 'Users',
                    key: 'id',
                },
                onDelete: 'CASCADE',
            },
            stockId: {
                type: sequelize_1.DataTypes.UUID,
                allowNull: false,
                references: {
                    model: 'Stocks',
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
            },
            volume: {
                type: sequelize_1.DataTypes.INTEGER,
                allowNull: false,
            },
            source: {
                type: sequelize_1.DataTypes.STRING,
                allowNull: false,
            },
            createdAt: {
                type: sequelize_1.DataTypes.DATE,
                allowNull: false,
            },
            updatedAt: {
                type: sequelize_1.DataTypes.DATE,
                allowNull: false,
            },
        });
    }
    // 4. Purchases table
    if (!(await tableExists('Purchases'))) {
        await queryInterface.createTable('Purchases', {
            id: {
                type: sequelize_1.DataTypes.UUID,
                primaryKey: true,
                allowNull: false,
            },
            userId: {
                type: sequelize_1.DataTypes.UUID,
                allowNull: false,
                references: {
                    model: 'Users',
                    key: 'id',
                },
                onDelete: 'CASCADE',
            },
            stockId: {
                type: sequelize_1.DataTypes.UUID,
                allowNull: false,
                references: {
                    model: 'Stocks',
                    key: 'id',
                },
                onDelete: 'CASCADE',
            },
            purchaseDate: {
                type: sequelize_1.DataTypes.DATEONLY,
                allowNull: false,
            },
            purchasePrice: {
                type: sequelize_1.DataTypes.DECIMAL(12, 2),
                allowNull: false,
            },
            quantity: {
                type: sequelize_1.DataTypes.DECIMAL(12, 4),
                allowNull: false,
            },
            fees: {
                type: sequelize_1.DataTypes.DECIMAL(12, 2),
                allowNull: false,
                defaultValue: 0.00,
            },
            createdAt: {
                type: sequelize_1.DataTypes.DATE,
                allowNull: false,
            },
            updatedAt: {
                type: sequelize_1.DataTypes.DATE,
                allowNull: false,
            },
        });
    }
    // 5. Sales table
    if (!(await tableExists('Sales'))) {
        await queryInterface.createTable('Sales', {
            id: {
                type: sequelize_1.DataTypes.UUID,
                primaryKey: true,
                allowNull: false,
            },
            userId: {
                type: sequelize_1.DataTypes.UUID,
                allowNull: false,
                references: {
                    model: 'Users',
                    key: 'id',
                },
                onDelete: 'CASCADE',
            },
            stockId: {
                type: sequelize_1.DataTypes.UUID,
                allowNull: false,
                references: {
                    model: 'Stocks',
                    key: 'id',
                },
                onDelete: 'CASCADE',
            },
            saleDate: {
                type: sequelize_1.DataTypes.DATEONLY,
                allowNull: false,
            },
            sellPrice: {
                type: sequelize_1.DataTypes.DECIMAL(12, 2),
                allowNull: false,
            },
            quantity: {
                type: sequelize_1.DataTypes.DECIMAL(12, 4),
                allowNull: false,
            },
            fees: {
                type: sequelize_1.DataTypes.DECIMAL(12, 2),
                allowNull: false,
                defaultValue: 0.00,
            },
            realizedGainLoss: {
                type: sequelize_1.DataTypes.DECIMAL(12, 2),
                allowNull: false,
            },
            createdAt: {
                type: sequelize_1.DataTypes.DATE,
                allowNull: false,
            },
            updatedAt: {
                type: sequelize_1.DataTypes.DATE,
                allowNull: false,
            },
        });
    }
    // 6. PerformanceTargets table
    if (!(await tableExists('PerformanceTargets'))) {
        await queryInterface.createTable('PerformanceTargets', {
            id: {
                type: sequelize_1.DataTypes.UUID,
                primaryKey: true,
                allowNull: false,
            },
            userId: {
                type: sequelize_1.DataTypes.UUID,
                allowNull: false,
                references: {
                    model: 'Users',
                    key: 'id',
                },
                onDelete: 'CASCADE',
            },
            targetType: {
                type: sequelize_1.DataTypes.STRING,
                allowNull: false,
            },
            targetValue: {
                type: sequelize_1.DataTypes.DECIMAL(12, 2),
                allowNull: false,
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
            createdAt: {
                type: sequelize_1.DataTypes.DATE,
                allowNull: false,
            },
            updatedAt: {
                type: sequelize_1.DataTypes.DATE,
                allowNull: false,
            },
        });
    }
    // 7. UserSettings table (base schema without costBasisMethod)
    if (!(await tableExists('UserSettings'))) {
        await queryInterface.createTable('UserSettings', {
            userId: {
                type: sequelize_1.DataTypes.UUID,
                primaryKey: true,
                allowNull: false,
                references: {
                    model: 'Users',
                    key: 'id',
                },
                onDelete: 'CASCADE',
            },
            provider: {
                type: sequelize_1.DataTypes.STRING,
                allowNull: false,
                defaultValue: 'manual',
            },
            apiKey: {
                type: sequelize_1.DataTypes.TEXT,
                allowNull: true,
            },
            refreshInterval: {
                type: sequelize_1.DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 60,
            },
            createdAt: {
                type: sequelize_1.DataTypes.DATE,
                allowNull: false,
            },
            updatedAt: {
                type: sequelize_1.DataTypes.DATE,
                allowNull: false,
            },
        });
    }
    // 8. ExportLogs table
    if (!(await tableExists('ExportLogs'))) {
        await queryInterface.createTable('ExportLogs', {
            id: {
                type: sequelize_1.DataTypes.UUID,
                primaryKey: true,
                allowNull: false,
            },
            userId: {
                type: sequelize_1.DataTypes.UUID,
                allowNull: false,
                references: {
                    model: 'Users',
                    key: 'id',
                },
                onDelete: 'CASCADE',
            },
            exportType: {
                type: sequelize_1.DataTypes.STRING,
                allowNull: false,
            },
            fileName: {
                type: sequelize_1.DataTypes.STRING,
                allowNull: false,
            },
            status: {
                type: sequelize_1.DataTypes.STRING,
                allowNull: false,
            },
            errorMessage: {
                type: sequelize_1.DataTypes.TEXT,
                allowNull: true,
            },
            createdAt: {
                type: sequelize_1.DataTypes.DATE,
                allowNull: false,
            },
            updatedAt: {
                type: sequelize_1.DataTypes.DATE,
                allowNull: false,
            },
        });
    }
};
exports.up = up;
const down = async ({ context: queryInterface }) => {
    const tableExists = async (tableName) => {
        try {
            await queryInterface.describeTable(tableName);
            return true;
        }
        catch {
            return false;
        }
    };
    const tablesToDrop = [
        'Sales',
        'Purchases',
        'DailyPrices',
        'ExportLogs',
        'PerformanceTargets',
        'UserSettings',
        'Stocks',
        'Users',
    ];
    for (const table of tablesToDrop) {
        if (await tableExists(table)) {
            await queryInterface.dropTable(table, { cascade: true });
        }
    }
};
exports.down = down;
