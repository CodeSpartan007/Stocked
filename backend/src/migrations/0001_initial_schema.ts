import { QueryInterface, DataTypes } from 'sequelize';

export const up = async ({ context: queryInterface }: { context: QueryInterface }): Promise<void> => {
  const tableExists = async (tableName: string) => {
    try {
      await queryInterface.describeTable(tableName);
      return true;
    } catch {
      return false;
    }
  };

  // 1. Users table
  if (!(await tableExists('Users'))) {
    await queryInterface.createTable('Users', {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
      },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      passwordHash: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      role: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'user',
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
    });
  }

  // 2. Stocks table
  if (!(await tableExists('Stocks'))) {
    await queryInterface.createTable('Stocks', {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'Users',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      symbol: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      category: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
    });

    try {
      await queryInterface.addIndex('Stocks', ['userId', 'symbol'], {
        unique: true,
        name: 'stocks_user_symbol_unique',
      });
    } catch {
      // Ignore if index already exists
    }
  }

  // 3. DailyPrices table (base schema without change & changePercent)
  if (!(await tableExists('DailyPrices'))) {
    await queryInterface.createTable('DailyPrices', {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'Users',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      stockId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'Stocks',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      price: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
      },
      volume: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      source: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
    });

    try {
      await queryInterface.addIndex('DailyPrices', ['stockId', 'date'], {
        unique: true,
        name: 'daily_prices_stock_date_unique',
      });
    } catch {
      // Ignore if index already exists
    }
  }

  // 4. Purchases table
  if (!(await tableExists('Purchases'))) {
    await queryInterface.createTable('Purchases', {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'Users',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      stockId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'Stocks',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      purchaseDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      purchasePrice: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
      },
      quantity: {
        type: DataTypes.DECIMAL(12, 4),
        allowNull: false,
      },
      fees: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0.00,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
    });
  }

  // 5. Sales table
  if (!(await tableExists('Sales'))) {
    await queryInterface.createTable('Sales', {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'Users',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      stockId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'Stocks',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      saleDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      sellPrice: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
      },
      quantity: {
        type: DataTypes.DECIMAL(12, 4),
        allowNull: false,
      },
      fees: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0.00,
      },
      realizedGainLoss: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
    });
  }

  // 6. PerformanceTargets table
  if (!(await tableExists('PerformanceTargets'))) {
    await queryInterface.createTable('PerformanceTargets', {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'Users',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      targetType: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      targetValue: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
      },
      targetDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      isAchieved: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
    });
  }

  // 7. UserSettings table (base schema without costBasisMethod)
  if (!(await tableExists('UserSettings'))) {
    await queryInterface.createTable('UserSettings', {
      userId: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
        references: {
          model: 'Users',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      provider: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'manual',
      },
      apiKey: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      refreshInterval: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 60,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
    });
  }

  // 8. ExportLogs table
  if (!(await tableExists('ExportLogs'))) {
    await queryInterface.createTable('ExportLogs', {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'Users',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      exportType: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      fileName: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      errorMessage: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
    });
  }
};

export const down = async ({ context: queryInterface }: { context: QueryInterface }): Promise<void> => {
  const tableExists = async (tableName: string) => {
    try {
      await queryInterface.describeTable(tableName);
      return true;
    } catch {
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
