import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { Stock } from './Stock';

export class Purchase extends Model {
  declare id: string;
  declare stockId: string;
  declare quantity: number;
  declare purchasePrice: number;
  declare purchaseDate: string; // YYYY-MM-DD format
  declare Stock?: Stock;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Purchase.init(
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
    purchasePrice: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      validate: {
        min: 0.01,
      },
    },
    purchaseDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: 'Purchase',
    tableName: 'Purchases',
  }
);
