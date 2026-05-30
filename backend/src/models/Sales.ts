import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { Stock } from './Stock';

export class Sales extends Model {
  declare id: string;
  declare stockId: string;
  declare quantity: number;
  declare sellPrice: number;
  declare saleDate: string; // YYYY-MM-DD format
  declare profitLoss: number;
  declare Stock?: Stock;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Sales.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
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
    quantity: {
      type: DataTypes.DECIMAL(12, 4),
      allowNull: false,
      validate: {
        min: 0.0001,
      },
    },
    sellPrice: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      validate: {
        min: 0.01,
      },
    },
    saleDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    profitLoss: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: 'Sales',
    tableName: 'Sales',
  }
);
