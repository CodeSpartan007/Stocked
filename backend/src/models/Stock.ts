import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { User } from './User';

export class Stock extends Model {
  declare id: string;
  declare userId: string;
  declare name: string;
  declare symbol: string;
  declare description: string | null;
  declare category: string | null;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Stock.init(
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
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'Stock',
    tableName: 'Stocks',
    indexes: [
      {
        unique: true,
        fields: ['userId', 'symbol'],
        name: 'stocks_user_symbol_unique',
      },
    ],
  }
);
