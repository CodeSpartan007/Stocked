import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { Stock } from './Stock';
import { User } from './User';

export class DailyPrice extends Model {
  declare id: string;
  declare userId: string;
  declare stockId: string;
  declare date: string; // YYYY-MM-DD format
  declare price: number;
  declare change: number;
  declare changePercent: number;
  declare volume: number;
  declare source: 'manual' | 'api';

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

DailyPrice.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: User,
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    stockId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: Stock,
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
      validate: {
        min: 0.01,
      },
    },
    change: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.00,
    },
    changePercent: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.00,
    },
    volume: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 0,
      },
    },
    source: {
      type: DataTypes.ENUM('manual', 'api'),
      allowNull: false,
      defaultValue: 'manual',
      validate: {
        isIn: [['manual', 'api']],
      },
    },
  },
  {
    sequelize,
    modelName: 'DailyPrice',
    tableName: 'DailyPrices',
    indexes: [
      {
        unique: true,
        fields: ['stockId', 'date'],
        name: 'daily_prices_stock_date_unique',
      },
    ],
  }
);
